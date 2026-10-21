/* BE-only energy balance. Positive bo is battery output in W. */
(function(root){
  'use strict';
  const defaults={capacity:48.2,chargeEfficiency:1,dischargeEfficiency:1,maxGapMs:360000,auto:true};
  const rawValid=v=>Number.isFinite(v)&&v>=0&&v<=100;
  function valid(r){return Array.isArray(r)&&Number.isFinite(r[0])&&r[0]>0&&(Number.isFinite(r[2])||r[2]===null);}
  function energy(p0,p1,ms){
    if(p0*p1<0){const f=Math.abs(p0)/(Math.abs(p0)+Math.abs(p1)),a=energy(p0,0,ms*f),b=energy(0,p1,ms*(1-f));return {input:a.input+b.input,output:a.output+b.output};}
    const e=(p0+p1)/2*ms/3600000000;return {input:Math.max(0,-e),output:Math.max(0,e)};
  }
  function calculate(rows,settings={},manual=[]){
    const c={...defaults,...settings};if(!(c.capacity>0))throw Error('Ongeldige accucapaciteit');
    rows=[...new Map(rows.filter(valid).map(r=>[r[0],r])).values()].sort((a,b)=>a[0]-b[0]);
    const anchors=new Map(manual.filter(a=>Number.isFinite(a.t)&&rawValid(a.soc)).map(a=>[a.t,a]));
    let stored=null,input=0,output=0,gaps=0,uncertain=false,lastAnchor=null,lowMode='ready',lowMinimum=null,highMode='ready',highMaximum=null;
    const points=[],events=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i],prev=rows[i-1],raw=rawValid(r[1])?r[1]:null;let gap=false,change=null;
      if(prev){
        const dt=r[0]-prev[0];
        if(Number.isFinite(prev[2])&&Number.isFinite(r[2])){
          const e=energy(prev[2],r[2],dt);input+=e.input;output+=e.output;change=e.input-e.output;
          if(stored!==null)stored+=change;
          if(dt>c.maxGapMs){gap=true;gaps++;uncertain=true;}
        }else{gap=true;gaps++;uncertain=true;}
      }
      const explicit=anchors.get(r[0]),checkpoint=!!(explicit?.lowState||explicit?.highState);
      let anchor=explicit;
      if(stored===null&&!anchor&&raw!==null)anchor={t:r[0],soc:raw,kind:'Start uit BE-SOC'};
      const charging=change!==null?change>0:!prev&&!checkpoint&&Number.isFinite(r[2])&&r[2]<0;
      const discharging=change!==null?change<0:!prev&&!checkpoint&&Number.isFinite(r[2])&&r[2]>0;
      if(checkpoint){
        if(explicit.lowState){lowMode=explicit.lowState.mode;lowMinimum=explicit.lowState.minimum;}
        if(explicit.highState){highMode=explicit.highState.mode;highMaximum=explicit.highState.maximum;}
      }else if(explicit){lowMode=highMode='released';lowMinimum=highMaximum=null;}
      else{
        if(lowMode==='released'&&raw!==null&&raw>10&&change!==null&&change<=0&&r[2]>=0){lowMode='ready';lowMinimum=null;}
        if(highMode==='released'&&raw!==null&&raw<95&&change!==null&&change>=0&&r[2]<=0){highMode='ready';highMaximum=null;}
        if(lowMode==='ready'&&raw!==null&&raw<=10){
          if(charging)lowMode='released';
          else{lowMode='tracking';lowMinimum=raw;anchor={t:r[0],soc:raw,kind:'Laagste BE-SOC · volgen'};}
        }
        if(lowMode==='tracking'){
          if(charging)lowMode='released';
          else if(raw!==null){
            const lower=lowMinimum===null||raw<lowMinimum;if(lower)lowMinimum=raw;
            anchor={t:r[0],soc:lowMinimum,kind:'Laagste BE-SOC · volgen',silent:!lower&&anchor?.kind!=='Laagste BE-SOC · volgen'};
            highMode='ready';highMaximum=null;
          }
        }
        if(highMode==='ready'&&raw!==null&&raw>=95){
          if(discharging)highMode='released';
          else{highMode='tracking';highMaximum=raw;anchor={t:r[0],soc:raw,kind:'Hoogste BE-SOC · volgen'};}
        }
        if(highMode==='tracking'){
          if(discharging)highMode='released';
          else if(raw!==null){
            const higher=highMaximum===null||raw>highMaximum;if(higher)highMaximum=raw;
            anchor={t:r[0],soc:highMaximum,kind:'Hoogste BE-SOC · volgen',silent:!higher&&anchor?.kind!=='Hoogste BE-SOC · volgen'};
            lowMode='ready';lowMinimum=null;
          }
        }
      }
      if(anchor){
        const before=stored===null?null:stored/c.capacity*100;
        stored=c.capacity*anchor.soc/100;if(!anchor.silent||raw===anchor.soc)uncertain=false;
        if(anchor.statsReference){
          const saved=anchor.statsReference;
          lastAnchor={...saved.reference,input:input-saved.input,output:output-saved.output};
        }else{
          lastAnchor={...anchor,correction:before===null?null:anchor.soc-before,input,output};
          if(!anchor.silent)events.push(lastAnchor);
        }
      }
      points.push({t:r[0],raw,power:r[2],soc:stored===null?null:stored/c.capacity*100,input,output,gap,uncertain,anchor:anchor||null,
        lowState:{mode:lowMode,minimum:lowMinimum},highState:{mode:highMode,maximum:highMaximum},reference:lastAnchor,
        sinceInput:lastAnchor?Math.max(0,input-lastAnchor.input):0,sinceOutput:lastAnchor?Math.max(0,output-lastAnchor.output):0});
    }
    return {points,input,output,gaps,lastAnchor,events,uncertain};
  }
  function at(points,t,maxGapMs=defaults.maxGapMs){
    let lo=0,hi=points.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(points[m].t<t)lo=m+1;else hi=m-1;}
    if(points[lo]?.t===t)return points[lo].soc;
    const a=points[lo-1],b=points[lo];
    const tracking=a&&b&&((a.lowState?.mode==='tracking'&&b.lowState?.mode==='tracking')||(a.highState?.mode==='tracking'&&b.highState?.mode==='tracking'));
    if(!a||!b||a.soc===null||b.soc===null||b.gap||(b.anchor&&!tracking)||b.t-a.t>maxGapMs)return null;
    return a.soc+(b.soc-a.soc)*(t-a.t)/(b.t-a.t);
  }
  root.BEEnergySOC={defaults,valid,energy,calculate,at};
})(typeof window!=='undefined'?window:globalThis);

(function(root){
  'use strict';
  const clamp=v=>Math.max(5,Math.min(100,v));
  function project(slots,r,c,power=Infinity,now=Date.now()){
    const out=slots.map(()=>null);
    if(!r||!Number.isFinite(r.soc)||!Number.isFinite(r.t)||now-r.t>120000||r.t>now+10000||!(c.capacity>0))return out;
    let e=clamp(r.soc)/100*c.capacity,last=r.t;
    for(let k=0;k<slots.length;k++){
      const q=slots[k],end=q.t+q.dt;
      if(end<=r.t)continue;
      if(q.t>last+1||!Number.isFinite(q.load)||!Number.isFinite(q.pv)||!(q.dt>0))break;
      if(q.t>=r.t)out[k]=clamp(e/c.capacity*100);
      const fraction=(end-Math.max(q.t,r.t))/q.dt,limit=power*q.dt/3600000;
      const change=Math.max(-limit,Math.min(limit,q.pv-q.load))*fraction;
      e=Math.max(.05*c.capacity,Math.min(c.capacity,e+(change>=0?change*c.chargeEfficiency:change/c.dischargeEfficiency)));
      last=end;
    }
    return out;
  }
  root.BESOCExtras={clamp,project};
})(window);

