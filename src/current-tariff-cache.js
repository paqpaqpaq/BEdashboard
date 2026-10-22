/* Short-lived observations of the running quarter; settled prices and BID history are separate. */
(function () {
  'use strict';
  if(window.BECurrentTariffCache)return;
  var TTL=30*60*1000,QUARTER=900000,PREFIX='be_current_tariffs_v1:',memory=new Map(),expires=new Map(),timer;
  var fields=['onbalans_import','onbalans_export'];
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
      var p=rows[key];if(!p||!Number.isFinite(p.start)||p.start%QUARTER||p.end!==p.start+QUARTER)return;
      var quotes={};fields.forEach(function(field){
        var q=p.quotes&&p.quotes[field];
        if(q&&Number.isFinite(q.value)&&Number.isFinite(q.at)&&q.at<=now&&now-q.at<TTL)quotes[field]={value:q.value,at:q.at};
      });
      if(!Object.keys(quotes).length)return;
      clean[p.start]={start:p.start,end:p.end,afrr:!!p.afrr,directions:Array.isArray(p.directions)?p.directions.slice():null,sourceUpdatedAt:p.sourceUpdatedAt,quotes:quotes,
        samples:(Array.isArray(p.samples)?p.samples:[]).filter(function(s){return s&&Number.isFinite(s.t)&&s.t>=p.start&&s.t<p.end&&s.t<=now&&now-s.t<TTL&&Number.isFinite(s.ki)&&Number.isFinite(s.ke);})};
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
    payload.prices.forEach(function(p){
      if(!p||p.carried||p.temporaryTariffs||!Number.isFinite(p.start)||p.start%QUARTER||p.end!==p.start+QUARTER||p.start>now||now>=p.end)return;
      var row=rows[p.start]||{start:p.start,end:p.end,quotes:{},samples:[]},v=p.values||{};
      var revision=Date.parse(p.updatedAt);
      if(Number.isFinite(revision)&&Number.isFinite(row.sourceUpdatedAt)&&revision<row.sourceUpdatedAt)return;
      if(Number.isFinite(revision))row.sourceUpdatedAt=revision;
      var discovery=(payload.afrrDiscovery||[]).find(function(d){return d.start===p.start;});
      row.afrr=Array.isArray(payload.afrrEventIsps)?payload.afrrEventIsps.indexOf(p.start)!==-1:!!p.afrr;
      row.directions=discovery&&Array.isArray(discovery.directions)?discovery.directions.slice():Array.isArray(p.directions)?p.directions.slice():null;
      fields.forEach(function(field){if(Number.isFinite(v[field]))row.quotes[field]={value:v[field],at:now};});
      var imbalance=Array.isArray(row.directions)?!row.directions.length:!row.afrr;
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
    Object.keys(saved).forEach(function(key){var p=saved[key];if(!rows.some(function(r){return r.start===p.start;}))rows.push({start:p.start,end:p.end,afrr:p.afrr,directions:p.directions,values:{},provisional:true,temporaryTariffs:true});});
    return rows.sort(function(a,b){return a.start-b.start;});
  }
  try{Array.from({length:localStorage.length},function(_,i){return localStorage.key(i);}).filter(function(key){return key&&key.indexOf(PREFIX)===0;}).forEach(function(key){read(key.slice(PREFIX.length));});}catch(_){}
  window.addEventListener('storage',function(event){if(event.key&&event.key.indexOf(PREFIX)===0){var id=event.key.slice(PREFIX.length);memory.delete(id);expires.delete(id);read(id);schedule();}});
  window.BECurrentTariffCache={remember:remember,get:get,restore:restore};schedule();
})();
