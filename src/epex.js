(function () {
  'use strict';
  const ID='be-epex-addon', KEY='be_epex_enabled_v1', CACHE='be_epex_nordpool_prices_v1';
  if(document.getElementById(ID))return;
  const stateNode=document.createElement('script');stateNode.type='application/json';stateNode.id=ID;
  document.documentElement.appendChild(stateNode);
  const read=(key)=>{try{return localStorage.getItem(key);}catch(_){return null;}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
  let enabled=read(KEY)==='aan', rows=[],cache=null,busy=false,retryAt=0,error='',button,status;
  const FORECAST_KEY='be_epex_forecast_enabled_v1',FORECAST_CACHE='be_epex_nordpool_forecast_prices_v1';
  let forecastEnabled=read(FORECAST_KEY)!=='uit',forecastCache={},forecastBusy=false,forecastError='';
  try{forecastCache=JSON.parse(read(FORECAST_CACHE))||{};}catch(_){}
  try{cache=JSON.parse(read(CACHE));if(cache)rows=Array.isArray(cache.rows)?cache.rows:normalise(cache.body);}catch(_){cache=null;}
  function normalise(body){
    if(Array.isArray(body?.multiAreaEntries)){
      if(body.currency!=='EUR'||body.market!=='DayAhead'||!body.deliveryAreas?.includes('NL'))throw Error('Onbekende Nord Pool-markt');
      const rows=body.multiAreaEntries.filter(r=>{const v=r?.entryPerArea?.NL;return (typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));}).map(r=>{
        const start=Date.parse(r.deliveryStart),end=Date.parse(r.deliveryEnd),price=Number(r.entryPerArea.NL)/1000;
        if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==900000)throw Error('Onbekende Nord Pool-kwartiertijden');
        return {start,end,price};
      }).sort((a,b)=>a.start-b.start);
      for(let i=1;i<rows.length;i++)if(rows[i].start<rows[i-1].end)throw Error('Overlappende Nord Pool-prijzen');
      return rows;
    }
    if(!body || body.interval!=='RESPONSE_INTERVAL_QUARTER' || !Array.isArray(body.base))throw Error('Onbekend EnergyZero-prijsformaat');
    const rows=body.base.map(r=>{
      const value=r?.price?.value;
      const start=Date.parse(r?.start),end=Date.parse(r?.end);
      // EnergyZero base is EUR/kWh, without VAT, energy tax or supplier markup.
      const price=typeof value==='string' && value.trim()!==''?Number(value):NaN;
      if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==900000||!Number.isFinite(price))throw Error('Onvolledige EnergyZero-kwartierprijs');
      return {start,end,price};
    }).sort((a,b)=>a.start-b.start);
    for(let i=1;i<rows.length;i++)if(rows[i].start<rows[i-1].end)throw Error('Overlappende EnergyZero-prijzen');
    return rows;
  }
  function coversNow(data){const now=Date.now();return data.some(r=>r.start<=now && now<r.end);}
  function settings(){
    try{return JSON.parse(document.getElementById('be-actueel-allin-data')?.textContent||'{}');}catch(_){return {};}
  }
  const FINANCE_SETTINGS = 'be_overzicht_settings_v1';
  function planPriceSettings() {
    let finance;
    try { finance = JSON.parse(read(FINANCE_SETTINGS) || '{}') || {}; }
    catch (_) { finance = {}; }
    const {tax = true, vat = true, rates} = finance;
    return {
      allin: Boolean(tax && vat),
      rates: {'2025':0.10154, '2026':0.09161, ...rates}
    };
  }
  function publish(){
    const s=settings();
    const storedMode=read('be_cfg_actueel_allin');
    const allin=storedMode===null?s.aan!==false:storedMode!=='uit';
    const planPrice=planPriceSettings();
    const forecastRows=Object.values(forecastCache).flatMap(c=>Array.isArray(c?.rows)?c.rows:[]).sort((a,b)=>a.start-b.start);
    const text=JSON.stringify({enabled,rows,forecastEnabled,forecastRows,planPrice,allin,btw:Number.isFinite(s.btw)?s.btw:1.21,opslag:Number.isFinite(s.opslag)?s.opslag:.02,eb:Number.isFinite(s.eb)?s.eb:.11085});
    if(stateNode.textContent!==text){stateNode.textContent=text;document.dispatchEvent(new Event('be-epex-data'));}
    if(button){
      button.setAttribute('aria-checked',String(enabled));
      button.querySelector('.be-epex-state').textContent=enabled?'AAN':'UIT';
      button.title=error||'Nederlandse EPEX day-ahead-prijs tonen of verbergen';
    }
    if(status){
      status.textContent=enabled&&error?'!':enabled&&busy&&!rows.length?'…':'';
      status.title=error||'Prijzen ophalen';status.hidden=!status.textContent;
    }
    const fb=document.getElementById('be-epex-forecast-switch');
    if(fb){fb.setAttribute('aria-pressed',String(forecastEnabled));fb.title='EPEX-kwartierprijs '+(forecastEnabled?'verbergen':'tonen');fb.querySelector('[data-epex-label]').textContent=planPrice.allin?'EPEX · all-in':'EPEX · excl. EB/btw';}
    const note=document.getElementById('be-epex-forecast-status');
    if(note){const message=forecastError||(forecastBusy&&!forecastRows.length?'Prijzen ophalen…':'');if(note.textContent!==message)note.textContent=message;}

  }
  function range(at=Date.now()){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
    const part=t=>parts.find(p=>p.type===t).value;
    const date=part('day')+'-'+part('month')+'-'+part('year');
    return {date,key:date};
  }
  function nordPoolUrl(date){
    const parts=date.split('-'),iso=parts[0].length===4?date:parts[2]+'-'+parts[1]+'-'+parts[0];
    return 'https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices?date='+iso+'&market=DayAhead&deliveryArea=NL&currency=EUR';
  }
  function request(url){
    return new Promise((resolve,reject)=>{
      const fn=typeof GM_xmlhttpRequest==='function'?GM_xmlhttpRequest:typeof GM!=='undefined'&&typeof GM.xmlHttpRequest==='function'?GM.xmlHttpRequest.bind(GM):null;
      if(!fn){reject(Error('De userscriptmanager heeft netwerktoegang nodig'));return;}
      fn({method:'GET',url,anonymous:true,timeout:20000,onload:r=>{
        if(r.status!==200){reject(Error('Prijsbron tijdelijk niet beschikbaar ('+r.status+')'));return;}
        try{resolve(JSON.parse(r.responseText));}catch(_){reject(Error('Ongeldige prijsresponse'));}
      },onerror:()=>reject(Error('Prijsbron niet bereikbaar')),ontimeout:()=>reject(Error('Prijsbron reageert niet'))});
    });
  }
  async function refresh(){
    if(!enabled||busy||document.hidden||!document.getElementById('be-tarief-chart')||Date.now()<retryAt)return;
    const r=range();if(cache&&cache.key===r.key&&Date.now()-cache.at<900000&&coversNow(rows)){publish();return;}
    busy=true;publish();
    try{
      const body=await request(nordPoolUrl(r.date));
      const parsed=normalise(body);if(!coversNow(parsed))throw Error('Geen actuele day-ahead-prijzen beschikbaar');
      const previous=await request(nordPoolUrl(range(Date.now()-86400000).date)).then(normalise).catch(()=>rows.filter(r=>r.end<=parsed[0].start));
      rows=[...new Map([...previous,...parsed].map(r=>[r.start,r])).values()].sort((a,b)=>a.start-b.start);
      cache={key:r.key,at:Date.now(),body,rows};save(CACHE,JSON.stringify(cache));error='';
    }catch(e){error=e.message+(rows.length?' · eerder opgehaalde prijzen zichtbaar':'');retryAt=Date.now()+300000;}
    finally{busy=false;publish();}
  }
  async function refreshForecast(){
    if(!forecastEnabled||forecastBusy||document.hidden||!document.getElementById('soc-forecast-chart'))return;
    let dates=[];try{dates=JSON.parse(document.getElementById('be-epex-forecast-range')?.textContent||'[]');}catch(_){}
    dates=[...new Set(dates)].filter(d=>/^\d{2}-\d{2}-\d{4}$/.test(d)).slice(0,3);
    if(!dates.length){const today=range().date,[d,m,y]=today.split('-').map(Number);dates=[today,range(Date.UTC(y,m-1,d+1,12)).date];}
    forecastBusy=true;forecastError='';
    try{
      for(const date of dates){
        const saved=forecastCache[date];if(saved?.retryAt>Date.now())continue;
        if(cache?.key===date&&Date.now()-cache.at<900000){forecastCache[date]={rows:normalise(cache.body),at:cache.at,retryAt:cache.at+900000};continue;}
        try{
          const body=await request(nordPoolUrl(date));
          const parsed=normalise(body);
          forecastCache[date]={rows:parsed,at:Date.now(),retryAt:Date.now()+(parsed.length?900000:300000)};
        }catch(e){forecastCache[date]={rows:saved?.rows||[],at:saved?.at||0,retryAt:Date.now()+300000};forecastError='Nog niet alle kwartierprijzen beschikbaar';}
      }
      for(const key of Object.keys(forecastCache))if(!dates.includes(key))delete forecastCache[key];
      save(FORECAST_CACHE,JSON.stringify(forecastCache));
    }finally{forecastBusy=false;publish();}
  }
  const style=document.createElement('style');style.textContent=`
    #be-epex-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%;flex-wrap:wrap;box-sizing:border-box;padding:8px 2px 4px;color:inherit}
    #be-epex-legend{display:flex;align-items:center;gap:12px;margin-right:auto;flex-wrap:wrap;font:11px/1.3 system-ui,sans-serif}
    #be-epex-legend button{display:inline-flex;align-items:center;gap:5px;border:0;padding:3px 0;margin:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
    #be-epex-legend button[aria-pressed="false"]{opacity:.5;text-decoration:line-through}
    #be-epex-legend .swatch{width:13px;height:3px;display:inline-block}
    #be-epex-switch{appearance:none;display:inline-flex;align-items:center;gap:9px;border:0;padding:3px 2px;background:transparent;color:inherit;font:500 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;cursor:pointer;box-shadow:none;margin:0;min-height:24px}
    #be-epex-switch:focus-visible{outline:2px solid #429ee8;outline-offset:4px;border-radius:4px}
    #be-epex-switch .be-epex-track{position:relative;width:34px;height:18px;flex:none;border-radius:10px;background:#868892;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
    #be-epex-switch .be-epex-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0004;transition:transform .15s}
    #be-epex-switch[aria-checked="true"] .be-epex-track{background:#287dbb}
    #be-epex-switch[aria-checked="true"] .be-epex-thumb{transform:translateX(16px)}
    #be-epex-switch .be-epex-state{min-width:24px;font-size:10px;font-weight:700;letter-spacing:.02em}
    #be-epex-source{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:1px solid currentColor;border-radius:50%;font:italic 10px Georgia,serif;color:inherit;opacity:.55;text-decoration:none}
    #be-epex-source:hover,#be-epex-source:focus{opacity:1}
    #be-epex-status{font-size:11px;font-weight:700;color:#b76a20}
    html[data-be-dark="aan"] #be-epex-switch .be-epex-track{background:#65615b!important}
    html[data-be-dark="aan"] #be-epex-switch[aria-checked="true"] .be-epex-track{background:#287dbb!important}
    html[data-be-dark="aan"] #be-epex-switch .be-epex-thumb{background:#fff!important}
    @media(max-width:700px){#be-epex-control{justify-content:flex-end;width:100%;padding-top:6px}#be-epex-switch{border-left:0}}
    @media(prefers-reduced-motion:reduce){#be-epex-switch .be-epex-thumb{transition:none}}
  `;document.documentElement.appendChild(style);
  style.textContent+=`#be-epex-forecast-switch{display:inline-flex;align-items:center;gap:5px;appearance:none;background:transparent;color:inherit;border:0;padding:3px 0;font:11px/1.3 system-ui,sans-serif;cursor:pointer}#be-epex-forecast-switch[aria-pressed="false"]{opacity:.5;text-decoration:line-through}#be-epex-forecast-switch .be-soc-series-swatch{height:2px;background:var(--be-epex-forecast-color,#9ccced)!important}#be-epex-forecast-status{font:11px/1.4 system-ui,sans-serif;opacity:.7}#be-epex-forecast-switch:focus-visible{outline:2px solid #9ccced;outline-offset:3px;border-radius:3px}`;
  style.textContent+=`
    .be-epex-plan-strip{position:relative;box-sizing:border-box;width:100%;min-width:0;flex:none;margin:4px 0 6px}
    .be-epex-plan-badge{position:absolute;box-sizing:border-box;height:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 6px;border:1px solid #d9e3ec;border-radius:7px;background:#f6f9fc;color:#33485d;font:600 11px/1.2 system-ui,sans-serif;white-space:nowrap}
    .be-epex-plan-amount{font-size:11px;font-variant-numeric:tabular-nums}
    .be-epex-plan-mode{margin-left:4px;color:#617487;font-size:9px;font-weight:500}
    .be-epex-plan-cost{color:#a92027}.be-epex-plan-credit{color:#14714c}
    html[data-be-dark="aan"] .be-epex-plan-badge{background:#272e37;border-color:#445260;color:#edf4fb}
    html[data-be-dark="aan"] .be-epex-plan-mode{color:#b5c2cf}
    html[data-be-dark="aan"] .be-epex-plan-cost{color:#fca5a5}
    html[data-be-dark="aan"] .be-epex-plan-credit{color:#86efac}
  `;
  function mountForecast(){
    const cv=document.getElementById('soc-forecast-chart');if(!cv)return;
    const legend=document.querySelector('[data-be-soc-legend="soc-forecast-chart"]');if(!legend)return;
    const existing=document.getElementById('be-epex-forecast-switch');if(existing){if(existing.parentElement!==legend)legend.appendChild(existing);return;}
    const button=document.createElement('button');button.id='be-epex-forecast-switch';button.type='button';button.className='be-soc-series-toggle';button.setAttribute('aria-label','EPEX per kwartier op forecast');
    button.innerHTML='<span class="be-soc-series-swatch" aria-hidden="true"></span><span data-epex-label>EPEX</span>';
    button.addEventListener('click',()=>{forecastEnabled=!forecastEnabled;save(FORECAST_KEY,forecastEnabled?'aan':'uit');publish();refreshForecast();});
    legend.appendChild(button);publish();refreshForecast();
  }
  function mount(){
    const host=document.getElementById('be-tarief-row');
    if(!host||host.querySelector('#be-epex-control'))return;
    const box=document.createElement('div');box.id='be-epex-control';
    button=document.createElement('button');button.id='be-epex-switch';button.type='button';
    button.setAttribute('role','switch');button.setAttribute('aria-label','EPEX day-ahead');
    button.innerHTML='<span>EPEX</span><span class="be-epex-track" aria-hidden="true"><span class="be-epex-thumb"></span></span><span class="be-epex-state" aria-hidden="true"></span>';
    button.addEventListener('click',()=>{enabled=!enabled;save(KEY,enabled?'aan':'uit');publish();refresh();});
    status=document.createElement('span');status.id='be-epex-status';
    status.setAttribute('role','status');
    const source=document.createElement('a');source.id='be-epex-source';source.textContent='i';
    source.href='https://data.nordpoolgroup.com/auction/day-ahead/prices?deliveryAreas=NL&currency=EUR';source.target='_blank';source.rel='noopener noreferrer';
    source.setAttribute('aria-label','Bron en toelichting EPEX');
    source.title='Nederlandse day-ahead-kwartierprijzen via Nord Pool. Kale beursprijs in EUR/MWh, omgerekend naar EUR/kWh. All-in: kale prijs × btw + opslag + energiebelasting.';
    const legend=document.createElement('div');legend.id='be-epex-legend';legend.setAttribute('aria-label','Grafieklegenda');
    box.append(legend,button,status,source);host.prepend(box);publish();refresh();
  }
  // The main plugin also bridges into the page, where its Chart instance lives.
  function chartBridge(){
    if(window.__beEpexBridge)return;window.__beEpexBridge=true;
    let data={enabled:false,rows:[]},library=null,attachedChart=null,attachedForecast=null;
    const forecastPending=new WeakSet();
    const forecastPaints=new WeakMap();
    const markCache=new WeakMap();
    const dayClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',year:'numeric'});
    function config(){try{data=JSON.parse(document.getElementById('be-epex-addon').textContent);}catch(_){}}
    function points(c){
      const x=c.options.scales?.x||{},min=x.min??-Infinity,max=x.max??Infinity,out=[];
      let previous=null;
      for(const r of data.rows||[]){
        if(r.end<min||r.start>max)continue;
        if(previous!==null&&r.start>previous)out.push({x:previous,y:null});
        const y=data.allin?r.price*data.btw+data.opslag+data.eb:r.price;
        out.push({x:r.start,y},{x:r.end,y});previous=r.end;
      }
      return out;
    }
    function forecastSlots(c){
      let slots=c.$beEpexForecastSlots||[];
      if(!slots.length&&Array.isArray(c.data.labels)){
        const times=c.data.labels.map(label=>typeof label==='string'&&/^\d{4}-\d\d-\d\d[T ]/.test(label)?Date.parse(label):label instanceof Date?label.getTime():NaN);
        if(times.length>1&&times.every((t,k)=>Number.isFinite(t)&&(!k||t>times[k-1])))slots=times.map((t,k)=>({t,dt:k+1<times.length?times[k+1]-t:t-times[k-1]}));
      }
      return slots.length&&window.BESOCExtras?.forecastGrid(c,slots).valid?slots:[];
    }
    function ensureForecastAxis(c){
      if(c.canvas.id!=='soc-forecast-chart')return;
      const opts=c.config.options;opts.scales=opts.scales||{};
      opts.scales.beEpex=opts.scales.beEpex||{type:'linear',axis:'y',display:false,
        grid:{display:false,drawOnChartArea:false},border:{display:false},title:{display:false},ticks:{display:false}};
    }
    function indexAt(slots,t){
      if(!slots.length||t<slots[0].t||t>slots.at(-1).t+slots.at(-1).dt)return null;
      let lo=0,hi=slots.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(slots[mid].t<=t)lo=mid+1;else hi=mid;}
      const i=Math.max(0,lo-1),step=slots[i+1]?slots[i+1].t-slots[i].t:slots[i].dt;
      if(!(step>0)||step>slots[i].dt+1)return null;
      return i+(t-slots[i].t)/step;
    }
    function forecastSignature(c){
      return JSON.stringify([data.forecastEnabled,data.btw,data.opslag,data.planPrice,data.forecastRows,c.$beEpexForecastPlans,
        forecastSlots(c).map(s=>[s.t,s.dt]),document.documentElement.getAttribute('data-be-dark'),document.documentElement.getAttribute('data-be-dark-style')]);
    }
    function requestForecast(c){
      if(document.hidden||forecastPending.has(c))return;
      forecastPending.add(c);
      (typeof requestAnimationFrame==='function'?requestAnimationFrame:f=>setTimeout(f,0))(()=>{
        forecastPending.delete(c);if(c.canvas.isConnected===false||document.hidden)return;
        if(!c.scales?.beEpex||c.$beEpexForecastSignature!==forecastSignature(c)){
          ensureForecastAxis(c);
          if(window.BEChartRefresh)window.BEChartRefresh.request(c,'update');else c.update('none');
        }
      });
    }
    function announceForecast(c){
      const dates=[...new Set(forecastSlots(c).map(s=>dayClock.format(new Date(s.t)).replace(/\//g,'-')))];
      let n=document.getElementById('be-epex-forecast-range');
      if(!n){n=document.createElement('script');n.type='application/json';n.id='be-epex-forecast-range';document.documentElement.appendChild(n);}
      const text=JSON.stringify(dates);if(n.textContent!==text){n.textContent=text;document.dispatchEvent(new Event('be-epex-forecast-range'));}
    }
    function forecastColor(c){
      function lighter(channels){return 'rgb('+channels.map(v=>Math.round(Number(v)+(255-Number(v))*.12)).join(',')+')';}
      const annotations=c.config.options.plugins?.annotation?.annotations||{};
      for(const [key,a] of Object.entries(annotations)){
        if(!a||typeof a!=='object')continue;
        if(!/day[ _-]?ahead|epex|dynamisch/i.test(key+' '+(a?.label?.content||'')))continue;
        for(const candidate of [a.borderColor,a.backgroundColor]){
          if(typeof candidate!=='string')continue;
          const rgb=candidate.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
          if(rgb)return lighter(rgb.slice(1,4));
          if(/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(candidate))return lighter([1,3,5].map(i=>parseInt(candidate.slice(i,i+2),16)));
        }
      }
      return '#9ccced';
    }
    function forecastPaint(c,color){
      if(!c.ctx?.createLinearGradient)return color;
      let saved=forecastPaints.get(c.ctx);
      if(!saved||saved.color!==color){const paint=c.ctx.createLinearGradient(0,0,1,0);paint.addColorStop(0,color);paint.addColorStop(1,color);saved={color,paint};forecastPaints.set(c.ctx,saved);}
      return saved.paint;
    }
    function financialForecastPrice(spot, deliveryDay, buying) {
      const finance = data.planPrice;
      const factor = finance.allin ? data.btw : 1;
      const eb = buying && finance.allin ? finance.rates[deliveryDay.slice(-4)] : 0;
      if (!Number.isFinite(spot) || !Number.isFinite(eb) || eb < 0) return null;
      const fee = data.opslag * factor / data.btw;
      // Exportvergoeding vóór de contractverrekening van energiebelasting.
      return (spot + eb) * factor + (buying ? fee : -fee);
    }
    function forecastPlanBlocks(plans, quotes, slots) {
      const quarter = 900000;
      const byQuarter = new Map();
      for (const plan of plans || []) {
        if (!plan || !Number.isFinite(plan.start) || plan.start % quarter !== 0 ||
            plan.end - plan.start !== quarter || !Number.isFinite(plan.quantityW) ||
            plan.quantityW === 0 || !['import', 'export'].includes(plan.direction)) continue;
        const key = plan.direction + ':' + plan.start;
        const existing = byQuarter.get(key);
        if (existing && Math.abs(existing.quantityW) !== Math.abs(plan.quantityW)) return [];
        byQuarter.set(key, plan);
      }

      const blocks = [];
      const priceByQuarter = new Map(quotes.map(quote => [quote.start, quote.price]));
      const sorted = [...byQuarter.values()].sort((a,b) => a.start - b.start || a.direction.localeCompare(b.direction));
      for (const plan of sorted) {
        const day = dayClock.format(new Date(plan.start));
        const buying = plan.direction === 'import';
        let block = blocks.at(-1);
        if (!block || block.day !== day || block.direction !== plan.direction ||
            (!buying && block.end !== plan.start)) {
          block = {start:plan.start, end:plan.start, day, direction:plan.direction, spans:[], kwh:0, total:0, missing:''};
          blocks.push(block);
        }
        const span = block.spans.at(-1);
        if (span && span[1] === plan.start) span[1] = plan.end;
        else block.spans.push([plan.start, plan.end]);
        const kwh = Math.abs(plan.quantityW) * (plan.end - plan.start) / 3600000000;
        block.kwh += kwh;
        block.end = plan.end;

        const spot = priceByQuarter.get(plan.start);
        const price = financialForecastPrice(spot, day, buying);
        if (price === null) {
          block.total = null;
          block.missing = !Number.isFinite(spot) ? 'Prijs ontbreekt' : 'EB ontbreekt';
        } else if (block.total !== null) {
          block.total += (buying ? -1 : 1) * kwh * price;
        }
      }
      const last = slots.at(-1);
      return blocks.filter(block => block.end > slots[0].t && block.start < last.t + last.dt)
        .sort((a,b) => a.start - b.start);
    }
    function clearPlanLabels(chart) {
      chart.$beEpexPlanStrip?.node.remove();
      delete chart.$beEpexPlanStrip;
    }
    function renderPlanLabels(chart) {
      const blocks = chart.$beEpexPlanBlocks || [];
      const {canvas, chartArea:area, scales:{x}, ctx} = chart;
      const frame = canvas.parentElement;
      const slots = forecastSlots(chart);
      const series = chart.data.datasets.findIndex(ds => ds.beEpexForecast);
      if (!blocks.length || !slots.length || !area || !x || !frame?.parentElement ||
          !chart.width || series < 0 || !chart.isDatasetVisible(series)) {
        clearPlanLabels(chart);
        return;
      }
      let state = chart.$beEpexPlanStrip;
      if (!state) {
        const node = document.createElement('div');
        node.className = 'be-epex-plan-strip';
        node.setAttribute('aria-label', 'Geplande Day Ahead-blokken');
        chart.$beEpexPlanStrip = state = {node, key:null};
      }
      const strip = state.node;
      if (strip.nextElementSibling !== frame) frame.insertAdjacentElement('beforebegin', strip);
      const canvasBox = canvas.getBoundingClientRect(), stripBox = strip.getBoundingClientRect();
      const scale = canvasBox.width / chart.width;
      const offset = canvasBox.left - stripBox.left;
      const min = Math.max(0, offset + area.left * scale);
      const max = Math.min(stripBox.width, offset + area.right * scale);
      if (max <= min) {
        clearPlanLabels(chart);
        return;
      }

      const positions = [];
      const horizonEnd = slots.at(-1).t + slots.at(-1).dt;
      for (const block of blocks) {
        let visibleLeft = Infinity, visibleRight = -Infinity;
        for (const [start, end] of block.spans) {
          const from = indexAt(slots, Math.max(start, slots[0].t));
          const to = indexAt(slots, Math.min(end, horizonEnd));
          if (from === null || to === null || to <= from) continue;
          const p1 = offset + x.getPixelForValue(from) * scale;
          const p2 = offset + x.getPixelForValue(to) * scale;
          const left = Math.max(min, Math.min(p1, p2));
          const right = Math.min(max, Math.max(p1, p2));
          if (Number.isFinite(left) && right > left) {
            visibleLeft = Math.min(visibleLeft, left);
            visibleRight = Math.max(visibleRight, right);
          }
        }
        if (visibleRight > visibleLeft) positions.push({block, center:(visibleLeft + visibleRight) / 2});
      }
      if (!positions.length) {
        clearPlanLabels(chart);
        return;
      }
      const key = JSON.stringify([positions, min, max, data.planPrice.allin]);
      if (key === state.key) return;
      state.key = key;

      const money = new Intl.NumberFormat('nl-NL', {style:'currency', currency:'EUR'});
      const volumeFormat = new Intl.NumberFormat('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2});
      const badges = [];
      ctx.save();
      ctx.font = '600 11px system-ui, sans-serif';
      for (const {block,center} of positions) {
        const volume = volumeFormat.format(block.kwh) + ' kWh';
        const sign = block.total > .005 ? '+' : block.total < -.005 ? '−' : '';
        const amount = block.total === null ? block.missing : sign + money.format(Math.abs(sign ? block.total : 0));
        let priceMode = '';
        if (block.total !== null) {
          priceMode = data.planPrice.allin ? (block.direction === 'import' ? 'All-in' : 'Incl. btw') : 'Excl. EB/btw';
        }
        const width = Math.min(max - min, Math.ceil(Math.max(
          ctx.measureText(volume).width,
          ctx.measureText(amount + (priceMode ? '  ' + priceMode : '')).width
        )) + 16);
        const left = Math.max(min, Math.min(max - width, center - width / 2));
        badges.push({volume,amount,priceMode,sign,width,left});
      }
      ctx.restore();

      const lanes = [], nodes = [];
      for (const badge of badges.sort((a,b) => a.left - b.left)) {
        let lane = lanes.findIndex(right => right + 5 <= badge.left);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = badge.left + badge.width;
        const node = document.createElement('div');
        node.className = 'be-epex-plan-badge';
        node.style.left = badge.left + 'px';
        node.style.top = (lane * 38) + 'px';
        node.style.width = badge.width + 'px';
        const volume = document.createElement('span');
        volume.textContent = badge.volume;
        const amount = document.createElement('span');
        amount.className = 'be-epex-plan-amount' + (badge.sign === '−' ? ' be-epex-plan-cost' : badge.sign === '+' ? ' be-epex-plan-credit' : '');
        amount.textContent = badge.amount;
        if (badge.priceMode) {
          const modeNode = document.createElement('small');
          modeNode.className = 'be-epex-plan-mode';
          modeNode.textContent = badge.priceMode;
          amount.append(modeNode);
        }
        node.append(volume, amount);
        nodes.push(node);
      }
      strip.style.height = (lanes.length * 38 - 4) + 'px';
      strip.replaceChildren(...nodes);
    }
    function forecast(c){
      const slots=forecastSlots(c),opts=c.config.options,active=!!data.forecastEnabled&&slots.length>1;
      ensureForecastAxis(c);
      const color=forecastColor(c),paint=forecastPaint(c,color);
      const swatch=document.getElementById('be-epex-forecast-switch');if(swatch)swatch.style.setProperty('--be-epex-forecast-color',color);
      let ds=c.data.datasets.find(d=>d.beEpexForecast);
      if(!active){c.$beEpexPlanBlocks=[];c.data.datasets=c.data.datasets.filter(d=>!d.beEpexForecast);c.$beEpexForecastRows=[];c.$beEpexForecastSignature=forecastSignature(c);return;}
      if(!ds){ds={beEpexForecast:true,type:'line',yAxisID:'beEpex',parsing:false,pointRadius:0,pointHitRadius:6,fill:false,spanGaps:false,order:-30};c.data.datasets.push(ds);}
      const rows=[...new Map((data.forecastRows||[]).filter(r=>Number.isFinite(r.start)&&r.end-r.start===900000&&Number.isFinite(r.price)).map(r=>[r.start,r])).values()].sort((a,b)=>a.start-b.start);
      c.$beEpexPlanBlocks = forecastPlanBlocks(c.$beEpexForecastPlans, rows, slots);
      const out=[],quoted=[];let end=null,lastValue=null;
      for(const r of rows){
        const from=Math.max(r.start,slots[0].t),to=Math.min(r.end,slots.at(-1).t+slots.at(-1).dt);
        if(to<=from)continue;
        const x=indexAt(slots,from),z=indexAt(slots,to);if(x===null||z===null)continue;
        const value = financialForecastPrice(r.price, dayClock.format(new Date(r.start)), true);
        if (value === null) continue;
        if(end!==null&&from>end){out.push({x:indexAt(slots,end),y:lastValue},{x:indexAt(slots,end),y:null});}
        out.push({x,y:value});end=to;lastValue=value;quoted.push({...r,value});
      }
      if(end!==null)out.push({x:indexAt(slots,end),y:lastValue});
      Object.assign(ds,{label:data.planPrice.allin?'EPEX · all-in':'EPEX · excl. EB/btw',borderColor:paint,backgroundColor:paint,beEpexForecastColor:color,borderWidth:1,stepped:false,tension:.3,cubicInterpolationMode:'monotone',data:out});
      c.$beEpexForecastRows=quoted;c.$beEpexForecastSignature=forecastSignature(c);
    }
    function drawForecastMarks(c){
      if(c.canvas.id!=='soc-forecast-chart')return;
      const i=c.data.datasets.findIndex(d=>d.beEpexForecast),ds=c.data.datasets[i],slots=forecastSlots(c);
      if(!ds||!slots.length||(c.isDatasetVisible?!c.isDatasetVisible(i):ds.hidden))return;
      const a=c.chartArea,x=c.scales.x,y=c.scales.beEpex,ctx=c.ctx;if(!a||!x||!y||!ctx)return;
      function time(value){
        if(value instanceof Date)return value.getTime();
        if(typeof value==='string'){
          const k=c.data.labels?.indexOf(value);
          if(k>=0)return c.data.labels.lastIndexOf(value)===k?slots[k]?.t:null;
          if(/^\d{4}-\d\d-\d\d[T ]/.test(value))return Date.parse(value);
          if(!/^[-+]?\d+(?:\.\d+)?$/.test(value))return null;
          value=Number(value);
        }
        if(!Number.isFinite(value))return null;
        if(value>=1e11)return value;if(value>=1e9)return value*1000;
        if(value<0||value>slots.length)return null;
        const k=Math.min(Math.floor(value),slots.length-1),q=slots[k];
        return q?q.t+(value-k)*(slots[k+1]?slots[k+1].t-q.t:q.dt):null;
      }
      const start=time(x.min??0),end=time(x.max??slots.length-1);if(!Number.isFinite(start)||!Number.isFinite(end))return;
      const rows=c.$beEpexForecastRows||[],key=start+':'+end;let saved=markCache.get(c);
      if(!saved||saved.rows!==rows||saved.key!==key){
        let high=null,low=null;for(const r of rows){if(r.end<=start||r.start>end||!Number.isFinite(r.value))continue;if(!high||r.value>high.value)high=r;if(!low||r.value<low.value)low=r;}
        const extrema=[];if(high)extrema.push({t:Math.max(start,high.start),value:high.value,high:true});if(low&&low.value!==high?.value)extrema.push({t:Math.max(start,low.start),value:low.value});
        saved={rows,key,extrema};markCache.set(c,saved);
      }
      const dark=document.documentElement.getAttribute('data-be-dark')==='aan',back=dark?(document.documentElement.getAttribute('data-be-dark-style')==='grafiet'?'#1c1f26':'#37322b'):'#fff';
      const backdrop=forecastPaint(c,back);ctx.save();ctx.beginPath();ctx.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.clip();ctx.font='600 10px system-ui,-apple-system,sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';
      function label(m,py){const q=indexAt(slots,m.t);if(q===null)return;const px=x.getPixelForValue(q),text=(Math.abs(m.value)<.005?0:m.value).toFixed(2),width=ctx.measureText(text).width,left=Math.max(a.left+3,Math.min(a.right-width-3,px+6)),top=Math.max(a.top+12,Math.min(a.bottom-3,py));ctx.lineWidth=3;ctx.strokeStyle=backdrop;ctx.strokeText(text,left,top);ctx.fillStyle=dark?'#edf4fb':'#405a70';ctx.fillText(text,left,top);}
      for(const m of saved.extrema){const q=indexAt(slots,m.t);if(q===null)continue;const px=x.getPixelForValue(q),py=y.getPixelForValue(m.value);if(!Number.isFinite(px)||!Number.isFinite(py)||px<a.left||px>a.right)continue;ctx.fillStyle=ds.borderColor;ctx.beginPath();ctx.arc(px,py,2.1,0,Math.PI*2);ctx.fill();label(m,py+(m.high?-8:16));}
      ctx.restore();
    }
    function install(force=false){
      const C=typeof Chart!=='undefined'?Chart:window.Chart;if(!C)return;
      if(C!==library){C.register({id:'beEpexOverlay',beforeInit:ensureForecastAxis,beforeUpdate(c){
        if(c.canvas.id==='soc-forecast-chart'){forecast(c);return;}
        if(c.canvas.id!=='be-tarief-chart')return;
        // Write raw configuration, never assign Chart.js option resolvers to themselves.
        const opts=c.config.options;
        opts.plugins=opts.plugins||{};
        opts.plugins.legend=opts.plugins.legend||{};
        opts.plugins.legend.display=false;
        let ds=c.data.datasets.find(d=>d.beEpex);
        if(!data.enabled){c.data.datasets=c.data.datasets.filter(d=>!d.beEpex);return;}
        if(!ds){ds={beEpex:true,label:'EPEX NL',borderColor:'#429ee8',backgroundColor:'#429ee8',borderWidth:2,pointRadius:0,pointHitRadius:8,fill:false,spanGaps:false,stepped:'before',tension:0,order:-10};c.data.datasets.push(ds);}
        ds.label=data.allin?'EPEX · all-in':'EPEX · kaal';ds.data=points(c);
        ds.tooltip={callbacks:{label:z=>ds.label+': € '+z.parsed.y.toLocaleString('nl-NL',{minimumFractionDigits:3,maximumFractionDigits:5})+'/kWh'}};
      },afterDraw:drawForecastMarks,afterDestroy:clearPlanLabels,afterUpdate(c){
        if(c.canvas.id==='soc-forecast-chart'){renderPlanLabels(c);announceForecast(c);requestForecast(c);return;}
        if(c.canvas.id!=='be-tarief-chart')return;
        const host=document.getElementById('be-epex-legend');if(!host)return;
        const bar=host.parentElement,rect=c.canvas.getBoundingClientRect(),barRect=bar.getBoundingClientRect();
        if(c.chartArea&&c.width&&rect.width){
          const left=Math.max(0,rect.left+c.chartArea.left*rect.width/c.width-barRect.left);
          const padding=left.toFixed(2)+'px';
          if(bar.style.paddingLeft!==padding)bar.style.paddingLeft=padding;
        }
        const items=c.data.datasets.map((d,i)=>({label:d.label,color:d.borderColor,index:i,visible:c.isDatasetVisible(i)}));
        const key=JSON.stringify(items);if(host.dataset.key===key)return;host.dataset.key=key;
        host.replaceChildren();
        items.forEach(item=>{
          const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed',String(item.visible));
          const swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundColor=typeof item.color==='string'?item.color:'#888';swatch.setAttribute('aria-hidden','true');
          const label=document.createElement('span');label.textContent=item.label;button.append(swatch,label);
          button.addEventListener('click',()=>{c.setDatasetVisibility(item.index,!c.isDatasetVisible(item.index));c.update('none');});host.append(button);
        });
      }});library=C;}
      const c=C.getChart('be-tarief-chart');if(c&&(force||c!==attachedChart)){attachedChart=c;c.update('none');}
      const f=C.getChart('soc-forecast-chart');attachedForecast=f;if(f){ensureForecastAxis(f);requestForecast(f);}
    }
    document.addEventListener('be-epex-data',()=>{config();install(true);});
    document.addEventListener('be-tarief-update',()=>{config();install(true);});
    document.addEventListener('be-dark-change',()=>{config();install(true);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){config();install();}});
    config();install();
    setInterval(()=>{const C=window.Chart;if(C?.getChart&&(C!==library||C.getChart('be-tarief-chart')!==attachedChart||C.getChart('soc-forecast-chart')!==attachedForecast)){config();install();}},1000);
  }
  const bridge=document.createElement('script');bridge.textContent='('+chartBridge.toString()+')();';document.documentElement.appendChild(bridge);bridge.remove();
  let pending=false;
  const observer=new MutationObserver(()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;mount();mountForecast();},150);});
  observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
  document.addEventListener('be-actueel-allin-update',publish);
  document.addEventListener('be-financial-settings-update',publish);
  window.addEventListener('pageshow',publish);
  document.addEventListener('be-epex-forecast-range',()=>{mountForecast();refreshForecast();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){mount();mountForecast();refresh();refreshForecast();}});
  window.addEventListener('storage',e=>{
    if(e.key===KEY){enabled=e.newValue==='aan';publish();refresh();}
    if(e.key==='be_cfg_actueel_allin'||e.key===FINANCE_SETTINGS||e.key===null)publish();
  });
  mount();mountForecast();setInterval(()=>{refresh();refreshForecast();},60000);
})();
