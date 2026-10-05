(function () {
  'use strict';
  const ID='be-epex-addon', KEY='be_epex_enabled_v1', CACHE='be_epex_energyzero_prices_v1';
  if(document.getElementById(ID))return;
  const stateNode=document.createElement('script');stateNode.type='application/json';stateNode.id=ID;
  document.documentElement.appendChild(stateNode);
  const read=(key)=>{try{return localStorage.getItem(key);}catch(_){return null;}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
  let enabled=read(KEY)==='aan', rows=[],cache=null,busy=false,retryAt=0,error='',button,status;
  try{cache=JSON.parse(read(CACHE));if(cache)rows=normalise(cache.body);}catch(_){cache=null;}
  function normalise(body){
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
  function publish(){
    const s=settings();
    stateNode.textContent=JSON.stringify({enabled,rows,allin:s.aan!==false,btw:Number.isFinite(s.btw)?s.btw:1.21,opslag:Number.isFinite(s.opslag)?s.opslag:.02,eb:Number.isFinite(s.eb)?s.eb:.11085});
    document.dispatchEvent(new Event('be-epex-data'));
    if(button){
      button.setAttribute('aria-checked',String(enabled));
      button.querySelector('.be-epex-state').textContent=enabled?'AAN':'UIT';
      button.title=error||'Nederlandse EPEX day-ahead-prijs tonen of verbergen';
    }
    if(status){
      status.textContent=enabled&&error?'!':enabled&&busy&&!rows.length?'…':'';
      status.title=error||'Prijzen ophalen';status.hidden=!status.textContent;
    }

  }
  function range(){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=t=>parts.find(p=>p.type===t).value;
    const date=part('day')+'-'+part('month')+'-'+part('year');
    return {date,key:date};
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
      const body=await request('https://public.api.energyzero.nl/v1/prices?date='+r.date+'&interval=INTERVAL_QUARTER&energy_type=ENERGY_TYPE_ELECTRICITY');
      const parsed=normalise(body);if(!coversNow(parsed))throw Error('Geen actuele day-ahead-prijzen beschikbaar');
      rows=parsed;cache={key:r.key,at:Date.now(),body};save(CACHE,JSON.stringify(cache));error='';
    }catch(e){error=e.message+(rows.length?' · eerder opgehaalde prijzen zichtbaar':'');retryAt=Date.now()+300000;}
    finally{busy=false;publish();}
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
  function mount(){
    const host=document.getElementById('be-tarief-row');
    if(!host||host.querySelector('#be-epex-control'))return;
    const box=document.createElement('div');box.id='be-epex-control';
    button=document.createElement('button');button.id='be-epex-switch';button.type='button';
    button.setAttribute('role','switch');button.setAttribute('aria-label','EPEX day-ahead');
    button.innerHTML='<span>EPEX</span><span class="be-epex-track" aria-hidden="true"><span class="be-epex-thumb"></span></span><span class="be-epex-state" aria-hidden="true"></span>';
    button.addEventListener('click',()=>{enabled=!enabled;save(KEY,enabled?'aan':'uit');publish();refresh();});
    status=document.createElement('span');status.id='be-epex-status';status.setAttribute('role','status');
    const source=document.createElement('a');source.id='be-epex-source';source.textContent='i';
    source.href='https://docs.api.energyzero.nl/docs/api/swagger/public/energy-market-service-get-prices/';source.target='_blank';source.rel='noopener noreferrer';
    source.setAttribute('aria-label','Bron en toelichting EPEX');
    source.title='EPEX NL day-ahead. All-in: kale prijs × btw + € 0,02 opslag + energiebelasting. Opslag is inclusief btw en telt één keer mee. Bron: EnergyZero Public API, Nederlandse day-ahead-kwartierprijzen. Kale prijsreeks (base), zonder btw, belasting of leveranciersopslag.';
    const legend=document.createElement('div');legend.id='be-epex-legend';legend.setAttribute('aria-label','Grafieklegenda');
    box.append(legend,button,status,source);host.prepend(box);publish();refresh();
  }
  // The main plugin also bridges into the page, where its Chart instance lives.
  function chartBridge(){
    if(window.__beEpexBridge)return;window.__beEpexBridge=true;
    let data={enabled:false,rows:[]},registered=false;
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
    function install(){
      const C=typeof Chart!=='undefined'?Chart:window.Chart;if(!C)return;
      if(!registered){C.register({id:'beEpexOverlay',beforeUpdate(c){
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
      },afterUpdate(c){
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
      }});registered=true;}
      const c=C.getChart('be-tarief-chart');if(c)c.update('none');
    }
    document.addEventListener('be-epex-data',()=>{config();install();});
    document.addEventListener('be-tarief-update',()=>{config();install();});
    config();install();
  }
  const bridge=document.createElement('script');bridge.textContent='('+chartBridge.toString()+')();';document.documentElement.appendChild(bridge);bridge.remove();
  let pending=false;
  const observer=new MutationObserver(()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;mount();},150);});
  observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
  document.addEventListener('be-actueel-allin-update',publish);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){mount();refresh();}});
  window.addEventListener('storage',e=>{if(e.key===KEY){enabled=e.newValue==='aan';publish();refresh();}});
  mount();setInterval(refresh,60000);
})();