(function(root){
  'use strict';
  const bindings=new Map(),configs=new WeakMap(),finite=Number.isFinite;
  const supported=c=>['soc-chart','soc-forecast-chart'].includes(c.canvas?.id);
  function parsed(meta,i){return meta.controller?.getParsed?meta.controller.getParsed(i):meta._parsed?.[i];}
  function bracket(meta,x){
    let lo=0,hi=(meta.data?.length||0)-1;
    while(lo<=hi){const m=(lo+hi)>>1,p=parsed(meta,m);if(!finite(p?.x))return null;if(p.x<x)lo=m+1;else hi=m-1;}
    return {left:lo-1,right:lo};
  }
  function validPoint(meta,i){const p=parsed(meta,i),e=meta.data?.[i];return finite(p?.x)&&finite(p?.y)&&e&&!e.skip;}
  function valueAt(meta,x,stepped){
    const b=bracket(meta,x);if(!b)return {value:null};
    if(parsed(meta,b.right)?.x===x)return {value:validPoint(meta,b.right)?parsed(meta,b.right).y:null};
    if(!validPoint(meta,b.left)||!validPoint(meta,b.right)||meta.data[b.right].stop)return {value:null};
    const a=parsed(meta,b.left),z=parsed(meta,b.right);if(!(z.x>a.x))return {value:null};
    const f=(x-a.x)/(z.x-a.x);
    return {value:stepped?(stepped==='after'?z.y:stepped==='middle'&&f>=.5?z.y:a.y):a.y+(z.y-a.y)*f,approx:true};
  }
  function pick(chart,pointer){
    const scale=chart.scales?.x;if(!scale)return null;
    let x=scale.getValueForPixel(pointer.x);if(!finite(x))return null;
    if(scale.type==='category')x=Math.round(x);
    // Real-time axes follow the pointer continuously. A sparse native series
    // must not pull the cursor hours away from the position being inspected.
    const px=scale.getPixelForValue(x);return finite(px)?{x,px}:null;
  }
  function info(chart,pointer){
    const selected=pick(chart,pointer);if(!selected)return null;
    const rows=[],groups=new Map();
    chart.data.datasets.forEach((d,i)=>{
      if(!chart.isDatasetVisible(i))return;
      const meta=chart.getDatasetMeta(i);if(meta.type&&meta.type!=='line')return;
      if(d.borderWidth===0||meta.dataset?.options?.borderWidth===0)return;
      const own=d.beOwnSOC,group=own?'be':'native:'+i;
      const sampled=valueAt(meta,selected.x,d.stepped??meta.dataset?.options?.stepped);
      const baseColor=own?'#0891b2':meta.dataset?.options?.borderColor||d.borderColor;
      const color=typeof baseColor==='string'?baseColor:'#6b7280';
      const y=chart.scales[meta.yAxisID||d.yAxisID||'y'];
      const row={label:own?'Coulombtelling in/uit':String(d.label||'Lijn '+(i+1)),color,...sampled,
        py:sampled.value===null?null:y?.getPixelForValue(sampled.value)};
      if(!groups.has(group)){groups.set(group,rows.length);rows.push(row);}
      else if(rows[groups.get(group)].value===null&&row.value!==null)rows[groups.get(group)]=row;
    });
    const xScale=chart.scales.x,times=configs.get(chart)?.times;
    const label=times?.[selected.x]??chart.data.labels?.[selected.x]??xScale.getLabelForValue?.(selected.x);
    const time=['time','timeseries'].includes(xScale.type)||xScale.type==='linear'&&selected.x>1e11?selected.x:typeof label==='string'&&/^\d{4}-\d\d-\d\d[T ]/.test(label)?Date.parse(label):null;
    const title=finite(time)?new Date(time).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:xScale.type==='category'?undefined:'2-digit'}):String(label??selected.x);
    return {...selected,title,rows};
  }
  function format(row){return row.value===null?'—':(row.approx?'≈ ':'')+row.value.toLocaleString('nl-NL',{maximumFractionDigits:0})+'%';}
  function hide(state){
    state.tip.style.display='none';state.cursor.style.display='none';state.pointer=null;
    state.markers.style.display='none';
    try{if(state.tooltip){state.tooltip.options.enabled=state.enabled;state.tooltip=null;}}catch{}
  }
  function show(state,event){
    const chart=state.chart,touch=event.touches?.[0]||event;
    if(!finite(touch.clientX)||!finite(touch.clientY)){hide(state);return;}
    const rect=chart.canvas.getBoundingClientRect(),a=chart.chartArea;
    if(!a||!rect.width||!rect.height||!chart.width||!chart.height){hide(state);return;}
    const pointer={x:(touch.clientX-rect.left)*chart.width/rect.width,y:(touch.clientY-rect.top)*chart.height/rect.height};
    if(pointer.x<a.left||pointer.x>a.right||pointer.y<a.top||pointer.y>a.bottom){hide(state);return;}
    const data=info(chart,pointer);if(!data?.rows.length){hide(state);return;}
    // Native index-mode hover joins unrelated sample indices. Our marker layer
    // samples every visible line at data.x instead and leaves the datasets intact.
    if(chart.getActiveElements?.().length){chart.setActiveElements([]);chart.draw();}
    state.pointer={clientX:touch.clientX,clientY:touch.clientY};
    try{if(chart.tooltip&&state.tooltip!==chart.tooltip){state.tooltip=chart.tooltip;state.enabled=chart.tooltip.options.enabled;}if(state.tooltip)state.tooltip.options.enabled=false;}catch{}
    const title=document.createElement('div');title.textContent=data.title;title.style.cssText='font-weight:650;margin-bottom:7px';
    const children=[title];
    for(const row of data.rows){
      const line=document.createElement('div');line.style.cssText='display:flex;align-items:center;gap:8px;min-height:22px';
      const swatch=document.createElement('span');swatch.style.cssText='display:inline-block;width:14px;height:3px;flex:0 0 14px';swatch.style.background=row.color;
      const label=document.createElement('span');label.textContent=row.label;label.style.cssText='flex:1;white-space:nowrap';
      const value=document.createElement('span');value.textContent=format(row);value.style.cssText='font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:12px';
      line.append(swatch,label,value);children.push(line);
    }
    state.tip.replaceChildren(...children);state.tip.style.display='block';
    state.markers.replaceChildren(...data.rows.filter(row=>finite(row.py)&&row.py>=a.top&&row.py<=a.bottom).map(row=>{
      const dot=document.createElement('span');
      dot.style.cssText='position:fixed;display:block;width:8px;height:8px;border-radius:50%;border:2px solid #fff;box-sizing:border-box;transform:translate(-50%,-50%);background:'+row.color+';left:'+(rect.left+data.px*rect.width/chart.width)+'px;top:'+(rect.top+row.py*rect.height/chart.height)+'px';
      return dot;
    }));state.markers.style.display='block';
    const box=state.tip.getBoundingClientRect(),vw=window.innerWidth||document.documentElement.clientWidth,vh=window.innerHeight||document.documentElement.clientHeight;
    const left=Math.max(8,Math.min(touch.clientX+16+box.width<vw-8?touch.clientX+16:touch.clientX-box.width-16,vw-box.width-8));
    const top=Math.max(8,Math.min(touch.clientY+16,vh-box.height-8));state.tip.style.left=left+'px';state.tip.style.top=top+'px';
    state.cursor.style.cssText='position:fixed;pointer-events:none;z-index:2147483645;border-left:1px dashed rgba(100,116,139,.65);display:block;left:'+(rect.left+data.px*rect.width/chart.width)+'px;top:'+(rect.top+a.top*rect.height/chart.height)+'px;height:'+((a.bottom-a.top)*rect.height/chart.height)+'px';
  }
  function detach(canvas,state){
    for(const type of ['mousemove','touchstart','touchmove'])canvas.removeEventListener(type,state.move,true);
    for(const type of ['mouseleave','touchend','touchcancel'])canvas.removeEventListener(type,state.leave,true);
    window.removeEventListener('scroll',state.leave,true);window.removeEventListener('blur',state.leave);hide(state);state.tip.remove();state.cursor.remove();state.markers.remove();bindings.delete(canvas);
  }
  function attach(chart,config={}){
    if(!supported(chart))return;
    // Never enter Chart.js' render/plugin lifecycle: tooltip errors stay local.
    try{
      configs.set(chart,config);
      for(const [canvas,state] of bindings)if(canvas.isConnected===false)detach(canvas,state);
      let state=bindings.get(chart.canvas);
      if(state){state.chart=chart;if(state.pointer)Promise.resolve().then(()=>state.move(state.pointer));return;}
      const tip=document.createElement('div'),cursor=document.createElement('div'),markers=document.createElement('div');
      tip.setAttribute('role','tooltip');tip.style.cssText='position:fixed;display:none;pointer-events:none;z-index:2147483646;background:#fff;color:#111827;border:1px solid #cbd5e1;border-radius:7px;padding:10px 12px;box-shadow:0 3px 12px rgba(0,0,0,.2);font:12px/1.4 system-ui,-apple-system,sans-serif;max-width:calc(100vw - 16px);box-sizing:border-box';
      cursor.style.display='none';markers.style.cssText='display:none;pointer-events:none;position:fixed;inset:0;z-index:2147483645';
      (document.body||document.documentElement).append(tip,cursor,markers);
      state={chart,tip,cursor,markers,tooltip:null,pointer:null};
      state.move=e=>{try{show(state,e);}catch(error){hide(state);if(!state.warned){state.warned=true;console.warn('[SOC hover]',error);}}};state.leave=()=>hide(state);
      for(const type of ['mousemove','touchstart','touchmove'])chart.canvas.addEventListener(type,state.move,{capture:true,passive:true});
      for(const type of ['mouseleave','touchend','touchcancel'])chart.canvas.addEventListener(type,state.leave,{capture:true,passive:true});
      window.addEventListener('scroll',state.leave,{capture:true,passive:true});window.addEventListener('blur',state.leave);bindings.set(chart.canvas,state);
    }catch(error){console.warn('[SOC hover] Koppelen mislukt:',error);}
  }
  const plugin={id:'beSocSynchronizedHover',beforeEvent(chart,args){
    if(bindings.has(chart.canvas)&&/^(mousemove|mouseout|touchstart|touchmove|touchend|touchcancel)$/.test(args.event.type))return false;
  },afterDestroy(chart){const state=bindings.get(chart.canvas);if(state)detach(chart.canvas,state);}};
  root.BESocHover={attach,info,valueAt,plugin};
})(typeof window!=='undefined'?window:globalThis);

