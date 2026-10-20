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

