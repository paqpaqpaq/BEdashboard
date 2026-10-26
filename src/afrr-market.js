/* Regelvermogen & biedingen — 6.4. No embedded credentials. */
(function () {
  'use strict';
  const INTERVAL=12000, QUARTER=900000, TIMEOUT=10000, LEASE=15000;
  const ID='be-tennet-standalone-test', CONFIG='be-afrr-market-settings-v1';
  const PANEL_SETTING='be_cfg_afrr_market';
  const HOSTS={production:'https://api.tennet.eu',acceptance:'https://api.acc.tennet.eu'};
  const PATH='/publications/v1/balance-delta-high-res/latest';
  const MOL_PATH='/publications/v1/merit-order-list';
  const clock=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  let host,shadow,config={},state=null,molState=null,budgetState=null,bidState={},bidError='',coordinator,timer,busy=false,inFlight=false,localError='',destroyed=false;
  let bidDB,observedCustomer='',lastBidRead=0;
  let marketHistory=[],historyIdentity='',learnedSignature='',historyReadAt=0;
  let emsRows=[],emsInstallation='',emsRevision=0,emsDB,lastEmsRead=0,graphDuration=1800000,graphSelection=null;
  const owner=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  function panelEnabled(){try{return localStorage.getItem(PANEL_SETTING)!=='uit';}catch(_){return true;}}

  class Fault extends Error {
    constructor(kind,message,status=0,retryAt=0){super(message);Object.assign(this,{kind,status,retryAt});}
  }
  function numeric(value){
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value!=='string'||!value.trim()||!/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(value.trim()))return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  }
  const quarter=t=>Math.floor(t/QUARTER)*QUARTER;
  // TenneT refreshes every 12 seconds; ask at :01/:13/:25/:37/:49.
  const publicationAfter=t=>Math.ceil((t-1000)/INTERVAL)*INTERVAL+1000;
  function sourceTime(value){
    return typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)?Date.parse(value):NaN;
  }
  function utcParameter(t){
    const d=new Date(t),pad=n=>String(n).padStart(2,'0');
    return pad(d.getUTCDate())+'-'+pad(d.getUTCMonth()+1)+'-'+d.getUTCFullYear()+' '+
      pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+':'+pad(d.getUTCSeconds());
  }
  function meritPath(q){
    return MOL_PATH+'?date_from='+encodeURIComponent(utcParameter(q-QUARTER))+'&date_to='+encodeURIComponent(utcParameter(q+QUARTER));
  }
  function parseMerit(body){
    if(body?.error)throw new Fault('no-data','De biedladder is nog niet beschikbaar.');
    const response=body?.Response;
    if(response?.informationType!=='MERIT_ORDER_LIST'||!Array.isArray(response.TimeSeries))throw new Fault('format','Het antwoord bevat geen Merit Order List.');
    const quarters=new Map();
    for(const series of response.TimeSeries){
      if(!['MAW','MW'].includes(series.quantity_Measurement_Unit_name)||series.price_Measurement_Unit_name!=='MWh'||series.currency_Unit_name!=='EUR')throw new Fault('format','Onverwachte eenheid in de biedladder.');
      for(const period of Array.isArray(series.Period)?series.Period:[series.Period]){
        for(const p of period?.Points||period?.points||[]){
          const start=sourceTime(p.timeInterval_start),end=sourceTime(p.timeInterval_end);
          if(!Number.isFinite(start)||quarter(start)!==start||end!==start+QUARTER)continue;
          const thresholds=new Map();
          for(const entry of p.Thresholds||[]){
            const t=entry.threshold||entry,capacity=numeric(t.capacity_threshold);
            if(capacity!==null&&capacity>=0)thresholds.set(capacity,{capacity,up:numeric(t.price_up),down:numeric(t.price_down)});
          }
          if(thresholds.size){
            const old=quarters.get(start);
            // Ambiguous series must not silently become one aFRR ladder.
            const row={start,end,thresholds:[...thresholds.values()].sort((a,b)=>a.capacity-b.capacity)};
            if(old&&JSON.stringify(old)!==JSON.stringify(row))throw new Fault('format','Meerdere verschillende biedladders voor hetzelfde kwartier.');
            quarters.set(start,row);
          }
        }
      }
    }
    if(!quarters.size)throw new Fault('no-data','Geen bruikbare biedladder ontvangen.');
    return {quarters:[...quarters.values()].sort((a,b)=>a.start-b.start)};
  }
  function ladderPosition(ladder,bid,direction){
    if(!ladder||!Number.isFinite(bid))return null;
    const values=ladder.thresholds.filter(t=>Number.isFinite(t[direction]));
    if(!values.length)return null;
    const sign=direction==='up'?1:-1;
    for(let i=1;i<values.length;i++)if(sign*(values[i][direction]-values[i-1][direction])<0)return null;
    let lower=0;
    for(let i=0;i<values.length;i++){
      const p=values[i],difference=sign*(p[direction]-bid);
      if(difference<0){lower=p.capacity;continue;}
      let upper=p.capacity;
      if(difference===0){while(i+1<values.length&&values[i+1][direction]===bid)upper=values[++i].capacity;}
      return {lower,upper};
    }
    return {lower,upper:null};
  }
  function captureBid(record,now){
    if(!record||!Number.isFinite(record.start)||quarter(record.start)!==record.start||record.end!==record.start+QUARTER||record.carried||record.start>now)return null;
    const result={start:record.start,end:record.end};
    for(const direction of ['import','export']){
      const saved=record[direction];
      const observations=saved?.observations||(saved?[saved]:[]);
      const early=observations.filter(o=>Number.isFinite(o.value)&&Number.isFinite(o.observedAt)&&o.observedAt>=record.start&&o.observedAt<record.start+120000&&o.observedAt<=now)
        .sort((a,b)=>b.observedAt-a.observedAt)[0];
      if(early)result[direction]={value:early.value,observedAt:early.observedAt};
      if(record.afrrBidStatus?.[direction]==='bid_fallback'&&now>=record.start&&now<record.start+120000){
        const value=numeric(record.values?.['afrr_'+direction]);
        if(value!==null)result[direction]={value,observedAt:now};
      }
    }
    return result.import||result.export?result:null;
  }
  function comparison(row,bid,ladder,direction,stale=false){
    if(stale)return {label:'Bron verouderd',detail:'Geen actuele afroepindicatie.',tone:'muted'};
    if(!row)return {label:'Wachten op bronmeting',detail:'Nog geen TenneT-meting beschikbaar.',tone:'muted'};
    const d=direction==='up'?'export':'import';
    if(!bid?.[d]||bid.start!==quarter(row.start))return {label:'BID ontbreekt voor bronkwartier',detail:'Een BID uit een ander kwartier wordt niet gebruikt.',tone:'muted'};
    const value=bid[d].value*1000,volume=row[direction],price=row[direction+'Price'];
    const position=ladderPosition(ladder,value,direction);
    if(volume===null)return {label:'Regelvermogen onbekend',detail:'Een ontbrekende waarde is geen nul.',position,tone:'muted'};
    if(volume===0)return {label:'Geen regelvolume zichtbaar',detail:'In deze bronmeting staat 0 MW; dit voorspelt de rest van het kwartier niet.',position,tone:'muted'};
    if(price===null)return {label:'Activatie niet bevestigd',detail:'Er staat vermogen zonder bijbehorende activatieprijs in de bron.',position,tone:'muted'};
    const reached=direction==='up'?price>=value:price<=value;
    return {label:reached?'Biedprijs bereikt in bronmeting':'Biedprijs nog niet bereikt',
      detail:(reached?'Prijs ligt '+number(Math.abs(price-value),2)+' €/MWh voorbij jouw BID.':'Nog '+number(Math.abs(price-value),2)+' €/MWh tot jouw BID.')+
        ' '+number(volume)+' MW '+(direction==='up'?'opregelen.':'afregelen.'),position,tone:reached?'reached':'waiting'};
  }
  function powerRows(rows,now=Date.now()){
    const map=new Map();
    for(const r of rows||[]){
      if(!Number.isFinite(r?.t)||r.t>now+10000||r.t<now-6*3600000||!Number.isFinite(r.po))continue;
      const old=map.get(r.t),detail=r.detail===2?2:1;
      if(!old||detail>=old.detail)map.set(r.t,{t:r.t,po:r.po,detail,...(Number.isFinite(r.bo)?{bo:r.bo}:{})});
    }
    const sorted=[...map.values()].sort((a,b)=>a.t-b.t),fine=sorted.filter(r=>r.detail===2),intervals=[];
    for(let i=1;i<fine.length;i++)if(fine[i].t-fine[i-1].t<=300000)intervals.push([fine[i-1].t,fine[i].t]);
    let i=0;
    return sorted.filter(r=>{if(r.detail===2)return true;while(i<intervals.length&&intervals[i][1]<r.t)i++;
      return !(i<intervals.length&&intervals[i][0]<=r.t&&r.t<=intervals[i][1]);});
  }
  function graphWindow(now,duration){
    const span=[1800000,7200000,21600000].includes(Number(duration))?Number(duration):1800000;
    return {start:now-span,end:now};
  }
  function marketFeature(row,bid,ladder,direction,rows){
    const d=direction==='up'?'export':'import',b=bid?.[d];
    if(!row||!b||bid.start!==quarter(row.start)||row[direction]===null)return null;
    const price=b.value*1000,p=ladderPosition(ladder,price,direction);
    if(!p||p.upper===null||(row[direction]>0&&row[direction+'Price']===null))return null;
    const scale=Math.max(10,(p.lower+p.upper)/2),volume=row[direction];
    const previous=rows.filter(r=>r.start>=bid.start&&r.end<=row.end-60000&&r.end>=row.end-90000&&r[direction]!==null).at(-1);
    const change=previous?(volume-previous[direction])/scale:null;
    const trend=change===null?null:change>.1?1:change<-.1?-1:0;
    const hit=volume===0?false:direction==='up'?row.upPrice>=price:row.downPrice<=price;
    return {ratio:volume/scale,trend,hit};
  }
  function trainingQuarter(rows,bid,ladder,lag){
    if(!bid||!ladder||!Number.isFinite(lag)||lag<0||lag>300000)return null;
    const q=bid.start,points=rows.filter(r=>r.start>=q&&r.end<=q+QUARTER);
    // A partial quarter or a missing 12-second point may never become a
    // negative training example. No future points enter the feature vector.
    if(!points.length||points[0].start!==q||points.at(-1).end!==q+QUARTER||points.some((r,i)=>r.end-r.start>12000||(i&&r.start!==points[i-1].end)))return null;
    const samples=[];
    for(const direction of ['up','down'])for(let minute=3;minute<=14;minute++){
      const at=q+minute*60000,known=points.filter(r=>r.end<=at-lag).at(-1);
      const feature=marketFeature(known,bid,ladder,direction,points);
      const d=direction==='up'?'export':'import';
      if(!feature||bid[d].observedAt>at)continue;
      const future=points.filter(r=>r.start>=at);
      // Missing prices with positive volume are not labelled as failed calls.
      if(!future.length||future.some(r=>r[direction]===null||(r[direction]>0&&r[direction+'Price']===null)))continue;
      const price=bid[d].value*1000;
      samples.push({...feature,minute,direction,lag,
        outcome:future.some(r=>r[direction]>0&&(direction==='up'?r.upPrice>=price:r.downPrice<=price))});
    }
    return samples.length?{start:q,samples}:null;
  }
  function historicalChance(history,row,bid,ladder,direction,rows,now){
    const q=quarter(now),minute=Math.floor((now-q)/60000),lag=now-(row?.end||0);
    if(quarter(row?.start)!==q||minute<3||minute>14)return null;
    const feature=marketFeature(row,bid,ladder,direction,rows);if(!feature)return null;
    const matching=[];
    for(const r of history){
      if(r.start>=q||r.start<q-30*86400000)continue;
      const sample=r.samples.find(s=>s.direction===direction&&s.minute===minute&&Math.abs(s.lag-lag)<=24000&&
        Math.abs(s.ratio-feature.ratio)<=.25&&s.hit===feature.hit&&s.trend===feature.trend);
      if(sample)matching.push(sample);
    }
    const n=matching.length,wins=matching.filter(s=>s.outcome).length;
    if(n<30)return {n};
    const p=wins/n,z=1.96,divisor=1+z*z/n,centre=(p+z*z/(2*n))/divisor;
    const width=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/divisor;
    return {n,p,lower:Math.max(0,centre-width),upper:Math.min(1,centre+width)};
  }
  function parsePayload(body,now=Date.now()){
    if(!body||typeof body!=='object')throw new Fault('format','Onbekend antwoordformaat van TenneT.');
    if(body.error||body.Error_message)throw new Fault('no-data','TenneT levert op dit moment geen bruikbare dataset.');
    const response=body.Response;
    if(response?.informationType!=='BALANCE_DELTA_HIGH_RES'||!Array.isArray(response.TimeSeries))throw new Fault('format','Het antwoord bevat geen Balance Delta High Res-dataset.');
    const byTime=new Map();
    for(const series of response.TimeSeries){
      const unit=series.quantity_Measurement_Unit_name??series['quantity_Measurement_Unit.name'];
      if(unit&&!['MAW','MW'].includes(unit))throw new Fault('format','Onverwachte eenheid voor regelvermogen.');
      if(series.currency_Unit_name&&series.currency_Unit_name!=='EUR')throw new Fault('format','Onverwachte valuta voor de regelprijzen.');
      const periods=Array.isArray(series.Period)?series.Period:[series.Period];
      for(const period of periods){
        if(!Array.isArray(period?.points))continue;
        for(const p of period.points){
          if(!/(?:Z|[+-]\d\d:\d\d)$/.test(p.timeInterval_start||'')||!/(?:Z|[+-]\d\d:\d\d)$/.test(p.timeInterval_end||''))continue;
          const start=Date.parse(p.timeInterval_start),end=Date.parse(p.timeInterval_end);
          if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>now+60000)continue;
          if(!('power_afrr_in' in p)||!('power_afrr_out' in p))continue;
          const up=numeric(p.power_afrr_in),down=numeric(p.power_afrr_out);
          const row={start,end,up:up!==null&&up>=0?up:null,down:down!==null&&down>=0?down:null,
            upPrice:numeric(p.max_upw_regulation_price),downPrice:numeric(p.min_downw_regulation_price),
            midPrice:numeric(p.mid_price),picassoIn:numeric(p.power_picasso_in),picassoOut:numeric(p.power_picasso_out)};
          byTime.set(start,row);
        }
      }
    }
    const rows=[...byTime.values()].sort((a,b)=>a.start-b.start).slice(-3600);
    if(!rows.length)throw new Fault('no-data','Geen bruikbare metingen in het TenneT-antwoord.');
    return {rows,latest:rows[rows.length-1]};
  }
  function signal(row){
    if(!row)return 'Nog geen meting ontvangen.';
    if(row.up===null||row.down===null)return 'Het regelvolume is niet volledig ingevuld in de bron.';
    const up=row.up>0&&row.upPrice!==null,down=row.down>0&&row.downPrice!==null;
    if(up&&down)return 'Op- én afregelactivatie zichtbaar in deze bronmeting.';
    if(up)return 'Opregelactivatie zichtbaar · richting ontladen / export.';
    if(down)return 'Afregelactivatie zichtbaar · richting laden / import.';
    if(row.up>0||row.down>0)return 'Volume gemeld zonder bijbehorende activatieprijs; activatie niet bevestigd.';
    return 'Geen aFRR-volume gemeld in deze bronmeting.';
  }
  function retryAfter(headers,now){
    const value=(headers||'').match(/^retry-after:\s*(.+)$/im)?.[1]?.trim();
    if(!value)return 0;
    if(/^\d+$/.test(value))return now+Number(value)*1000;
    const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:0;
  }
  function failureDelay(error,failures,now){
    const exponential=Math.min(900000,60000*Math.pow(2,Math.min(4,Math.max(0,failures-1))));
    return error.kind==='no-data'?INTERVAL:Math.max(exponential,error.retryAt>now?error.retryAt-now:0);
  }
  // One atomic read/write transaction reserves each request across dashboard
  // tabs. No key is written to IndexedDB; it stays in userscript-manager storage.
  function createCoordinator(indexedDB,name='be-tennet-standalone-v1'){
    let opened;
    function database(){
      if(!indexedDB)return Promise.reject(new Fault('storage','Gedeelde browseropslag is niet beschikbaar. Er worden geen API-aanvragen gestart.'));
      if(!opened)opened=new Promise((resolve,reject)=>{
        const req=indexedDB.open(name,1);
        req.onupgradeneeded=()=>req.result.createObjectStore('state',{keyPath:'id'});
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(new Fault('storage','De gedeelde aanvraagplanner kan niet worden geopend.'));
        req.onblocked=()=>reject(new Fault('storage','De gedeelde aanvraagplanner is geblokkeerd.'));
      });
      return opened;
    }
    async function transaction(ids,update){
      const db=await database();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),records={};let result,pending=ids.length;
        for(const id of ids){const req=store.get(id);req.onsuccess=()=>{
          records[id]=req.result||null;
          if(--pending===0)try{
            const changed=update(records);result=changed.value;
            for(const row of changed.write||[])store.put(row);
          }catch(e){reject(e);tx.abort();}
        };}
        tx.oncomplete=()=>resolve(result);
        tx.onerror=tx.onabort=()=>reject(new Fault('storage','De gedeelde aanvraagplanner kon niet worden bijgewerkt.'));
      });
    }
    return {
      read:(id='live')=>transaction([id],r=>({value:r[id]})),
      power:(customer,rows,now)=>transaction(['power:'+customer],r=>{
        const id='power:'+customer,saved=powerRows([...(r[id]?.rows||[]),...rows],now);
        return {write:rows.length?[{id,rows:saved}]:[],value:saved};
      }),
      clear:()=>transaction(['live','mol'],()=>({write:['live','mol'].map(id=>({id,scope:'',nextAt:0})),value:null})),
      retry:(scope,id='live')=>transaction([id],r=>{
        const s=r[id];
        if(!s||s.scope!==scope)return {value:s};
        // A manual retry never bypasses publication cadence or Retry-After.
        const next={...s,authBlocked:false};return {write:[next],value:next};
      }),
      bids:(customer,records,now)=>transaction(['bids:'+customer],r=>{
        const id='bids:'+customer,rows={...(r[id]?.rows||{})};
        for(const incoming of records){
          const row=captureBid(incoming,now);if(!row)continue;
          const old=rows[row.start]||{start:row.start,end:row.end};
          for(const d of ['import','export'])if(row[d]&&(!old[d]||row[d].observedAt>=old[d].observedAt))old[d]=row[d];
          rows[row.start]=old;
        }
        for(const key of Object.keys(rows))if(Number(key)<quarter(now)-7*86400000)delete rows[key];
        return {write:records.length?[{id,rows}]:[],value:rows};
      }),
      history:(scope,customer,records,now)=>transaction(['history:'+scope+':'+customer],r=>{
        const id='history:'+scope+':'+customer,byQuarter=new Map((r[id]?.quarters||[]).map(p=>[p.start,p]));
        for(const row of records)if(row.start+QUARTER<=now&&!byQuarter.has(row.start))byQuarter.set(row.start,row);
        const quarters=[...byQuarter.values()].filter(p=>p.start>=quarter(now)-30*86400000).sort((a,b)=>a.start-b.start).slice(-3000);
        return {write:records.length?[{id,quarters}]:[],value:quarters};
      }),
      reserve:(scope,tab,now,id='live')=>transaction([id,'budget'],r=>{
        const saved=r[id],s=saved?.scope===scope?saved:{id,scope,nextAt:0,attempts:[],failures:0};
        const q=quarter(now),budget=r.budget||{id:'budget',attempts:[],molAttempts:[]};
        const attempts=(s.attempts||[]).filter(t=>t>now-60000);
        const all=(budget.attempts||[]).filter(t=>t>now-60000),daily=(budget.molAttempts||[]).filter(t=>t>now-86400000);
        const blocked=Math.max(s.nextAt||0,s.leaseUntil||0,budget.nextAt||0,
          all.length>=8?all[0]+60000:0,id==='live'&&attempts.length>=5?attempts[0]+60000:0,
          id==='mol'&&daily.length>=500?daily[0]+86400000:0);
        const alreadyLoaded=id==='mol'&&s.good?.quarters.some(p=>p.start===q);
        const exhausted=id==='mol'&&s.target===q&&s.tries>=3;
        if(s.authBlocked||blocked>now||alreadyLoaded||exhausted)return {value:{reserved:false,state:s,retryAt:alreadyLoaded||exhausted?q+QUARTER+1000:blocked}};
        const next={...s,owner:tab,leaseUntil:now+LEASE,nextAt:id==='live'?publicationAfter(now+INTERVAL):now+60000,
          lastAttempt:now,attempts:[...attempts,now],target:q,tries:s.target===q?(s.tries||0)+1:1};
        const nextBudget={id:'budget',nextAt:now+1100,attempts:[...all,now],molAttempts:id==='mol'?[...daily,now]:daily};
        return {write:[next,nextBudget],value:{reserved:true,state:next}};
      }),
      success:(scope,tab,data,now,id='live')=>transaction([id],r=>{
        const s=r[id];
        if(!s||s.scope!==scope||s.owner!==tab)return {value:s};
        let good,nextAt=s.nextAt,error='',unchanged=0;
        if(id==='mol'){
          const rows=new Map((s.good?.quarters||[]).map(p=>[p.start,p]));data.quarters.forEach(p=>rows.set(p.start,p));
          good={quarters:[...rows.values()].filter(p=>p.end>quarter(now)-2*QUARTER),fetchedAt:now};
          const loaded=good.quarters.some(p=>p.start===quarter(now));
          nextAt=loaded?quarter(now)+QUARTER+1000:now+60000;
          if(!loaded)error='Biedladder van het huidige kwartier nog niet gepubliceerd; maximaal drie pogingen per kwartier.';
        }else{
          const previous=s.good,advances=!previous||data.latest.end>previous.latest.end;
          const merged=new Map((previous?.rows||[]).map(p=>[p.start,p]));
          data.rows.forEach(p=>merged.set(p.start,p));
          const rows=[...merged.values()].filter(p=>p.end>now-6*3600000).sort((a,b)=>a.start-b.start).slice(-3600);
          const latest=rows.at(-1)||data.latest;
          good={rows,latest,fetchedAt:now,advancedAt:advances?now:previous.advancedAt};
          unchanged=advances?0:(s.unchanged||0)+1;
          // Duplicate/stalled publications do not justify 12-second polling.
          const interval=unchanged?Math.min(60000,INTERVAL*Math.pow(2,Math.min(3,unchanged))):INTERVAL;
          nextAt=publicationAfter(Math.max(s.lastAttempt+interval,now+1000));
        }
        const next={...s,good,nextAt,unchanged,owner:'',leaseUntil:0,error,status:200,failures:0,authBlocked:false};
        return {write:[next],value:next};
      }),
      failure:(scope,tab,error,now,id='live')=>transaction([id,'budget'],r=>{
        const s=r[id];
        if(!s||s.scope!==scope||s.owner!==tab)return {value:s};
        const failures=(s.failures||0)+1;
        const next={...s,owner:'',leaseUntil:0,error:error.message,status:error.status||0,failures,
          authBlocked:error.kind==='auth',nextAt:Math.max(s.nextAt||0,now+(id==='mol'?Math.max(60000,failureDelay(error,failures,now)):failureDelay(error,failures,now)))};
        const write=[next];
        if(error.status===429)write.push({...r.budget,id:'budget',nextAt:Math.max(r.budget?.nextAt||0,next.nextAt)});
        return {write,value:next};
      })
    };
  }
  function manager(){
    if(globalThis.BEAfrrExtensionManager)return globalThis.BEAfrrExtensionManager;
    const modern=typeof GM!=='undefined'?GM:{};
    return {
      get:typeof GM_getValue==='function'?GM_getValue:modern.getValue?.bind(modern),
      set:typeof GM_setValue==='function'?GM_setValue:modern.setValue?.bind(modern),
      del:typeof GM_deleteValue==='function'?GM_deleteValue:modern.deleteValue?.bind(modern),
      request:typeof GM_xmlhttpRequest==='function'?GM_xmlhttpRequest:modern.xmlHttpRequest?.bind(modern)
    };
  }
  async function loadConfig(){
    const m=manager();if(!m.get||!m.set)throw new Fault('manager','De opslag van je userscriptmanager is niet beschikbaar; er worden geen TenneT-aanvragen gestart.');
    const c=await m.get(CONFIG,{});
    return c&&typeof c==='object'?{key:typeof c.key==='string'?c.key:'',scope:c.scope||'',enabled:c.enabled===true,
      environment:c.environment==='acceptance'?'acceptance':'production'}:{};
  }
  function request(c,channel='live',q=quarter(Date.now())){
    return new Promise((resolve,reject)=>{
      const fn=manager().request;
      if(!fn){reject(new Fault('manager','Deze installatie biedt geen toegang tot de TenneT-API.'));return;}
      let settled=false;
      function failed(e){if(!settled){settled=true;reject(e);}}
      function received(r){
        if(settled)return;
        const status=Number(r.status)||0;
        if(status!==200){
          const messages={401:'Geen geldige sleutel voor deze omgeving of API (HTTP 401).',
            403:'Toegang geweigerd (HTTP 403). Controleer omgeving en API-toegang; ook een verbindingsblokkade is mogelijk.',
            429:'Aanvraaglimiet bereikt (HTTP 429). Automatisch verversen wacht nu.'};
          failed(new Fault(status===401||status===403?'auth':'http',messages[status]||'TenneT-API geeft HTTP '+status+'.',status,retryAfter(r.responseHeaders,Date.now())));return;
        }
        try{
          if(typeof r.responseText!=='string'||r.responseText.length>4000000)throw new Fault('format','Onbruikbaar of te groot API-antwoord.');
          let body;try{body=JSON.parse(r.responseText);}catch(_){throw new Fault('format','TenneT gaf geen JSON-dataset terug (HTTP 200).');}
          const parsed=channel==='mol'?parseMerit(body):parsePayload(body);settled=true;resolve(parsed);
        }catch(e){const fault=e instanceof Fault?e:new Fault('format','De dataset kon niet worden verwerkt.');fault.status=200;failed(fault);}
      }
      try{
        const handle=fn({method:'GET',url:HOSTS[c.environment]+(channel==='mol'?meritPath(q):PATH),headers:{apikey:c.key,Accept:'application/json'},anonymous:true,
          timeout:TIMEOUT,onload:received,onerror:()=>failed(new Fault('network','TenneT is vanaf deze browser niet bereikbaar.')),
          ontimeout:()=>failed(new Fault('network','TenneT reageerde niet binnen 10 seconden.')),
          onabort:()=>failed(new Fault('network','Aanvraag afgebroken.'))});
        if(handle?.then)handle.then(r=>{if(r?.status!==undefined)received(r);},()=>failed(new Fault('network','De netwerkoproep is mislukt.')));
      }catch(_){failed(new Fault('manager','De userscriptmanager kon de API-aanvraag niet starten.'));}
    });
  }
  const number=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('nl-NL',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const time=t=>Number.isFinite(t)?clock.format(t):'—';
  const age=ms=>ms<60000?Math.max(0,Math.floor(ms/1000))+' s':Math.floor(ms/60000)+' min '+Math.floor(ms/1000)%60+' s';
  function text(selector,value){const el=shadow?.querySelector(selector);if(el&&el.textContent!==value)el.textContent=value;}
  function customer(){
    const valid=id=>id&&!/^(?:account|results|current-history|current-prices|undefined|null)$/i.test(id);
    const path=location.pathname.match(/^\/customer\/([^/]+)(?:\/|$)/)?.[1];
    if(valid(path))return path;
    // Read the same installation identifier as the main plugin, without requests.
    try{const id=localStorage.getItem('be_laatste_installatie');if(valid(id))return id;}catch(_){}
    for(const link of document.querySelectorAll('a[href*="/customer/"]')){
      const id=link.pathname?.match(/^\/customer\/([^/]+)\/(?:results|account)(?:\/|$)/)?.[1];if(valid(id))return id;
    }
    return '';
  }
  function showPower(id,rows){
    if(id!==customer())return;
    emsInstallation=id;emsRows=rows;emsRevision++;renderGraph();
  }
  async function receivePower(event){
    if(!panelEnabled()||!coordinator)return;
    try{
      const data=typeof event.detail==='string'?JSON.parse(event.detail):event.detail,id=customer();
      if(!id||data?.installation!==id||!Array.isArray(data.rows))return;
      showPower(id,await coordinator.power(id,powerRows(data.rows),Date.now()));
    }catch(_){}
  }
  async function readPower(force=false){
    const now=Date.now(),id=customer();if(!id)return;
    if(id!==emsInstallation){emsInstallation=id;emsRows=[];lastEmsRead=0;emsRevision++;}
    if(!force&&now-lastEmsRead<15000)return;lastEmsRead=now;
    try{
      showPower(id,await coordinator.power(id,[],now));
      if(!emsDB)emsDB=new Promise((resolve,reject)=>{
        const req=indexedDB.open('balansenergie-bronnen-v1',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('dagen');
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error());req.onblocked=()=>reject(Error());
      });
      const db=await emsDB,day=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
      const keys=[...new Set([day(now),day(now-6*3600000)])];
      const rows=await new Promise((resolve,reject)=>{
        const tx=db.transaction('dagen','readonly'),all=[];let left=keys.length;
        for(const key of keys){const req=tx.objectStore('dagen').get(id+':'+key);
          req.onsuccess=()=>{all.push(...(req.result?.rows||[]));if(--left===0)resolve(all);};req.onerror=()=>reject(Error());}
      });
      showPower(id,await coordinator.power(id,powerRows(rows,now),now));
    }catch(_){} // The live public meter event remains available if the archive is unavailable.
  }
  async function readBids(force=false){
    const now=Date.now(),id=customer();
    if(id!==observedCustomer){observedCustomer=id;bidState={};marketHistory=[];learnedSignature='';historyReadAt=0;lastBidRead=0;}
    if(!id){bidError='Installatie nog niet herkend; open het Actueel-scherm met de hoofdplugin.';return;}
    if(!force&&now-lastBidRead<5000)return;
    lastBidRead=now;
    try{
      if(!bidDB)bidDB=new Promise((resolve,reject)=>{
        const req=indexedDB.open('balansenergie-bids-v1',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('kwartieren',{keyPath:'id'});
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error());req.onblocked=()=>reject(Error());
      });
      const db=await bidDB,q=quarter(now);
      const records=await new Promise((resolve,reject)=>{
        const tx=db.transaction('kwartieren','readonly'),store=tx.objectStore('kwartieren'),rows=[];let pending=3;
        for(let i=0;i<3;i++){
          const req=store.get(id+':'+(q-i*QUARTER));
          req.onsuccess=()=>{if(req.result?.customer===id)rows.push(req.result);if(--pending===0)resolve(rows);};
          req.onerror=()=>reject(Error());
        }
      });
      const saved=await coordinator.bids(id,records,now);
      if(id===customer()){bidState=saved;bidError='';}
    }catch(_){bidError='Het lokale BID-archief kon niet worden gelezen. Geen extra prijsaanvragen gestart.';}
  }
  async function receiveBids(event){
    if(!panelEnabled())return;
    // CustomEvent detail can be inaccessible across Firefox userscript realms.
    // The IndexedDB archive remains the portable fallback, including Safari.
    try{
      const id=customer(),payload=event.detail;
      if(id&&Array.isArray(payload?.prices)){
        const saved=await coordinator.bids(id,payload.prices,Date.now());
        if(id===customer()){
          if(id!==observedCustomer){marketHistory=[];learnedSignature='';historyReadAt=0;}
          observedCustomer=id;bidState=saved;bidError='';render();
        }
      }
    }catch(_){}
  }
  async function learnHistory(){
    const good=state?.scope===config.scope?state.good:null,mol=molState?.scope===config.scope?molState.good:null;
    if(!observedCustomer||!config.scope||config.environment!=='production')return;
    const now=Date.now(),scope=config.scope,id=observedCustomer;
    if(historyIdentity!==scope+':'+id){marketHistory=[];historyIdentity=scope+':'+id;learnedSignature='';historyReadAt=0;}
    const signature=scope+':'+id+':'+good?.latest.end+':'+mol?.fetchedAt+':'+Object.keys(bidState).length;
    if(signature===learnedSignature&&now-historyReadAt<60000)return;
    const records=[],lag=good?Math.max(0,good.fetchedAt-good.latest.end):NaN;
    for(const ladder of mol?.quarters||[]){
      if(ladder.end>(good?.latest.end||0)||marketHistory.some(q=>q.start===ladder.start))continue;
      const record=trainingQuarter(good?.rows||[],bidState[ladder.start],ladder,lag);
      if(record)records.push(record);
    }
    const result=await coordinator.history(scope,id,records,now);
    if(scope===config.scope&&id===observedCustomer){marketHistory=result;learnedSignature=signature;historyReadAt=now;}
  }
  function renderBids(row,stale,now){
    const q=quarter(now),sourceQuarter=row?quarter(row.start):null;
    const current=bidState[q],source=bidState[sourceQuarter];
    const mol=molState?.scope===config.scope?molState.good:null;
    const ladder=mol?.quarters.find(p=>p.start===sourceQuarter);
    text('[data-bid-quarter]','Jouw BID · '+time(q).slice(0,5)+'–'+time(q+QUARTER).slice(0,5));
    for(const [direction,d] of [['up','export'],['down','import']]){
      const bid=current?.[d];
      text('[data-'+direction+'-bid]',bid?'€ '+number(bid.value*1000,2)+' / MWh':'—');
      text('[data-'+direction+'-bid-time]',bid?'Vastgelegd '+time(bid.observedAt)+' · kale prijs':
        now-q<120000?'Wachten op BID in eerste twee minuten…':'Geen BID in de eerste twee minuten waargenomen.');
      const result=comparison(row,source,ladder,direction,stale);
      const label=shadow.querySelector('[data-'+direction+'-comparison]');label.dataset.tone=result.tone;
      text('[data-'+direction+'-comparison]',result.label);
      text('[data-'+direction+'-detail]',result.detail);
      const p=result.position,volume=row?.[direction];
      let ladderText='';
      if(p){
        ladderText='Biedgebied NL-ladder: '+number(p.lower,0)+(p.upper===null?' MW of hoger.':'–'+number(p.upper,0)+' MW.');
        if(Number.isFinite(volume)&&volume>0){
          if(volume<p.lower)ladderText+=' Nog '+number(p.lower-volume)+' MW tot dit gebied.';
          else if(p.upper!==null&&volume>p.upper)ladderText+=' Bronvermogen ligt voorbij dit gebied.';
          else ladderText+=' Bronvermogen ligt in dit gebied.';
        }
      }else ladderText=ladder?'Geen bruikbaar prijsgebied voor dit BID.':'Biedladder voor dit bronkwartier ontbreekt.';
      text('[data-'+direction+'-ladder]',ladderText);
      const previous=(state?.good?.rows||[]).filter(r=>r.start>=sourceQuarter&&r.end<=row?.end-60000&&r.end>=row?.end-90000&&r[direction]!==null).at(-1);
      const delta=previous&&Number.isFinite(volume)?volume-previous[direction]:null;
      text('[data-'+direction+'-trend]',delta===null?'':('Verandering circa 1 min: '+(delta>0?'+':'')+number(delta)+' MW.'));
      const chance=!stale&&config.environment==='production'&&historyIdentity===config.scope+':'+observedCustomer?
        historicalChance(marketHistory,row,source,ladder,direction,state?.good?.rows||[],now):null;
      text('[data-'+direction+'-chance]',config.environment==='acceptance'?'Geen kansmodel op testgegevens.':
        !chance?'Historische kansindicatie: nog niet beschikbaar voor deze bronpositie.':
        chance.p===undefined?'Historische kansindicatie: '+chance.n+'/30 vergelijkbare kwartieren verzameld.':
        'Historische trefkans biedniveau: '+number(chance.p*100,0)+'% · 95%-band '+number(chance.lower*100,0)+'–'+number(chance.upper*100,0)+'% · '+chance.n+' kwartieren.');
    }
    text('[data-bid-source]',bidError||'BID uit het lokale archief van de hoofdplugin; geen extra Balansenergie-aanvragen.');
    text('[data-comparison-quarter]',sourceQuarter===null?'Wachten op TenneT.':
      'Vergelijking hoort bij '+time(sourceQuarter).slice(0,5)+'–'+time(sourceQuarter+QUARTER).slice(0,5)+
      (sourceQuarter!==q?' · vorig bronkwartier; de nieuwe BIDs hierboven worden hiervoor niet gebruikt.':'.'));
    text('[data-mol-status]',molState?.scope===config.scope&&molState.error?'Biedladder: '+molState.error:
      mol?'Biedladder ontvangen '+time(mol.fetchedAt)+' · '+mol.quarters.length+' bronkwartieren.':'Biedladder wordt apart opgehaald; je sleutel heeft ook toegang tot Merit Order List nodig.');
    text('[data-history-status]',marketHistory.length+' complete bronkwartieren lokaal verzameld. Een percentage verschijnt vanaf 30 vergelijkbare kwartieren; per richting, resterende tijd, bronvertraging, vermogensverhouding en trend.');
  }
  function placementTarget(){
    const path=location.pathname;
    if(!/^\/customer(?:\/[^/]+)?\/?$/.test(path)||/^\/customer\/(?:account|results|current-history|current-prices)(?:\/|$)/.test(path))return null;
    const financial=document.getElementById('be-energieoverzicht');
    if(financial&&!financial.hidden)return null;
    const target=document.getElementById('be-tarief-row');
    return target?.isConnected?target:null;
  }
  function mount(){
    if(!host)return;
    const target=placementTarget(),visible=panelEnabled()&&!!target;
    if(host.hidden===visible)host.hidden=!visible;
    const display=visible?'block':'none';if(host.style.display!==display)host.style.display=display;
    // Never prepend into native page content or keep enforcing sibling order.
    // Navigation may replace the entire graph container. Only mount against
    // its real Actueel anchor, once, with no document-wide mutation observer.
    if(!target){if(host.isConnected)host.remove();return;}
    if(host.parentElement!==target.parentElement)target.after(host);
    host.dataset.theme=document.documentElement.getAttribute('data-be-dark')==='aan'?
      (document.documentElement.getAttribute('data-be-dark-style')==='grafiet'?'grafiet':'bruingrijs'):'light';
  }
  function renderSummary(row,stale,now){
    const q=quarter(now),bid=bidState[q];
    text('[data-summary-quarter]','Dit kwartier · '+time(q).slice(0,5)+'–'+time(q+QUARTER).slice(0,5));
    text('[data-summary-source]',row?'Bron '+time(row.end)+' · '+age(now-row.end)+' vertraagd'+(quarter(row.start)!==q?' · vorig kwartier':'')+'.':'Wachten op TenneT.');
    for(const [direction,d] of [['up','export'],['down','import']]){
      let label,detail,tone='muted';
      text('[data-summary-'+direction+'-power]',number(row?.[direction])+' MW');
      const price=row?.[direction+'Price'];
      text('[data-summary-'+direction+'-price]',price==null?'Prijs onbekend':'TenneT-regelprijs € '+number(price/1000,3)+'/kWh');
      text('[data-summary-'+direction+'-bid]',bid?.[d]?(direction==='up'?'≥ ':'≤ ')+'€ '+number(bid[d].value,3)+'/kWh':'BID ontbreekt');
      if(!row){label='Nog geen gegevens';detail='Wachten op TenneT.';}
      else if(stale){label='Bron verouderd';detail='Geen actuele vergelijking.';}
      else if(quarter(row.start)!==q){label='Wachten op dit kwartier';detail='TenneT toont nog metingen van het vorige kwartier.';}
      else if(row[direction]===0){label='Geen regelvolume';detail='Geen inzet in deze richting gemeld.';}
      else if(!bid?.[d]){
        label='BID nog niet bekend';
        detail=now-q<120000?'Laat Actueel open; het bod wordt vastgelegd.':'Laat Actueel open bij de volgende kwartierwisseling.';
      }else{
        const result=comparison(row,bid,null,direction);
        tone=result.tone;
        if(tone==='reached'){label='Prijsvoorwaarde gehaald';detail=direction==='up'?'Ontladen komt in aanmerking.':'Laden komt in aanmerking.';}
        else if(tone==='waiting'){label='Prijsvoorwaarde niet gehaald';detail='Marktprijs bereikt het EMS-bod niet.';}
        else{label='Onvoldoende broninformatie';detail='Geen bevestigde activatieprijs.';}
      }
      const el=shadow.querySelector('[data-summary-'+direction+']');el.dataset.tone=tone;
      text('[data-summary-'+direction+']',label);text('[data-summary-'+direction+'-detail]',detail);
    }
  }
  function renderGraph(){
    if(!panelEnabled()||!placementTarget())return;
    const details=shadow?.querySelector('[data-power-graph]');if(!details?.open)return;
    const good=state?.scope===config.scope?state.good:null,container=shadow.querySelector('[data-power-plot]');
    const duration=graphDuration,now=Date.now();
    const window=graphWindow(now,duration),min=window.start,max=window.end,range=max-min;
    const rows=(good?.rows||[]).filter(r=>r.end>=min&&r.end<=max);
    const own=(emsInstallation===customer()?emsRows:[]).filter(r=>r.t>=min&&r.t<=max);
    const signature=JSON.stringify([good?.fetchedAt||0,duration,emsRevision,Math.floor(now/5000)]);
    if(container.dataset.signature===signature)return;
    container.dataset.signature=signature;container.replaceChildren();
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    function node(tag,attrs={},label){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(label!==undefined)el.textContent=label;svg.append(el);return el;}
    const plotWidth=Math.max(300,container.clientWidth||host.clientWidth||800);
    svg.setAttribute('viewBox','0 0 '+plotWidth+' 300');svg.setAttribute('role','img');
    svg.setAttribute('data-window-start',String(min));svg.setAttribute('data-window-end',String(max));
    svg.setAttribute('aria-label','TenneT-regelvermogen links in MW, jouw gemeten netexport boven en netimport onder rechts in kW. Beide richtingen met dezelfde schaal per bron.');
    const left=36,right=plotWidth-36,width=right-left,x=t=>left+width*(t-min)/range;
    const nice=value=>{const power=Math.pow(10,Math.floor(Math.log10(Math.max(1,value)))),n=value/power;return (n<=1?1:n<=2?2:n<=5?5:10)*power;};
    const ceiling=nice(Math.max(1,...rows.flatMap(r=>[r.up||0,r.down||0])));
    const ownCeiling=17;
    const tickStep=duration===1800000?(plotWidth<420?900000:600000):duration===7200000?(plotWidth<420?3600000:1800000):(plotWidth<420?10800000:3600000);
    const ticks=[min];for(let t=Math.ceil(min/tickStep)*tickStep;t<max;t+=tickStep)if(x(t)-left>32&&right-x(t)>32)ticks.push(t);ticks.push(max);
    for(const t of ticks)node('line',{x1:x(t),x2:x(t),y1:37,y2:254,stroke:'var(--line)','stroke-width':1,opacity:.35,'stroke-dasharray':'2 5'});
    function series(points,value,base,top,color,dashed,tag){
      let segment=[],last=null;
      const flush=()=>{
        if(segment.length){
          if(dashed&&segment.length>1){const first=segment[0].split(',')[0],last=segment.at(-1).split(',')[0];node('polygon',{points:first+','+base+' '+segment.join(' ')+' '+last+','+base,fill:color,opacity:.07,'pointer-events':'none'});}
          node('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':dashed?0.8:1.8,'stroke-dasharray':'none','stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke','data-series':tag});
        }segment=[];
      };
      for(const point of points){
        const v=value(point),t=point.end??point.t;
        if(!Number.isFinite(v)){flush();last=null;continue;}
        if(last&&(point.t?t-last.t>300000:point.start>last.end))flush();
        segment.push(x(t).toFixed(2)+','+(base-v/top*78).toFixed(2));last=point;
      }
      flush();
    }
    for(const [direction,label,base,color] of [['up','EXPORT · opregelen',119,'var(--up)'],['down','IMPORT · afregelen',249,'var(--down)']]){
      node('text',{x:left,y:base-94,fill:color,'font-size':11,'font-weight':600},label);
      for(const fraction of [0,.5,1]){
        const y=base-fraction*78;
        node('line',{x1:left,x2:right,y1:y,y2:y,stroke:'var(--line)','stroke-width':1,'stroke-dasharray':fraction?'3 4':'none',opacity:fraction?0.65:1});
        node('text',{x:left-4,y:y+3,fill:'var(--muted)','text-anchor':'end','font-size':8.5},number(fraction*ceiling,ceiling<2?1:0));
        node('text',{x:right+4,y:y+3,fill:'var(--ems-text)','text-anchor':'start','font-size':8.5},number(fraction*ownCeiling,Number.isInteger(fraction*ownCeiling)?0:1));
      }
      series(rows,r=>r[direction],base,ceiling,color,false,'tennet-'+direction);
      series(own,r=>Math.max(0,direction==='up'?-r.po:r.po)/1000,base,ownCeiling,'var(--ems)',true,direction==='up'?'own-export':'own-import');
    }
    node('text',{x:left-4,y:32,fill:'var(--muted)','font-size':8,'text-anchor':'end'},'MW');
    node('text',{x:right+4,y:32,fill:'var(--ems-text)','font-size':8,'text-anchor':'start'},'kW');
    for(const t of ticks)node('text',{x:x(t),y:282,fill:'var(--muted)','text-anchor':t===min?'start':t===max?'end':'middle','font-size':10},time(t).slice(0,5));
    const cursor=node('line',{x1:0,x2:0,y1:36,y2:255,stroke:'var(--muted)','stroke-dasharray':'3 3',visibility:'hidden'});
    const coverage=(label,points,timeOf)=>label+': '+(points.length?time(timeOf(points[0])).slice(0,5)+'–'+time(timeOf(points.at(-1))).slice(0,5):'nog geen metingen');
    text('[data-graph-coverage]',coverage('TenneT',rows,r=>r.end)+' · '+coverage('Jouw net',own,r=>r.t));
    const nearest=(points,get,t,limit)=>{const p=points.reduce((a,b)=>!a||Math.abs(get(b)-t)<Math.abs(get(a)-t)?b:a,null);return p&&Math.abs(get(p)-t)<=limit?p:null;};
    function readout(t,selected=false){
      const national=nearest(rows,r=>r.end,t,24000),meter=nearest(own,r=>r.t,t,60000);
      text('[data-graph-time]',time(t));
      text('[data-graph-tn-value]',national?'Op '+number(national.up)+' · Af '+number(national.down)+' MW':'Geen bronpunt');
      text('[data-graph-own-value]',meter?(meter.po>0?'Import ':meter.po<0?'Export ':'')+number(Math.abs(meter.po)/1000,2)+' kW':'Geen meetpunt');
      cursor.setAttribute('x1',x(t));cursor.setAttribute('x2',x(t));cursor.setAttribute('visibility',selected?'visible':'hidden');
    }
    const restTime=rows.at(-1)?.end||own.at(-1)?.t||max;
    if(graphSelection!==null&&(graphSelection<min||graphSelection>max))graphSelection=null;
    readout(graphSelection??restTime,graphSelection!==null);
    function inspect(event){
      const rect=svg.getBoundingClientRect();if(!rect.width)return;
      const t=Math.max(min,Math.min(max,min+((event.clientX-rect.left)*plotWidth/rect.width-left)/width*range));
      graphSelection=t;readout(t,true);
    }
    svg.addEventListener('pointermove',inspect);svg.addEventListener('pointerdown',inspect);
    svg.addEventListener('pointerleave',()=>{graphSelection=null;readout(restTime);});
    container.append(svg);
  }
  function render(){
    if(!shadow)return;
    if(!panelEnabled()){mount();return;}
    mount();const now=Date.now(),s=state?.scope===config.scope?state:null,good=s?.good,row=good?.latest;
    const stale=good&&(now-good.fetchedAt>90000||now-good.advancedAt>90000||now-row.end>300000);
    text('[data-environment]',config.environment==='acceptance'?'Acceptance':'');
    shadow.querySelector('[data-environment]').hidden=config.environment!=='acceptance';
    text('[data-status]',localError||s?.error||(inFlight?'Metingen ophalen…':good?
      (stale?'Laatste meting is verouderd.':config.enabled?'Verbonden · automatisch verversen':'Gepauzeerd · laatste meting zichtbaar'):
      config.key?'Sleutel opgeslagen · klaar om te testen':'Vul je production-sleutel voor Balance Delta High Res in.'));
    shadow.querySelector('[data-status]').dataset.warning=String(Boolean(localError||s?.error||stale));
    text('[data-key-state]',config.key?'Sleutel opgeslagen · wordt automatisch gebruikt bij herladen.':'Voer je sleutel één keer in en kies Test & start.');
    text('[data-key-label]',config.key?'Nieuwe API-sleutel (optioneel)':'TenneT API-sleutel');
    text('[data-settings-title]',config.key?'Verbinding · sleutel opgeslagen':'API-sleutel instellen');
    shadow.querySelector('[data-key]').placeholder=config.key?'Laat leeg om de opgeslagen sleutel te behouden':'Vul je eigen API-sleutel in';
    text('[data-up]',number(row?.up)+' MW');text('[data-down]',number(row?.down)+' MW');
    text('[data-up-price]',row?.upPrice==null?'—':'€ '+number(row.upPrice,2)+' / MWh');
    text('[data-down-price]',row?.downPrice==null?'—':'€ '+number(row.downPrice,2)+' / MWh');
    text('[data-signal]',stale?'Verouderde brongegevens: geen actuele activatie-inschatting.':signal(row));
    text('[data-source]',row?time(row.start)+'–'+time(row.end)+' · '+age(now-row.end)+' oud':'Nog geen bronmeting');
    const q=row?Math.floor(row.start/900000)*900000:null;
    text('[data-quarter]',q===null?'':('Bronkwartier '+time(q).slice(0,5)+'–'+time(q+900000).slice(0,5)+
      (q<Math.floor(now/900000)*900000?' · huidig kwartier nog niet gepubliceerd':'')));
    renderBids(row,stale,now);
    renderSummary(row,stale,now);
    renderGraph();
    const wait=s?.nextAt>now?Math.ceil((s.nextAt-now)/1000):0;
    text('[data-poll]',!config.enabled?'Automatisch verversen staat uit.':document.hidden?'Verversen wacht tot dit tabblad zichtbaar is.':
      s?.authBlocked?'Automatisch gepauzeerd na toegangsweigering. Test opnieuw na controle van de sleutel.':
      wait?'Volgende aanvraag over '+wait+' s.':'Wacht op de gedeelde aanvraagplanner.');
    text('[data-diagnostic]','Omgeving: '+(config.environment||'production')+'\nEndpoint: '+HOSTS[config.environment||'production']+PATH+
      '\nNetwerkfunctie userscriptmanager: '+(manager().request?'beschikbaar':'ontbreekt')+
      '\nHTTP-status: '+(s?.status||'nog geen antwoord')+'\nLaatste aanvraag: '+time(s?.lastAttempt)+
      '\nLaatste geslaagde aanvraag: '+time(good?.fetchedAt)+'\nMeetpunten: '+(good?.rows.length||0)+
      '\nAanvragen Balance Delta laatste minuut: '+(s?.attempts||[]).filter(t=>t>now-60000).length+
      '\nBiedladder HTTP-status: '+(molState?.scope===config.scope?molState.status||'nog geen antwoord':'nog geen antwoord')+
      '\nLaatste aanvraag biedladder: '+time(molState?.lastAttempt)+
      '\nTotaal API-aanvragen laatste minuut: '+(budgetState?.attempts||[]).filter(t=>t>now-60000).length+' / 8'+
      '\nBiedladder-aanvragen laatste 24 uur: '+(budgetState?.molAttempts||[]).filter(t=>t>now-86400000).length+' / 500'+
      '\nBID-bron: lokaal archief · vastleggen eerste 120 seconden'+
      '\nPlanner: maximaal 5 Balance Delta-aanvragen/min; biedladder uit kwartiercache.'+
      '\nOngewijzigde bron: '+(s?.unchanged||0)+' opeenvolgende antwoorden; planner vertraagt dan automatisch.');
    shadow.querySelector('[data-refresh]').disabled=!config.key||inFlight||wait>0||s?.authBlocked;
    shadow.querySelector('[data-pause]').disabled=!config.enabled;
    shadow.querySelector('[data-connect]').disabled=inFlight;
    const signature=(good?.fetchedAt||0)+':'+(good?.latest.end||0);
    const tbody=shadow.querySelector('tbody');
    if(tbody.dataset.signature!==signature){
      tbody.dataset.signature=signature;tbody.replaceChildren();
      for(const p of (good?.rows||[]).slice(-10).reverse()){
        const tr=document.createElement('tr');
        for(const value of [time(p.start),number(p.up),number(p.down),number(p.upPrice,2),number(p.downPrice,2)]){
          const td=document.createElement('td');td.textContent=value;tr.append(td);
        }
        tbody.append(tr);
      }
    }
  }
  async function tick(){
    if(busy||destroyed)return;clearTimeout(timer);
    if(!panelEnabled()){mount();return;}
    busy=true;
    let wakeAt=Date.now()+5000;
    try{
      config=await loadConfig();
      [state,molState,budgetState]=await Promise.all([coordinator.read(),coordinator.read('mol'),coordinator.read('budget')]);
      await readBids();await readPower();render();
      for(const channel of ['live','mol']){
        config=await loadConfig();
        if(!panelEnabled()||!placementTarget()||!config.enabled||!config.key||document.hidden)break;
        if(channel==='mol'&&!Object.values(bidState).some(b=>b.end>=quarter(Date.now())))continue;
        const c={...config},reservation=await coordinator.reserve(c.scope,owner,Date.now(),channel);
        if(channel==='live')state=reservation.state;else molState=reservation.state;
        if(reservation.retryAt>Date.now())wakeAt=Math.min(wakeAt,reservation.retryAt);
        if(!reservation.reserved)continue;
        if(!panelEnabled()||!placementTarget())break;
        inFlight=true;render();
        try{
          const data=await request(c,channel,reservation.state.target);
          const result=await coordinator.success(c.scope,owner,data,Date.now(),channel);
          if(channel==='live')state=result;else molState=result;
        }catch(e){
          const error=e instanceof Fault?e:new Fault('network','De aanvraag kon niet worden voltooid.');
          const result=await coordinator.failure(c.scope,owner,error,Date.now(),channel);
          if(channel==='live')state=result;else molState=result;
        }finally{inFlight=false;}
        const s=channel==='live'?state:molState;
        if(s?.nextAt>Date.now())wakeAt=Math.min(wakeAt,s.nextAt);
        wakeAt=Math.min(wakeAt,Date.now()+1100);
      }
      budgetState=await coordinator.read('budget');
      await learnHistory();
      localError='';
    }catch(e){localError=e instanceof Fault?e.message:'Regelvermogen kon niet worden bijgewerkt.';}
    finally{
      busy=false;render();
      for(const s of [state,molState]){
        if(config.enabled&&!s?.authBlocked&&s?.nextAt>Date.now())wakeAt=Math.min(wakeAt,s.nextAt);
      }
      if(!destroyed&&panelEnabled())timer=setTimeout(tick,Math.max(150,Math.min(5000,wakeAt-Date.now())));
    }
  }
  async function connect(event){
    event.preventDefault();
    try{
      const old=await loadConfig(),input=shadow.querySelector('[data-key]'),key=input.value.trim()||old.key;
      if(!key)throw new Fault('input','Vul eerst je API-sleutel in.');
      if(/[\r\n]/.test(key))throw new Fault('input','De sleutel bevat een onverwachte regelafbreking.');
      const environment=shadow.querySelector('[data-env-select]').value;
      const same=old.key===key&&old.environment===environment;
      const next={key,environment,enabled:true,scope:same&&old.scope?old.scope:owner+'-'+Date.now()};
      await manager().set(CONFIG,next);
      config=await loadConfig();
      if(config.key!==key||config.scope!==next.scope)throw new Fault('storage','De userscriptmanager heeft de sleutel niet bewaard. Controleer de opslagtoegang.');
      input.value='';
      if(same){await coordinator.retry(config.scope);await coordinator.retry(config.scope,'mol');}
      if(!same){marketHistory=[];learnedSignature='';historyReadAt=0;}
      localError='';shadow.querySelector('[data-settings]').open=false;await tick();
    }catch(e){localError=e instanceof Fault?e.message:'De sleutel kon niet worden opgeslagen.';render();}
  }
  async function pause(){
    try{config={...await loadConfig(),enabled:false};await manager().set(CONFIG,config);await tick();}
    catch(_){localError='Pauzeren kon niet worden opgeslagen.';render();}
  }
  async function forget(){
    try{
      const m=manager();if(m.del)await m.del(CONFIG);else await m.set(CONFIG,{});
      await coordinator.clear();config={};state=null;molState=null;marketHistory=[];learnedSignature='';shadow.querySelector('[data-key]').value='';shadow.querySelector('[data-settings]').open=true;
      localError='';await tick();
    }catch(_){localError='De opgeslagen sleutel kon niet worden gewist.';render();}
  }
  function createPanel(){
    host=document.createElement('section');host.id=ID;host.style.cssText='display:block;flex:0 0 100%;width:100%;min-width:0;margin:16px 0';
    shadow=host.attachShadow({mode:'closed'});
    shadow.innerHTML=`<style>
      :host{--paper:#fff;--ink:#30263a;--muted:#6b6175;--line:#d9d1e1;--soft:#f7f4fa;--up:#277eae;--down:#b05274;--warn:#a35b12;--ems:#79b79b;--ems-text:#287455;font:13px/1.5 system-ui,-apple-system,sans-serif}
      :host([data-theme="grafiet"]){--paper:#1c1f26;--ink:#f5f7fa;--muted:#b6c0cf;--line:#3c4351;--soft:#262a34;--up:#4398ff;--down:#ff8399;--warn:#ffc64a;--ems:#9dceb4;--ems-text:#b0dec6}
      :host([data-theme="bruingrijs"]){--paper:#37322b;--ink:#f5f0e8;--muted:#c7beb0;--line:#675e4f;--soft:#454036;--up:#31adde;--down:#f681a0;--warn:#eca524;--ems:#9dceb4;--ems-text:#b0dec6}
      *{box-sizing:border-box}.panel{padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink)}
      header,.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}h3{font-size:15px;margin:0}header>span{font-size:11px;color:var(--muted)}header>[data-status]{margin:0 0 0 auto;flex:0 1 auto}header{column-gap:12px;row-gap:4px}
      p{margin:8px 0}[data-status]{margin-top:10px;color:var(--muted)}[data-warning="true"]{color:var(--warn)}
      .metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.metric{min-width:0;padding:12px;border-radius:8px;background:var(--soft)}
      .metric span{font-size:12px;color:var(--muted)}.metric strong{display:block;font-size:24px;font-weight:650;line-height:1.3;font-variant-numeric:tabular-nums}.up strong{color:var(--up)}.down strong{color:var(--down)}
      .metric small{display:block;margin-top:5px;font-size:11px;font-variant-numeric:tabular-nums}.source{padding-bottom:10px;border-bottom:1px solid var(--line)}.source span{display:block;color:var(--muted);font-size:11px}
      .bids{border-top:1px solid var(--line);padding-top:12px}.bids h4{font-size:13px;margin:0}.bid-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:10px 0}.bid-card{padding:12px;background:var(--soft);border:1px solid var(--line);border-radius:8px;min-width:0}.bid-card>strong{display:block;font-size:18px;font-variant-numeric:tabular-nums}.bid-card p{margin:6px 0;font-size:12px;overflow-wrap:anywhere}.bid-card small{display:block}.assessment{font-weight:650}[data-tone="reached"]{color:var(--up)}[data-tone="waiting"]{color:var(--warn)}[data-tone="muted"]{color:var(--muted)}
      .summary-grid{display:grid;gap:7px;margin:10px 0}.summary-card{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1fr) minmax(0,1.2fr);gap:12px;padding:10px 12px;background:var(--soft);border-radius:8px;min-width:0;align-items:start}.summary-card>div{min-width:0}.summary-card h4{font-size:11px;font-weight:500;color:var(--muted);margin:0 0 4px}.summary-card strong{display:block;font-size:14px;line-height:1.4;overflow-wrap:anywhere}.summary-card .mw{font-size:21px;font-variant-numeric:tabular-nums}.summary-card small{display:block;font-size:10px;margin-top:3px}.summary-card p{margin:3px 0 0;font-size:11px}.summary-note{padding:4px 0;font-size:11px;color:var(--muted)}[data-summary-source]{font-size:11px;color:var(--muted)}[data-summary-up-power]{color:var(--up)}[data-summary-down-power]{color:var(--down)}@media(max-width:540px){.summary-card{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.summary-effect{grid-column:1/-1;border-top:1px solid var(--line);padding-top:6px}.summary-effect h4{display:none}.summary-card .summary-effect strong{font-size:13px}}
      [data-power-graph]>summary{display:flex;align-items:center;gap:8px;list-style:none;padding:12px 0;font-size:12px}[data-power-graph]>summary::-webkit-details-marker{display:none}[data-power-graph]>summary::before{content:'›';font-size:18px;line-height:1;color:var(--muted);transition:transform .15s}[data-power-graph][open]>summary::before{transform:rotate(90deg)}
      .power-chart{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--paper);overflow:hidden}.graph-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.graph-heading{font-size:12px;font-weight:650}.graph-heading small{display:block;font-weight:400;font-size:10px;margin-top:2px}.period-control{display:inline-flex;gap:3px;padding:3px;background:var(--soft);border:1px solid var(--line);border-radius:10px;margin-left:auto}.period-control button{min-height:32px;min-width:51px;padding:4px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--muted);font-size:11px;line-height:1.3;white-space:nowrap;box-shadow:none}.period-control button:hover{color:var(--ink);background:var(--paper)}.period-control button[aria-pressed="true"]{background:var(--paper);color:var(--ink);border-color:var(--up);font-weight:650;box-shadow:0 1px 3px #00000015}
      .graph-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:10px;color:var(--muted);margin:12px 0 2px}.graph-legend>span{display:inline-flex;gap:6px;align-items:center}.graph-swatch{display:inline-block;width:20px;border-top:2px solid var(--muted)}.graph-swatch.meter{border-top:2px solid var(--ems)}.graph-legend>span:last-child{color:var(--ems-text);font-weight:550}
      [data-power-plot] svg{display:block;width:100%;height:auto;min-height:230px;touch-action:pan-y;overflow:visible}[data-power-plot] text{font-family:system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;pointer-events:none}
      .graph-readout{display:grid;grid-template-columns:55px minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:center;padding:10px;background:var(--soft);border-radius:8px;margin-top:4px;font-variant-numeric:tabular-nums}.graph-readout small{display:block;font-size:9px;margin-bottom:2px}.graph-readout strong{font-size:11px;font-weight:550;display:block;line-height:1.5}.graph-readout>[data-graph-time]{font-size:10px;color:var(--muted)}[data-graph-own-value]{color:var(--ems-text)}[data-graph-coverage]{font-size:9px!important;line-height:1.6;margin:7px 2px 0!important}
      @media(max-width:440px){.power-chart{padding:10px}.period-control{width:100%;margin-left:0}.period-control button{flex:1;min-height:35px}.graph-readout{grid-template-columns:47px minmax(0,1fr) minmax(0,1fr);gap:7px;padding:8px}.graph-readout strong{font-size:10px}.graph-legend{gap:12px}}
      button,input,select{font:inherit;color:var(--ink);min-height:40px;border:1px solid var(--line);border-radius:6px;background:var(--paper)}button{padding:6px 11px;cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--up);outline-offset:2px}
      label{display:block;margin:10px 0 5px}input,select{width:100%;padding:8px}input{font-size:16px}.actions{margin:10px 0}summary{cursor:pointer;padding:8px 0;font-weight:550}small,.note{font-size:11px;color:var(--muted)}a{color:var(--up)}
      .table{overflow:auto;max-width:100%}table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums}th,td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--line)}th:first-child,td:first-child{text-align:left}
      [data-diagnostic],[data-poll]{overflow-wrap:anywhere}[data-diagnostic]{white-space:pre-wrap;padding:10px;background:var(--soft);border-radius:6px}details{border-top:1px solid var(--line);margin-top:8px}@media(max-width:540px){.bid-grid{grid-template-columns:1fr}}@media(max-width:420px){.panel{padding:12px}.metric{padding:10px}.metric strong{font-size:21px}.actions{gap:7px}.actions button{flex:1 1 auto}}
    </style><div class="panel"><header><h3>Regelvermogen & biedingen</h3><span data-status role="status" aria-live="polite">Regelvermogen laden…</span><span data-environment>Production</span></header>

      <p class="note" data-summary-quarter></p>
      <div class="summary-grid"><section class="summary-card">
        <div><h4>TenneT · opregelen</h4><strong class="mw" data-summary-up-power>— MW</strong><small data-summary-up-price></small></div>
        <div><h4>EMS · ontladen</h4><strong data-summary-up-bid>—</strong></div>
        <div class="summary-effect"><h4>Effect</h4><strong data-summary-up>Nog geen gegevens</strong><p data-summary-up-detail></p></div></section>
        <section class="summary-card"><div><h4>TenneT · afregelen</h4><strong class="mw" data-summary-down-power>— MW</strong><small data-summary-down-price></small></div>
        <div><h4>EMS · laden</h4><strong data-summary-down-bid>—</strong></div>
        <div class="summary-effect"><h4>Effect</h4><strong data-summary-down>Nog geen gegevens</strong><p data-summary-down-detail></p></div></section></div>
      <p data-summary-source></p>
      <p class="summary-note">Kale prijzen · Opregelen: regelprijs ≥ ontlaadbod. Afregelen: regelprijs ≤ laadbod. Afroep van jouw accu is niet bevestigd.</p>
      <details data-power-graph><summary>Regelvermogen & jouw import/export</summary><div class="power-chart"><div class="graph-toolbar"><div class="graph-heading">Vermogen in de tijd<small>TenneT en jouw installatie</small></div><div class="period-control" role="group" aria-label="Tijdsbereik grafiek"><button type="button" data-graph-range="1800000" aria-pressed="true">30 min</button><button type="button" data-graph-range="7200000" aria-pressed="false">2 uur</button><button type="button" data-graph-range="21600000" aria-pressed="false">6 uur</button></div></div><div class="graph-legend"><span><i class="graph-swatch"></i>TenneT · MW links</span><span><i class="graph-swatch meter"></i>Jouw net · kW rechts</span></div><div data-power-plot></div><div class="graph-readout" data-graph-readout><span data-graph-time>—</span><span><small>TenneT</small><strong data-graph-tn-value>—</strong></span><span><small>Jouw net</small><strong data-graph-own-value>—</strong></span></div><p class="note" data-graph-coverage></p></div></details>
      <details data-advanced><summary>Details · marktgegevens en verbinding</summary>
      <div class="metrics"><div class="metric up"><span>aFRR opregelen</span><strong data-up>— MW</strong><small data-up-price>—</small></div><div class="metric down"><span>aFRR afregelen</span><strong data-down>— MW</strong><small data-down-price>—</small></div></div>
      <p data-signal>Nog geen meting.</p><p class="source"><span data-source></span><span data-quarter></span></p>
      <section class="bids"><h4 data-bid-quarter>Jouw BID</h4>
        <div class="bid-grid"><div class="bid-card"><small>Ontladen · export · opregelen</small><strong data-up-bid>—</strong><small data-up-bid-time></small>
          <p class="assessment" data-up-comparison></p><p data-up-detail></p><p data-up-ladder></p><small data-up-trend></small><p data-up-chance></p></div>
        <div class="bid-card"><small>Laden · import · afregelen</small><strong data-down-bid>—</strong><small data-down-bid-time></small>
          <p class="assessment" data-down-comparison></p><p data-down-detail></p><p data-down-ladder></p><small data-down-trend></small><p data-down-chance></p></div></div>
        <p class="note" data-comparison-quarter></p><p class="note" data-bid-source></p><p class="note" data-mol-status></p>
        <details><summary>Hoe wordt de kansindicatie bepaald?</summary><p class="note" data-history-status></p><p class="note">De historische trefkans telt hoe vaak de gepubliceerde prijs na het vergelijkingsmoment en vóór kwartiereinde nog jouw biedniveau bereikte, met positief regelvolume. Alleen complete bronkwartieren tellen mee, met een in de eerste twee minuten vastgelegd BID. De gemeten publicatievertraging wordt nagebootst bij de vergelijking. Dit is een experimentele historische frequentie; het model is nog niet getoetst op nieuwe kwartieren en voorspelt geen bevestigde afroep van jouw accu.</p></details>
        <p class="note">Dit is een marktindicatie voor jouw biedniveau. De NL-biedladder bevat prijsgebieden; internationale uitwisseling, rampsnelheid en de verdeling door jouw aanbieder kunnen de afroep beïnvloeden. Een bereikt biedniveau bevestigt geen afroep van jouw accu.</p>
      </section>
      <div class="actions"><button type="button" data-refresh>Ververs</button><button type="button" data-pause>Pauzeer</button></div>
      <p class="note">TenneT-regelprijs: hoogste geactiveerde opregelbiedprijs / laagste geactiveerde afregelbiedprijs in de bronmeting. De bronleeftijd hierboven is gemeten en kan variëren. Vaker ophalen verwijdert de publicatievertraging van TenneT niet.</p><p class="note" data-poll></p><details><summary>Verbindingsinfo & aanvraaglimieten</summary><p class="note" data-diagnostic></p></details>
      <details data-settings open><summary data-settings-title>API-sleutel instellen</summary><p class="note" data-key-state></p><form data-form>
        <p class="note"><a href="https://developer.tennet.eu/" target="_blank" rel="noopener noreferrer">API-sleutel aanvragen bij TenneT</a>. Kies Production en vraag toegang tot Balance Delta High Res en Merit Order List aFRR & mFRRsa.</p>
        <label for="tn-env">Omgeving</label><select id="tn-env" data-env-select><option value="production">Production — actuele marktgegevens</option><option value="acceptance">Acceptance — TenneT-testomgeving</option></select>
        <label for="tn-key" data-key-label>TenneT API-sleutel</label><input id="tn-key" data-key type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Vul je eigen API-sleutel in">
        <div class="actions"><button data-connect type="submit">Test & start</button><button data-forget type="button">Sleutel wissen</button></div>
        <small>Je sleutel heeft toegang nodig tot <a href="https://developer.tennet.eu/specs/v1/balance-delta-high-res" target="_blank" rel="noopener noreferrer">Balance Delta High Res</a> en <a href="https://developer.tennet.eu/specs/v1/merit-order-list" target="_blank" rel="noopener noreferrer">Merit Order List</a>. De sleutel blijft in de userscriptmanager en gaat alleen naar de gekozen TenneT-omgeving.</small>
      </form></details>
      <details><summary>Laatste 10 bronmetingen</summary><div class="table"><table><thead><tr><th>Tijd</th><th>Op MW</th><th>Af MW</th><th>Op €/MWh</th><th>Af €/MWh</th></tr></thead><tbody></tbody></table></div></details>
      <p class="note">Metingen maximaal iedere 12 s, één seconde na de bronpublicatie; bij stilstand minder vaak. Biedladder één keer per kwartier zodra beschikbaar; bij ontbrekende publicatie maximaal drie pogingen. Tabbladen delen aanvragen en cache. Verborgen tabbladen starten geen aanvragen. De publicatievertraging van TenneT zelf blijft bestaan.</p>
      </details>
    </div>`;
    // Keep first-time key entry accessible while all technical data stays folded.
    shadow.querySelector('[data-advanced]').before(shadow.querySelector('[data-settings]'));
    shadow.querySelector('[data-form]').addEventListener('submit',connect);
    shadow.querySelector('[data-pause]').addEventListener('click',pause);
    shadow.querySelector('[data-forget]').addEventListener('click',forget);
    shadow.querySelector('[data-refresh]').addEventListener('click',tick);
    shadow.querySelector('[data-power-graph]').addEventListener('toggle',renderGraph);
    try{const saved=Number(localStorage.getItem('be_cfg_afrr_graph_span'));if([1800000,7200000,21600000].includes(saved))graphDuration=saved;}catch(_){}
    const rangeButtons=[...shadow.querySelectorAll('[data-graph-range]')];
    function selectRange(value){graphDuration=value;graphSelection=null;rangeButtons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.graphRange)===value)));renderGraph();}
    rangeButtons.forEach(button=>button.addEventListener('click',()=>{const value=Number(button.dataset.graphRange);selectRange(value);try{localStorage.setItem('be_cfg_afrr_graph_span',String(value));}catch(_){}}));
    selectRange(graphDuration);
    mount();
  }
  async function boot(){
    if(document.getElementById(ID))return;
    coordinator=createCoordinator(globalThis.indexedDB);createPanel();
    try{config=await loadConfig();shadow.querySelector('[data-env-select]').value=config.environment||'production';shadow.querySelector('[data-settings]').open=!config.key;}
    catch(e){localError=e.message;render();return;}
    // The native dashboard owns its page tree. A broad childList observer
    // can otherwise reinsert this panel during a navigation teardown loop.
    new MutationObserver(mount).observe(document.documentElement,{attributes:true,attributeFilter:['data-be-dark','data-be-dark-style']});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();else render();});
    document.addEventListener('be-afrr-source',receiveBids);
    document.addEventListener('be-installation-power',receivePower);
    document.addEventListener('be-tarief-update',()=>{if(panelEnabled())Promise.all([readBids(true),readPower(true)]).then(render);});
    function settingChanged(){clearTimeout(timer);mount();if(panelEnabled())tick();}
    document.addEventListener('be-afrr-market-change',settingChanged);
    window.addEventListener('storage',event=>{if(event.key===PANEL_SETTING||event.key===null)settingChanged();});
    window.addEventListener('pagehide',()=>{destroyed=true;clearTimeout(timer);});
    window.addEventListener('pageshow',()=>{destroyed=false;tick();});
    window.addEventListener('popstate',()=>{mount();if(placementTarget())tick();});
    window.addEventListener('resize',()=>{const plot=shadow?.querySelector('[data-power-plot]');if(plot)plot.dataset.signature='';renderGraph();});
    await tick();
  }
  if(window.top!==window.self)return;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