(function(root){
  'use strict';
  const numeric=v=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:[.,]\d+)?$/.test(v.trim())?Number(v.trim().replace(',','.')):NaN;
  function resolve(value){
    const c=value&&typeof value==='object'?value:{};
    if(c.capacityMode==='fcc'){
      const fccAh=numeric(c.fccAh),packCount=numeric(c.packCount),nominalVoltage=numeric(c.nominalVoltage);
      if(!(fccAh>0&&Number.isInteger(packCount)&&packCount>=1&&packCount<=100&&nominalVoltage>=1&&nominalVoltage<=1000))return null;
      const capacity=fccAh*packCount*nominalVoltage/1000;
      return capacity>=.01&&capacity<=1000?{mode:'fcc',capacity,fccAh,packCount,nominalVoltage}:null;
    }
    if(c.capacityMode&&c.capacityMode!=='kwh')return null;
    const capacity=numeric(c.capacityKwh??c.capacity);
    return capacity>=.01&&capacity<=1000?{mode:'kwh',capacity}:null;
  }
  function readForm(form,previous={}){
    const next={...previous,capacityMode:form.elements.capacityMode.value,
      capacityKwh:numeric(form.elements.capacity.value),fccAh:numeric(form.elements.fccAh.value),
      packCount:numeric(form.elements.packCount.value),nominalVoltage:numeric(form.elements.nominalVoltage.value)};
    const resolved=resolve(next);return resolved?{...next,capacity:resolved.capacity}:null;
  }
  root.BECapacity={numeric,resolve,readForm};
})(typeof window!=='undefined'?window:globalThis);

(function(root){
  'use strict';
  const id='be-coulomb-native-readout',own='.be-own-soc,[data-be-coulomb-readout]';
  const text=e=>(e.textContent||'').replace(/\s+/g,' ').trim();
  const percent=e=>/^\d+(?:[.,]\d+)?\s*%$/.test(text(e));
  function metric(label){
    for(let e=label,depth=0;e&&depth<4;e=e.parentElement,depth++){
      if(e.matches?.('body,main,section,aside,form')||e.querySelector?.('canvas'))break;
      const leaves=[...e.querySelectorAll('span,div,p,strong,b')].filter(n=>!n.children.length&&!n.closest(own));
      if(leaves.some(percent)&&!/\d\s*(?:kWh|kW|W|€)\b/.test(text(e)))return e;
    }
    return null;
  }
  function target(){
    const header=document.querySelector('#power-chart-content .energy-chart-soc-header');
    if(header?.querySelector('.energy-chart-soc-value'))return header;
    const labels=[...document.querySelectorAll('span,div,p,dt,label')].filter(e=>!e.children.length&&!e.closest(own)&&/^(?:SOC|SOC\s*\(%\)|Laadtoestand(?:\s*\(SOC\))?|State of charge(?:\s*\(SOC\))?)$/i.test(text(e)));
    for(const label of labels){const row=metric(label);if(row)return row;}
    for(const selector of ['#current-soc','#battery-soc','#soc-value','[data-metric="soc"]','[data-soc-value]']){
      const value=document.querySelector(selector);
      if(value&&!value.closest(own)&&percent(value))return value.closest('.summary-compact-metric')||value.parentElement;
    }
    return null;
  }
  function render(view){
    const row=target();let el=document.getElementById(id);
    if(!row){el?.remove();return;}
    if(!el){
      el=document.createElement('div');el.id=id;el.setAttribute('data-be-coulomb-readout','');
      el.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 100%;grid-column:1 / -1;min-width:0;margin-top:0;color:#0891b2;font:inherit;font-variant-numeric:tabular-nums';
      const label=document.createElement('span'),value=document.createElement('strong');
      label.className='energy-chart-soc-label be-own-soc-label';label.textContent='Coulombtelling in/uit';label.style.color='#0891b2';
      value.className='energy-chart-soc-value';value.style.cssText='color:#0891b2;white-space:nowrap';
      el.append(label,value);
    }
    if(el.parentElement!==row){row.style.flexWrap='wrap';row.style.rowGap='4px';row.append(el);}
    if(typeof getComputedStyle==='function'){
      const label=row.querySelector('.energy-chart-soc-label'),value=row.querySelector('.energy-chart-soc-value');
      for(const [original,copy] of [[label,el.querySelector('span')],[value,el.querySelector('strong')]]){
        if(original&&original!==copy){const font=getComputedStyle(original).font;if(font&&copy.style.font!==font)copy.style.font=font;}
      }
    }
    const shown=view.compactSoc??view.soc;
    const value=el.querySelector('strong');if(value.textContent!==shown)value.textContent=shown;
    if(el.title!==view.state)el.title=view.state;
  }
  root.BESocNativeReadout={render,target};
})(window);

