/* Short-lived observations of the running quarter; settled prices and BID history are separate. */
(function () {
  'use strict';
  if(window.BECurrentTariffCache)return;
  var TTL=30*60*1000,QUARTER=900000,PREFIX='be_current_tariffs_v1:',memory=new Map(),expires=new Map(),timer;
  var fields=['onbalans_import','onbalans_export'],PRICE_MODEL=2;
  function planningContext(payload){
    var plans=payload&&payload.dayAheadPlans,windows=payload&&payload.dayAheadUnavailableWindows,planned=new Set(),exported=new Set();
    (Array.isArray(plans)?plans:[]).forEach(function(p){
      if(!p||!Number.isFinite(p.start)||p.start%QUARTER!==0||p.end!==p.start+QUARTER)return;
      if(p.direction==='import')planned.add(p.start);
      if(p.direction==='export')exported.add(p.start);
    });
    return {authoritative:Array.isArray(plans)||Array.isArray(windows),planned:planned,exported:exported,
      unknown:(Array.isArray(windows)?windows:[]).filter(function(w){return Array.isArray(w)&&Number.isFinite(w[0])&&Number.isFinite(w[1])&&w[1]>w[0];})};
  }
  function unknownPlanning(context,start){
    return context.unknown.some(function(w){return start>=w[0]&&start<w[1];});
  }
  // Store the planning decision alongside each quote. A day-ahead price may
  // exist outside a planned quarter, so its presence alone never selects it.
  function preparePrices(prices,payload){
    var context=planningContext(payload),planned=context.planned;
    var rows=(prices||[]).slice(),missing=new Set(planned),current=Math.floor(Date.now()/QUARTER)*QUARTER;
    if(unknownPlanning(context,current))missing.add(current);
    rows.forEach(function(p){if(p)missing.delete(p.start);});
    missing.forEach(function(start){rows.push({start:start,end:start+QUARTER,values:{},provisional:true,dayAheadPlaceholder:true});});
    return rows.map(function(p){
      if(!p)return p;
      var state=context.authoritative?(planned.has(p.start)?'planned':unknownPlanning(context,p.start)?'unavailable':'none')
        :['planned','unavailable','none'].includes(p.dayAheadState)?p.dayAheadState:
          Object.keys(p.values||{}).some(function(key){return key.indexOf('day_ahead_')===0;})?'unavailable':'none';
      var dayAheadExport=context.authoritative?context.exported.has(p.start):p.dayAheadExport===true;
      return Object.assign({},p,{dayAheadState:state,dayAheadExport:dayAheadExport,priceModel:PRICE_MODEL});
    });
  }
  // A partial response can omit old price rows. Its explicit plans/windows still
  // update those rows, while an empty plan list says nothing about their scope.
  function applyPlanning(prices,payload){
    var context=planningContext(payload);
    return preparePrices(prices).map(function(p){
      if(!p)return p;
      var unknown=unknownPlanning(context,p.start);
      var state=context.planned.has(p.start)?'planned':unknown?'unavailable':p.dayAheadState;
      var dayAheadExport=context.exported.has(p.start)||(!unknown&&p.dayAheadExport===true);
      return state===p.dayAheadState&&dayAheadExport===p.dayAheadExport?p:
        Object.assign({},p,{dayAheadState:state,dayAheadExport:dayAheadExport,priceModel:PRICE_MODEL});
    });
  }
  function importMarket(p,afrr){
    if(p.dayAheadState==='unavailable')return {key:null,label:'Prijsbron onbekend',planned:true,mixed:false};
    if(p.dayAheadState==='planned')return {key:afrr?'day_ahead_afrr_import':'day_ahead_import',label:afrr?'Dynamisch + aFRR':'Dynamisch',planned:true,mixed:!!afrr};
    return {key:afrr?'afrr_import':'onbalans_import',label:afrr?'aFRR':'onbalans',planned:false,mixed:false};
  }
  function write(id,rows){
    memory.set(id,rows);
    var next=Infinity;Object.keys(rows).forEach(function(key){
      fields.forEach(function(field){var q=rows[key].quotes[field];if(q)next=Math.min(next,q.at+TTL);});
      rows[key].samples.forEach(function(s){next=Math.min(next,s.t+TTL);});
    });expires.set(id,next);
    try{if(Object.keys(rows).length)localStorage.setItem(PREFIX+id,JSON.stringify(rows));else localStorage.removeItem(PREFIX+id);}catch(_){}
  }
  function read(id){
    var now=Date.now();if(memory.has(id)&&now<expires.get(id))return memory.get(id);
    var rows=memory.get(id)||{},clean={};
    try{rows=JSON.parse(localStorage.getItem(PREFIX+id)||'null')||rows;}catch(_){}
    Object.keys(rows).forEach(function(key){
      var p=rows[key];if(!p||p.priceModel!==PRICE_MODEL||!Number.isFinite(p.start)||p.start%QUARTER||p.end!==p.start+QUARTER)return;
      var quotes={};fields.forEach(function(field){
        var q=p.quotes&&p.quotes[field];
        if(q&&Number.isFinite(q.value)&&Number.isFinite(q.at)&&q.at<=now&&now-q.at<TTL)quotes[field]={value:q.value,at:q.at};
      });
      if(!Object.keys(quotes).length)return;
      clean[p.start]={start:p.start,end:p.end,afrr:!!p.afrr,directions:Array.isArray(p.directions)?p.directions.slice():null,sourceUpdatedAt:p.sourceUpdatedAt,quotes:quotes,priceModel:PRICE_MODEL,dayAheadState:p.dayAheadState||'none',dayAheadExport:p.dayAheadExport===true,
        samples:(p.dayAheadState==='planned'||p.dayAheadState==='unavailable'?[]:Array.isArray(p.samples)?p.samples:[]).filter(function(s){return s&&Number.isFinite(s.t)&&s.t>=p.start&&s.t<p.end&&s.t<=now&&now-s.t<TTL&&Number.isFinite(s.ki)&&Number.isFinite(s.ke);})};
    });
    write(id,clean);return clean;
  }
  function schedule(){
    clearTimeout(timer);var next=Infinity;
    expires.forEach(function(at){next=Math.min(next,at);});
    if(Number.isFinite(next))timer=setTimeout(function(){memory.forEach(function(_,id){read(id);});schedule();},Math.max(1,next-Date.now()));
  }
  function remember(id,payload){
    if(!id||!payload||!Array.isArray(payload.prices))return;
    var now=Date.now(),rows=read(id);
    preparePrices(payload.prices,payload).forEach(function(p){
      if(!p||p.carried||p.temporaryTariffs||!Number.isFinite(p.start)||p.start%QUARTER||p.end!==p.start+QUARTER||p.start>now||now>=p.end)return;
      var row=rows[p.start]||{start:p.start,end:p.end,quotes:{},samples:[]},v=p.values||{};
      var revision=Date.parse(p.updatedAt);
      if(Number.isFinite(revision)&&Number.isFinite(row.sourceUpdatedAt)&&revision<row.sourceUpdatedAt)return;
      if(Number.isFinite(revision))row.sourceUpdatedAt=revision;
      row.priceModel=PRICE_MODEL;row.dayAheadState=p.dayAheadState;row.dayAheadExport=p.dayAheadExport;
      if(p.dayAheadState!=='none'){delete row.quotes.onbalans_import;row.samples=[];}
      var discovery=(payload.afrrDiscovery||[]).find(function(d){return d.start===p.start;});
      row.afrr=Array.isArray(payload.afrrEventIsps)?payload.afrrEventIsps.indexOf(p.start)!==-1:!!p.afrr;
      row.directions=discovery&&Array.isArray(discovery.directions)?discovery.directions.slice():Array.isArray(p.directions)?p.directions.slice():null;
      fields.forEach(function(field){if((field!=='onbalans_import'||p.dayAheadState==='none')&&Number.isFinite(v[field]))row.quotes[field]={value:v[field],at:now};});
      var imbalance=p.dayAheadState==='none'&&(Array.isArray(row.directions)?!row.directions.length:!row.afrr);
      if(imbalance&&fields.every(function(field){return Number.isFinite(v[field]);})){
        var last=row.samples[row.samples.length-1];
        if(!last||last.ki!==v.onbalans_import||last.ke!==v.onbalans_export)row.samples.push({t:now,ki:v.onbalans_import,ke:v.onbalans_export,marktImport:'onbalans',marktExport:'onbalans',temporaryTariffs:true});
      }
      if(Object.keys(row.quotes).length)rows[p.start]=row;
    });
    write(id,rows);schedule();
  }
  function get(id,start){return id?read(id)[start]||null:null;}
  function restore(id,source){
    var rows=(source||[]).filter(function(p){return !p.temporaryTariffs;}),saved=id?read(id):{};
    Object.keys(saved).forEach(function(key){var p=saved[key];if(!rows.some(function(r){return r.start===p.start;}))rows.push({start:p.start,end:p.end,afrr:p.afrr,directions:p.directions,dayAheadState:p.dayAheadState,dayAheadExport:p.dayAheadExport,priceModel:PRICE_MODEL,values:{},provisional:true,temporaryTariffs:true});});
    return rows.sort(function(a,b){return a.start-b.start;});
  }
  try{Array.from({length:localStorage.length},function(_,i){return localStorage.key(i);}).filter(function(key){return key&&key.indexOf(PREFIX)===0;}).forEach(function(key){read(key.slice(PREFIX.length));});}catch(_){}
  window.addEventListener('storage',function(event){if(event.key&&event.key.indexOf(PREFIX)===0){var id=event.key.slice(PREFIX.length);memory.delete(id);expires.delete(id);read(id);schedule();}});
  window.BECurrentTariffCache={remember:remember,get:get,restore:restore,preparePrices:preparePrices,applyPlanning:applyPlanning,importMarket:importMarket,priceModel:PRICE_MODEL};schedule();
})();