(function(root){
  'use strict';
  const active=chart=>chart.canvas?.id==='soc-chart'&&/\/customer\/[^/]+\/history\/?$/.test(location.pathname);
  function range(chart){
    // Read the current native input, never the previous, already expanded axis
    // or parsed metadata from the period that was just replaced.
    const native=chart.data.datasets.filter(d=>!d.beOwnSOC);
    const axis=native[0]?.xAxisID||'x',scale=chart.scales?.[axis];
    const options=(chart.config?.options||chart.options)?.scales?.[axis]||{};
    function time(value){
      if(value==null||value==='')return NaN;
      if(Number.isFinite(value))return value;
      if(value instanceof Date)return +value;
      const parsed=scale?.parse?.(value);
      return Number.isFinite(parsed)?parsed:typeof value==='string'?Date.parse(value):NaN;
    }
    let min=Infinity,max=-Infinity;
    for(const d of native){
      if((d.xAxisID||'x')!==axis)continue;
      for(let i=0;i<(d.data?.length||0);i++){
        const p=d.data[i],x=time(Array.isArray(p)?p[0]:p&&typeof p==='object'?p.x:chart.data.labels?.[i]);
        if(Number.isFinite(x)){min=Math.min(min,x);max=Math.max(max,x);}
      }
    }
    const start=time(options.min),end=time(options.max);
    if(Number.isFinite(start))min=start;
    if(Number.isFinite(end))max=end;
    return Number.isFinite(min)&&Number.isFinite(max)&&min<=max?{min,max}:null;
  }
  function legend(chart,visible,toggle){
    const frame=chart.canvas.closest('.history-chart-soc-row');
    const header=frame?.querySelector('.history-chart-soc-header');
    if(!header)return;
    const label=header.querySelector('.history-chart-soc-label:not([data-be-history-coulomb])');
    let button=header.querySelector('[data-be-history-coulomb]');
    if(!button){
      button=document.createElement('button');button.type='button';
      button.dataset.beHistoryCoulomb='';button.className='history-chart-soc-label';
      button.textContent='Coulombtelling in/uit';
      button.style.cssText='border:0;background:transparent;color:inherit;padding:6px 0;min-height:44px;cursor:pointer;font:inherit;white-space:normal;text-align:left';
      header.style.display='flex';header.style.flexWrap='wrap';header.style.alignItems='center';header.style.gap='6px 24px';
      header.append(button);
    }
    const styleId='be-history-soc-legend-style';
    if(!document.getElementById(styleId)){
      const style=document.createElement('style');style.id=styleId;
      style.textContent='[data-be-history-coulomb]::before{background:#0891b2!important;box-shadow:0 0 0 3px rgba(8,145,178,.14)!important}[data-be-history-coulomb][aria-pressed="false"]{opacity:.5;text-decoration:line-through}[data-be-history-coulomb]:focus-visible{outline:2px solid #0891b2;outline-offset:3px}';
      (document.head||document.documentElement).append(style);
    }
    if(label)button.style.font=getComputedStyle(label).font;
    button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-controls',chart.canvas.id);
    button.title=visible?'Coulombtelling verbergen':'Coulombtelling tonen';
    button.onclick=toggle;
  }
  root.BESocHistory={active,range,legend};
})(window);

(async function () {
  'use strict';
  if(window.__beCoulombInOut6)return;
  let id=location.pathname.match(/^\/customer\/([^/]+)(?:\/|$)/)?.[1];
  if(!id||['account','current-history','current-prices','results'].includes(id))id=await window.BEInstallation?.wait();
  if(!id||window.__beCoulombInOut6)return;
  window.__beCoulombInOut6=true;
  const ext=window.BESOCExtras;
  const pastColorsPlugin={id:'beOwnSocPastColors',afterDraw(chart){
    const area=chart.chartArea,x=chart.scales.x;if(!area||!x)return;
    const slots=(payload?.items||[]).flatMap(i=>(i.hours||[]).map(t=>Date.parse(t)));
    if(slots.length!==chart.data.labels?.length)return;
    const ctx=chart.ctx,now=Date.now();ctx.save();ctx.beginPath();
    ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top);ctx.clip();
    chart.data.datasets.forEach((d,i)=>{
      if(!d.beOwnSOC||!chart.isDatasetVisible(i))return;
      const meta=chart.getDatasetMeta(i);
      const color='#0891b2';
      ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.setLineDash([]);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
      let started=false;
      for(let k=0;k<slots.length;k++){
        const point=meta.data[k],raw=d.data[k];
        if(slots[k]>now||raw==null||point?.skip||!Number.isFinite(point?.x)||!Number.isFinite(point?.y)){started=false;continue;}
        if(started)ctx.lineTo(point.x,point.y);else{ctx.moveTo(point.x,point.y);started=true;}
      }
      ctx.stroke();
    });ctx.restore();
  }};

  const core=window.BEEnergySOC, key='be-own-soc-settings:'+id, DAY=86400000;
  let cfg={},record={rows:[],manual:[]},result=null,payload=null,db=null,busy=false,error='',storageError='',lastFetch=0,forecastFetch=0;
  try{cfg=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  const settings=()=>({...core.defaults,...cfg,capacity:window.BECapacity.resolve(cfg)?.capacity??NaN,chargeEfficiency:1,dischargeEfficiency:1,auto:true});
  const number=(v,n=1)=>Number.isFinite(v)?v.toLocaleString('nl-NL',{maximumFractionDigits:n,minimumFractionDigits:n}):'—';
  const date=t=>new Date(t).toLocaleString('nl-NL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const latest=()=>result?.points.at(-1);
  const followsOriginal=p=>p?.lowState?.mode==='tracking'||p?.highState?.mode==='tracking';
  const visualSoc=p=>p?.soc??null;

  const displayKey=key+':last-display:v3';
  let lastDisplay=null,displaySaved='';
  try{const saved=JSON.parse(localStorage.getItem(displayKey)||'null');if(validDisplay(saved))lastDisplay=saved;}catch{}
  function validDisplay(v){return v&&Number.isFinite(v.t)&&v.t>0&&v.t<=Date.now()+10000&&Number.isFinite(v.soc)&&Number.isFinite(v.capacity)&&v.capacity>0&&Number.isFinite(v.input)&&Number.isFinite(v.output)&&v.capacity===settings().capacity;}
  function display(){
    const r=latest(),c=settings(),current=r&&Number.isFinite(r.soc);
    if(current){
      lastDisplay={...r,capacity:c.capacity,input:result.input,output:result.output,start:record.rows[0]?.[0],gaps:result.gaps};
      const saved=JSON.stringify(lastDisplay);
      if(saved!==displaySaved){try{localStorage.setItem(displayKey,saved);displaySaved=saved;}catch{}}
    }else if(!validDisplay(lastDisplay))lastDisplay=null;
    const shown=lastDisplay,stale=shown&&Date.now()-shown.t>120000;
    const soc=shown?number(visualSoc(shown),1)+'%':'—';
    const compactSoc=shown?number(visualSoc(shown),0)+'%':'—';
    const energy=shown?.reference?'Sinds ijkpunt '+date(shown.reference.t)+': in '+number(shown.sinceInput,2)+' kWh · uit '+number(shown.sinceOutput,2)+' kWh':'';
    const history=shown?'Bewaarde historie: in '+number(shown.input,2)+' kWh · uit '+number(shown.output,2)+' kWh'+(Number.isFinite(shown.start)?' sinds '+date(shown.start):''):'';
    let state=shown?(current?'Bijgewerkt t/m ':'Laatste geldige berekening: ')+date(shown.t):'Wachten op eerste geldige meting';
    if(shown&&Number.isFinite(shown.raw))state+=' · gemeld '+number(shown.raw,0)+'% · verschil '+number(visualSoc(shown)-shown.raw)+' procentpunt';
    if(shown?.lowState?.mode==='tracking')state+=' · volgt laagste originele SOC';
    else if(shown?.highState?.mode==='tracking')state+=' · volgt hoogste originele SOC';
    if(shown?.uncertain)state+=' · onzekere meetintervallen';
    if(stale)state+=' · metingen verouderd';
    if(!current&&shown)state+=' · wacht op nieuwe metingen';
    if(!(c.capacity>0))state='Kies de rekencapaciteit bij Herijken en instellingen';
    if(error)state+=' · bronmelding: '+error;
    if(storageError)state+=' · '+storageError;
    return {soc,compactSoc,energy,history,state};
  }
  function textIfChanged(el,value){if(el.textContent!==value)el.textContent=value;}
  function openDB(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('be-own-energy-soc-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('installations');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error("Lokale historie geblokkeerd"));
  });}
  // Merge in one read/write transaction: simultaneous dashboard tabs cannot overwrite observations.
  function persist(incoming=[],anchor=null){return new Promise((resolve,reject)=>{
    if(!db){record.rows=[...new Map([...record.rows,...incoming].filter(core.valid).map(r=>[r[0],r])).values()].sort((a,b)=>a[0]-b[0]);if(anchor)record.manual=[...record.manual.filter(a=>a.t!==anchor.t),anchor];resolve();return;}
    const tx=db.transaction('installations','readwrite'),store=tx.objectStore('installations'),req=store.get(id);
    req.onsuccess=()=>{
      try {
        const old=req.result||{rows:[],manual:[]};
        let rows=[...new Map([...record.rows,...(old.rows||[]),...incoming].filter(core.valid).map(r=>[r[0],r])).values()].sort((a,b)=>a[0]-b[0]);
        let manual=[...new Map([...record.manual,...(old.manual||[])].map(a=>[a.t,a])).values()];
        if(anchor)manual=[...manual.filter(a=>a.t!==anchor.t),anchor];
        // Preserve the integrated state when old observations are removed.
        const cutoff=Date.now()-30*DAY,index=rows.findIndex(r=>r[0]>=cutoff);
        if(index>0&&settings().capacity>0){
          const prior=core.calculate(rows.slice(0,index+1),settings(),manual).points.at(-1);
          // Retain unresolved gaps or out-of-range drift until a valid anchor exists.
          if(prior&&!prior.uncertain&&prior.soc!==null&&prior.soc>=0&&prior.soc<=100){
            rows=rows.slice(index);manual=manual.filter(a=>a.t>=rows[0][0]);
            if(!manual.some(a=>a.t===prior.t))manual.unshift({t:prior.t,soc:prior.soc,kind:'bewaard telpunt',lowState:prior.lowState,highState:prior.highState,statsReference:prior.reference?{reference:prior.reference,input:prior.sinceInput,output:prior.sinceOutput}:undefined});
          }
        }
        record={...old,rows,manual};store.put(record,id);
      }catch(e){reject(e);tx.abort();}
    };
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('Transactie afgebroken'));
  });}
  async function request(url){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
    try{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:ctl.signal});
      if(!r.ok)throw Error('Bron geeft HTTP '+r.status);return await r.json();
    }finally{clearTimeout(timer);}
  }
  function compute(){result=settings().capacity>0?core.calculate(record.rows,settings(),record.manual):null;}
  async function poll(){
    if(busy)return;busy=true;
    try {
      const now=Date.now(),last=record.rows.at(-1)?.[0];
      const u=new URL('/customer/current-history/api/',location.origin);
      u.searchParams.set('installation',id);u.searchParams.set('start',String(Math.max(now-DAY,last?last-300000:0)));u.searchParams.set('end',String(now));
      const j=await request(u.href);
      if(!Array.isArray(j.rows))throw Error('Onbekend historieformaat');
      const rows=[...j.rows,...(j.latest?[j.latest]:[])].filter(r=>Number.isFinite(r.t)&&r.t<=now).map(r=>[r.t,Number.isFinite(r.s)?r.s:null,Number.isFinite(r.bo)?r.bo:null]);
      await persist(rows);compute();lastFetch=now;error='';
      if(!payload||now-forecastFetch>300000){
        try{payload=await request('/customer/'+encodeURIComponent(id)+'/forecast_api/');forecastFetch=now;
          compute();
        }catch(e){error='Forecast tijdelijk niet beschikbaar';}
      }
    }catch(e){error=e.message||String(e);}
    finally{busy=false;render();}
  }
  const style=document.createElement('style');
  style.textContent=`.be-own-soc{margin:12px 0;padding:14px 16px;border:1px solid #c4dde1;border-radius:12px;background:rgba(8,145,178,.045);font:13px system-ui;color:inherit}.be-own-soc header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.be-own-soc strong{font-size:21px;color:#0891b2}.be-own-soc small{opacity:.75}.be-own-soc details{margin-top:10px}.be-own-soc summary{cursor:pointer}.be-own-soc form{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:12px}.be-own-soc label{display:flex;flex-direction:column;gap:4px}.be-own-soc input[type=number]{width:90px;padding:6px;border:1px solid #aaa;border-radius:6px;background:inherit;color:inherit}.be-own-soc button{padding:7px 10px;border:1px solid #7cb9c5;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.be-own-soc p{margin:8px 0}.be-own-soc output{display:block;margin-top:7px;min-height:1.4em}.be-own-soc [data-energy]{min-height:1.4em}.be-own-soc .be-soc-line{color:#0891b2;font-weight:650}.be-own-soc ul{padding-left:20px;max-height:150px;overflow:auto}`;
  style.textContent+=`[data-be-soc-compact]{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;align-items:center!important;gap:6px!important}[data-be-soc-legend]{display:inline-flex!important;flex-direction:row!important;flex-wrap:nowrap!important;width:max-content!important;max-width:100%;gap:6px!important;align-items:center!important;margin:6px 0!important}[data-be-soc-compact]>[data-be-soc-legend]{display:contents!important}[data-be-soc-compact] button,[data-be-soc-legend] button{display:inline-flex!important;flex:0 0 auto!important;width:auto!important;min-width:0!important;max-width:none!important;min-height:0!important;height:28px!important;white-space:nowrap!important;padding:4px 9px!important;font-size:12px!important;line-height:18px!important}`;
  style.textContent+=`.be-own-soc{--be-cap-border:#d4d9e1;--be-cap-surface:rgba(255,255,255,.7);--be-cap-control:#fff;--be-cap-muted:#687280;--be-cap-accent:#6b3f8d}
.be-own-soc form[data-settings]{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start;max-width:760px;box-sizing:border-box;margin:16px 0 0;padding:16px;border:1px solid var(--be-cap-border);border-radius:12px;background:var(--be-cap-surface)}
.be-own-soc [data-settings] .be-capacity-title{font-size:14px;font-weight:650;line-height:1.3}
.be-own-soc [data-settings] label{display:flex;flex-direction:column;min-width:0;gap:6px;font-size:12px;font-weight:550;line-height:1.4}
.be-own-soc [data-settings] .be-capacity-method{max-width:280px}
.be-own-soc [data-cap-kwh]{max-width:260px}
.be-own-soc [data-cap-fcc]{display:grid;grid-template-columns:1fr .8fr 1.25fr;gap:12px;align-items:end;min-width:0}
.be-own-soc [data-cap-fcc][hidden],.be-own-soc [data-cap-kwh][hidden]{display:none!important}
.be-own-soc [data-settings] .be-cap-input{display:flex;align-items:center;min-width:0;width:100%;height:40px;box-sizing:border-box;border:1px solid var(--be-cap-border);border-radius:8px;background:var(--be-cap-control);overflow:hidden}
.be-own-soc [data-settings] input[type=number]{flex:1 1 0;min-width:0;width:100%;height:100%;box-sizing:border-box;margin:0;padding:8px 10px;border:0;border-radius:0;outline:none;box-shadow:none;background:transparent;color:inherit;font:inherit;font-size:14px;font-variant-numeric:tabular-nums}
.be-own-soc [data-settings] .be-cap-unit{flex:none;padding:0 10px 0 4px;color:var(--be-cap-muted);font-size:12px;font-weight:400}
.be-own-soc [data-settings] select{min-width:0;width:100%;height:40px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--be-cap-border);border-radius:8px;background:var(--be-cap-control);color:inherit;font:inherit;font-size:14px}
.be-own-soc [data-settings] .be-cap-input:focus-within,.be-own-soc [data-settings] select:focus-visible{outline:2px solid var(--be-cap-accent);outline-offset:2px}
.be-own-soc [data-settings] .be-capacity-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding-top:2px}
.be-own-soc [data-settings] [data-capacity-preview]{flex:1 1 auto;min-width:0;margin:0;min-height:0;font-size:14px;font-weight:650;line-height:1.4}
.be-own-soc [data-settings] button{flex:none;min-height:40px;padding:8px 14px;border:1px solid var(--be-cap-accent);border-radius:8px;background:var(--be-cap-accent);color:#fff;font:inherit;font-size:12px;font-weight:600;line-height:1.4;cursor:pointer}
.be-own-soc [data-settings] button:hover{filter:brightness(1.08)}
.be-own-soc [data-settings] [data-capacity-help]{margin:0;color:var(--be-cap-muted);font-size:11px;line-height:1.55;overflow-wrap:anywhere}
.be-own-soc form[data-manual]{max-width:760px;display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:14px}
.be-own-soc [data-manual] label{min-width:0;gap:6px;font-size:12px;font-weight:550}
.be-own-soc [data-manual] input[type=number]{height:40px;width:116px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--be-cap-border);border-radius:8px;background:var(--be-cap-control);color:inherit;font-size:14px;font-variant-numeric:tabular-nums}
.be-own-soc [data-manual] button{min-height:40px;box-sizing:border-box;padding:8px 14px;border:1px solid var(--be-cap-border);border-radius:8px;font-size:12px;line-height:1.4}
html[data-be-dark="aan"] .be-own-soc{--be-cap-border:#5a5561;--be-cap-surface:rgba(0,0,0,.12);--be-cap-control:#28252e;--be-cap-muted:#beb7c6;--be-cap-accent:#8253a5}
@media(max-width:560px){.be-own-soc form[data-settings]{gap:13px;padding:14px}.be-own-soc [data-cap-fcc]{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.be-own-soc [data-cap-fcc]>label:last-child{grid-column:1 / -1}.be-own-soc [data-settings] .be-capacity-method,.be-own-soc [data-cap-kwh]{max-width:none}.be-own-soc [data-settings] .be-capacity-footer{flex-direction:column;align-items:stretch;gap:12px;padding-top:3px}.be-own-soc [data-settings] button{width:100%}.be-own-soc [data-settings] .be-cap-input,.be-own-soc [data-settings] select,.be-own-soc [data-settings] button{min-height:44px;height:44px}}
@media(max-width:560px){.be-own-soc [data-settings] input[type=number],.be-own-soc [data-settings] select,.be-own-soc [data-manual] input[type=number]{font-size:16px}.be-own-soc [data-manual] input[type=number],.be-own-soc [data-manual] button{min-height:44px}}
`;
  style.textContent+=`.be-soc-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-sizing:border-box;width:100%;margin:0;padding:8px 0 4px;color:inherit;font:11px/1.3 system-ui,sans-serif}
.be-soc-legend[data-be-soc-inline]{display:inline-flex;width:auto;padding:0;font:inherit}
.be-soc-legend .be-soc-series-toggle{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:0;padding:3px 0;margin:0;background:transparent;color:inherit;font:inherit;cursor:pointer;box-shadow:none;min-height:0}
.be-soc-legend .be-soc-series-toggle[aria-pressed="false"]{opacity:.5;text-decoration:line-through}
.be-soc-legend .be-soc-series-toggle:focus-visible{outline:2px solid #0891b2;outline-offset:3px}
.be-soc-legend .be-soc-series-swatch{width:13px;height:3px;display:inline-block;flex:none}
[data-be-coulomb-readout] .be-own-soc-label::before{background:#0891b2;box-shadow:0 0 0 3px rgba(8,145,178,.14)}

.be-soc-legend .be-soc-series-toggle{font:11px/1.3 system-ui,sans-serif!important;font-weight:400!important;border:0!important;border-radius:0!important;padding:3px 0!important;margin:0!important;min-height:0!important;background:transparent!important;box-shadow:none!important}
.be-soc-legend .be-soc-series-toggle>span{font:inherit!important}
`;
  document.head.append(style);
  function panel(canvas){
    let p=document.getElementById('be-own-soc-panel');if(p)return p;
    p=document.createElement('section');p.id='be-own-soc-panel';p.className='be-own-soc';
    p.innerHTML=`<header><span class="be-soc-line">Coulombtelling in/uit</span><strong data-soc>—</strong><span data-energy></span></header><output data-state></output><details><summary>Herijken en instellingen</summary><form data-manual><label>Nieuwe SOC %<input name="soc" type="number" min="0" max="100" step="0.1" required></label><button>Herijk alleen de blauwe telling</button></form><form data-settings class="be-capacity-card">
  <div class="be-capacity-title">Accucapaciteit</div>
  <label class="be-capacity-method">Invoermethode
    <select name="capacityMode"><option value="kwh">kWh handmatig</option><option value="fcc">FCC per accu (Ah)</option></select>
  </label>
  <div data-cap-kwh>
    <label>Totale capaciteit
      <span class="be-cap-input"><input name="capacity" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" required><span class="be-cap-unit">kWh</span></span>
    </label>
  </div>
  <div data-cap-fcc hidden>
    <label>Gemiddelde FCC
      <span class="be-cap-input"><input name="fccAh" type="number" inputmode="decimal" min="0.01" max="100000" step="0.01"><span class="be-cap-unit">Ah</span></span>
    </label>
    <label>Aantal accu’s
      <span class="be-cap-input"><input name="packCount" type="number" inputmode="numeric" min="1" max="100" step="1"><span class="be-cap-unit">stuks</span></span>
    </label>
    <label>Nominale spanning per accu
      <span class="be-cap-input"><input name="nominalVoltage" type="number" inputmode="decimal" min="1" max="1000" step="0.1"><span class="be-cap-unit">V</span></span>
    </label>
  </div>
  <div class="be-capacity-footer"><output data-capacity-preview aria-live="polite"></output><button type="submit">Capaciteit opslaan</button></div>
  <small data-capacity-help></small>
</form><p>Blauw rekent uitsluitend met de BE-dashboarddata: accuvermogen in/uit, BE-SOC voor de ijkpunten en ingestelde accucapaciteit. SOC = start-SOC + 100 × (kWh in − kWh uit) / capaciteit. Alle beschikbare vermogensintervallen worden geïntegreerd; ontbrekende BE-SOC verwijdert geen geldige vermogensmeting. De kWh-in/uitmeters lopen ook bij herijking door.</p><p>Bij dalen naar 10% en lager volgt blauw de laagste originele SOC; zodra de telling stijgt, gaat hij zelfstandig verder. Bij stijgen naar 95% en hoger volgt blauw de hoogste originele SOC; zodra de telling daalt, gaat hij zelfstandig verder. De terugweg langs 10% of 95% herijkt niet opnieuw. De getoonde kWh in/uit zijn sinds het laatste ijkpunt; de volledige telling blijft doorlopen.</p><button type="button" data-export>Exporteer telgegevens</button><output data-history></output><p data-log></p><ul data-events></ul></details>`;
    canvas.parentElement.insertAdjacentElement('afterend',p);
    const f=p.querySelector('[data-settings]'),resolved=window.BECapacity.resolve(cfg);
    f.elements.capacityMode.value=cfg.capacityMode==='fcc'?'fcc':'kwh';
    f.elements.capacity.value=cfg.capacityKwh??(resolved?.mode==='kwh'?resolved.capacity:'');
    f.elements.fccAh.value=cfg.fccAh??'';
    f.elements.packCount.value=cfg.packCount??'';
    f.elements.nominalVoltage.value=cfg.nominalVoltage??51.2;
    function preview(){
      const fcc=f.elements.capacityMode.value==='fcc';
      f.querySelector('[data-cap-kwh]').hidden=fcc;f.querySelector('[data-cap-fcc]').hidden=!fcc;
      f.elements.capacity.disabled=fcc;f.elements.capacity.required=!fcc;
      for(const name of ['fccAh','packCount','nominalVoltage']){f.elements[name].disabled=!fcc;f.elements[name].required=fcc;}
      const next=window.BECapacity.readForm(f,cfg),cap=next&&window.BECapacity.resolve(next);
      textIfChanged(f.querySelector('[data-capacity-preview]'),cap?'Rekencapaciteit: '+number(cap.capacity,2)+' kWh':'Vul de capaciteit in');
      textIfChanged(f.querySelector('[data-capacity-help]'),fcc?'Gemiddelde FCC × aantal accu’s × nominale spanning ÷ 1000. Gebruik de FCC in Ah uit je BMS.':'Je eigen rekencapaciteit voor het hele systeem. Account wordt niet automatisch overgenomen.');
    }
    f.oninput=preview;f.onchange=preview;preview();
    f.onsubmit=async e=>{
      e.preventDefault();if(!f.reportValidity())return;
      const next=window.BECapacity.readForm(f,cfg);
      if(!next){error='Vul een geldige rekencapaciteit in';render();return;}
      try{localStorage.setItem(key,JSON.stringify(next));cfg=next;error='';compute();render();}catch(e){error='Opslaan mislukt: '+e.message;render();}
    };
    p.querySelector('[data-manual]').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,r=latest();if(!r||!form.reportValidity())return;
      if(Date.now()-r.t>120000){error='Laatste meetpunt is te oud om nu te herijken';render();return;}
      try{await persist([],{t:r.t,soc:+form.elements.soc.value,kind:'handmatig'});compute();render();}catch(e){error='Herijken niet opgeslagen: '+e.message;render();}
    };
    p.querySelector('[data-export]').onclick=()=>{
      const blob=new Blob([JSON.stringify({version:'6.1.6',installation:id,settings:settings(),...record,events:result?.events},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Balansenergie-coulombtelling-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };return p;
  }
  function dataset(chart,tag,label,points,extra={}){
    let d=chart.data.datasets.find(d=>d.beOwnSOC===tag);
    if(!d){d={beOwnSOC:tag,label,type:'line',order:-20,borderColor:'#0891b2',backgroundColor:'#0891b2',borderWidth:1.6,pointRadius:0,pointHitRadius:8,fill:false,tension:0,spanGaps:false,...extra};chart.data.datasets.push(d);}
    Object.assign(d,extra);d.data=points;
    d.borderDash=[];
    d.segment={borderColor:d.borderColor,borderWidth:d.borderWidth,borderDash:[]};
  }
  function forecastValues(chart){
    const items=payload?.items;if(!items?.length)return null;
    const slots=items.flatMap(i=>(i.hours||[]).map((t,k)=>({t:Date.parse(t),dt:(i.interval_minutes||15)*60000,
      load:i.usage_kwh?.[k],pv:i.pv_production_kwh?.[k]})));
    if(slots.length!==chart.data.labels?.length)return null;
    const c=settings(),power=Number.isFinite(payload.battery_power_kw)?payload.battery_power_kw:Infinity;
    const visible=(result?.points||[]).map(p=>({...p,soc:visualSoc(p)})),last=latest();
    return {actual:slots.map(q=>core.at(visible,q.t,c.maxGapMs)),
      future:ext.project(slots,last?{...last,soc:visualSoc(last)}:null,c,power)};
  }
  function applyVisibility(chart){
    chart.data.datasets.forEach((d,i)=>{
      if(!d.beOwnSOC)return;
      const visible=cfg.show_kwh!==false;
      d.hidden=!visible;
      if(chart.setDatasetVisibility)chart.setDatasetVisibility(i,visible);
    });
  }
  function filterNativeLegend(chart){
    const native=(chart.config?.options||chart.options)?.plugins?.legend;
    if(!native)return;
    const labels=native.labels||(native.labels={});
    if(labels.filter?.beOwnSocLegendFilter)return;
    const previous=labels.filter;
    function filter(item,data){
      return !data.datasets[item.datasetIndex]?.beOwnSOC&&(!previous||previous.call(this,item,data));
    }
    filter.beOwnSocLegendFilter=true;
    labels.filter=filter;
  }
  function legend(chart){
    const canvas=chart.canvas;
    let row=document.querySelector('[data-be-soc-legend="'+canvas.id+'"]');
    if(window.BESocHistory?.active(chart)){
      document.querySelectorAll('[data-be-soc-legend="soc-chart"]').forEach(node=>node.remove());
      window.BESocHistory.legend(chart,cfg.show_kwh!==false,()=>{
        cfg.show_kwh=cfg.show_kwh===false;localStorage.setItem(key,JSON.stringify(cfg));render();
      });
      return;
    }
    // Actueel already has the full-size Coulomb readout beside the SOC value.
    if(canvas.id==='soc-chart'){
      document.querySelectorAll('[data-be-soc-legend="soc-chart"]').forEach(node=>node.remove());
      return;
    }
    if(!row){
      let host=canvas.parentElement,existing=null;
      for(let depth=0;host&&depth<3;depth++,host=host.parentElement){
        const candidate=host.querySelector('[class*="legend-soc"], [id*="soc-legend"], [aria-label="SOC reeksen"]');
        if(candidate){existing=candidate;break;}
      }
      row=document.createElement('span');row.dataset.beSocLegend=canvas.id;row.className='be-soc-legend';
      if(existing){existing.dataset.beSocCompact='';row.dataset.beSocInline='';existing.append(row);}
      else canvas.parentElement.insertAdjacentElement('beforebegin',row);
      for(const [group,label,color] of [['kwh','Coulombtelling in/uit','#0891b2']]){
        const button=document.createElement('button');button.type='button';button.className='be-soc-series-toggle';
        button.dataset.beSocGroup=group;
        button.innerHTML='<span class="be-soc-series-swatch" aria-hidden="true" style="background:'+color+'"></span><span>'+label+'</span>';
        button.onclick=()=>{cfg['show_'+group]=cfg['show_'+group]===false;localStorage.setItem(key,JSON.stringify(cfg));render();};
        row.append(button);
      }
    }
    if(!row.hasAttribute('data-be-soc-inline')){
      const rect=canvas.getBoundingClientRect(),scale=chart.width>0?rect.width/chart.width:1;
      row.style.paddingLeft=Math.max(0,(chart.chartArea?.left||0)*scale)+'px';
    }
    for(const button of row.querySelectorAll('button')){
      const visible=cfg['show_'+button.dataset.beSocGroup]!==false;
      button.setAttribute('aria-pressed',String(visible));
    }
  }
  function render(){
    const C=window.Chart;if(!C?.getChart)return;
    const cv=document.getElementById('soc-chart')||document.getElementById('soc-forecast-chart');if(!cv)return;
    const chart=C.getChart(cv);if(!chart)return;
    const p=panel(cv),view=display();
    textIfChanged(p.querySelector('[data-soc]'),view.soc);
    textIfChanged(p.querySelector('[data-energy]'),view.energy);
    textIfChanged(p.querySelector('[data-state]'),view.state);
    textIfChanged(p.querySelector('[data-history]'),view.history);
    try{window.BESocNativeReadout?.render(view);}catch(e){console.warn('[SOC waarde]',e);}
    p.querySelector('[data-log]').textContent=result?.lastAnchor?'Laatste anker: '+date(result.lastAnchor.t)+' · '+result.lastAnchor.kind+' · '+number(result.lastAnchor.soc)+'% · '+result.gaps+' meetgaten in archief.':'';
    const ul=p.querySelector('[data-events]');ul.replaceChildren(...(result?.events||[]).slice(-10).reverse().map(a=>{const li=document.createElement('li');li.textContent=date(a.t)+' · '+a.kind+' → '+number(a.soc)+'%'+(a.correction!==null?' (correctie '+number(a.correction)+' pp)':'');return li;}));
    for(const name of ['soc-chart','soc-forecast-chart']){const c=C.getChart(name);if(c){decorate(c);legend(c);c.update('none');}}
  }
  function decorate(chart){

    if(chart.canvas.id==='soc-chart'){
      const history=window.BESocHistory.active(chart),range=history?window.BESocHistory.range(chart):null;
      const a=history?(range?.min??Infinity):(chart.scales.x?.min??0)-120000;
      const b=history?(range?.max??-Infinity):(chart.scales.x?.max??Infinity)+120000;
      const axis=chart.data.datasets.find(d=>!d.beOwnSOC)?.yAxisID||'y';
      dataset(chart,'measured','Coulombtelling in/uit',(result?.points||[]).filter(p=>p.t>=a&&p.t<=b).map(p=>({x:p.t,y:p.gap&&!p.anchor&&!followsOriginal(p)?null:visualSoc(p)})),{yAxisID:axis,parsing:false});
    }else if(chart.canvas.id==='soc-forecast-chart'){
      const f=forecastValues(chart);if(f){dataset(chart,'measured','Coulombtelling in/uit gemeten',f.actual,{yAxisID:'y'});dataset(chart,'forecast','Coulombtelling in/uit verwachting',f.future,{yAxisID:'y',borderDash:[],borderWidth:1.2,borderColor:'rgba(8,145,178,.55)',backgroundColor:'rgba(8,145,178,.55)'});}
    }
    if(chart.canvas.id==='soc-forecast-chart')attachPastColors(chart);
    applyVisibility(chart);
    filterNativeLegend(chart);
    try{window.BESocHover?.attach(chart,{times:(payload?.items||[]).flatMap(i=>i.hours||[])});}catch(e){console.warn("[SOC hover]",e);}
  }
  function attachPastColors(chart){
    const raw=chart.config._config||chart.config;const plugins=chart.config.plugins||(raw.plugins=[]);
    if(!plugins.some(p=>p?.id===pastColorsPlugin.id))plugins.push(pastColorsPlugin);
  }
  // The dashboard refreshes and sometimes replaces its datasets. Restore only our own series.
  let renderPending=false,started=false;
  function scheduleRender(){if(renderPending)return;renderPending=true;setTimeout(()=>{renderPending=false;register();render();},0);}
  let library;
  function register(){const C=window.Chart;if(C?.register&&C!==library){C.register(window.BESocHover.plugin,{id:'beOwnEnergySoc',beforeUpdate:decorate,afterInit:scheduleRender});library=C;}}
  new MutationObserver(records=>{
    const added=records.flatMap(r=>Array.from(r.addedNodes));
    if(added.some(n=>n.nodeType===1&&(n.matches?.('canvas')||n.querySelector?.('canvas'))))scheduleRender();
  }).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>{scheduleRender();if(started&&Date.now()-lastFetch>14000)poll();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRender();});
  let startupTries=0;
  const startupTimer=setInterval(()=>{register();scheduleRender();const C=window.Chart,ready=C?.getChart&&(C.getChart('soc-chart')||C.getChart('soc-forecast-chart'));if(ready||++startupTries>=40)clearInterval(startupTimer);},500);
  register();compute();render();
  setInterval(()=>{register();render();},5000);
  let storageTimer;
  try{db=await Promise.race([openDB(),new Promise((_,reject)=>{storageTimer=setTimeout(()=>reject(Error('Opslag reageert niet')),3000);})]);await persist();}
  catch(e){storageError='Lokale opslag niet beschikbaar: '+e.message;}
  finally{clearTimeout(storageTimer);started=true;compute();await poll();}
  setInterval(()=>{if(Date.now()-lastFetch>14000)poll();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  window.addEventListener('storage',e=>{if(e.key===key){try{cfg=JSON.parse(e.newValue||'{}');compute();render();}catch{}}});
})();
