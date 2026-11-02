const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/coulomb-beta.js','utf8');
const a=source.indexOf('(function(root){\n  \'use strict\';\n  const clamp='),b=source.indexOf('})(window);',a);
const box={window:{}};vm.createContext(box);vm.runInContext(source.slice(a,b+11),box);
const api=box.window.BESOCExtras,T=Date.parse('2026-11-01T12:00:00Z'),Q=900000;
const slots=Array.from({length:4},(_,k)=>({t:T+k*Q,dt:Q,pv:99,load:0}));
const cfg={capacity:50},own=(soc,t=T)=>({soc,t});
const planned=(values,soc=10,t=T)=>Array.from(api.projectNative(slots,values,own(soc,t),cfg,t));
assert.deepEqual(planned([50,80,60,55]),[10,40,20,15],'planned charge and discharge move from our own SOC, without adding PV again');
assert.deepEqual(planned([50,80,70,60],95),[95,100,90,80],'clipped charging creates no ghost reserve');
assert.deepEqual(planned([50,40,60,65],5),[5,5,25,30],'clipped discharge creates no future SOC debt');
assert.deepEqual(planned([50,80,60,55],10,T+Q/2),[null,25,5,5],'baseline is interpolated at the actual Coulomb timestamp');
assert.deepEqual(planned([50,60,null,80]),[10,20,null,null],'null gaps never become zero or bridge later changes');
assert.equal(api.projectNative(slots,[50,60,70,80],own(10,T-1),cfg,T),null,'no invented native baseline before the forecast');
assert.equal(api.projectNative(slots,[50,60,70,80],own(10),cfg,T+120001),null,'stale measured anchors remain invalid');
const gap=slots.map(q=>({...q}));gap[2].t+=Q;
assert.deepEqual(Array.from(api.projectNative(gap,[50,60,70,80],own(10),cfg,T)),[10,20,null,null],'time gaps remain gaps');
const labels=slots.map(q=>new Date(q.t).toISOString());
const chart={data:{labels,datasets:[{label:'SOC p10',data:[1,2,3,4]},{label:'SOC p50',hidden:true,data:[50,{y:60},[2,70],null]},{label:'SOC p50',beOwnSOC:'forecast',data:[99,99,99,99]}]}};
assert.deepEqual(Array.from(api.nativeSOC(chart,slots)),[50,60,70,null],'only the native p50 source is read, also when its display is hidden');
assert.equal(api.nativeSOC({data:{datasets:[{label:'PV p50',data:[1,2,3,4]}]}},slots),null,'unrelated quantiles are never selected');
assert.equal(api.nativeSOC({data:{datasets:[{label:'SOC p50',data:[1,2]}]}},slots),null,'mismatched time grids are not guessed');
const nativeChart=(times,data=[50,60,70,80])=>({data:{labels:times,datasets:[{label:'SOC p50',data}]}});
assert.equal(api.forecastGrid(chart,slots,own(10)).valid,true,'matching complete timestamps identify the grid');
assert.equal(api.nativeSOC(nativeChart(slots.map(q=>new Date(q.t+3600000).toISOString())),slots),null,'same length with a one-hour shift is rejected');
assert.equal(api.nativeSOC(nativeChart(slots.map(q=>new Date(q.t+86400000).toISOString())),slots),null,'explicit dates from another day are rejected');
assert.equal(api.nativeSOC(nativeChart(labels,slots.map((q,k)=>({x:q.t+3600000,y:50+k}))),slots),null,'conflicting explicit point timestamps are rejected even when labels match');
assert.equal(api.forecastGrid(nativeChart(['slot A','slot B','slot C','slot D'],slots.map((q,k)=>({x:q.t,y:50+k}))),slots).valid,true,'explicit timestamp points can identify otherwise unparseable labels');
assert.equal(api.forecastGrid(nativeChart([0,1,2,3],slots.map((q,k)=>({x:k,y:50+k}))),slots).valid,false,'indices alone cannot establish a time grid');
assert.equal(api.forecastGrid(nativeChart(['unknown','unknown','unknown','unknown']),slots).valid,false,'unparseable labels remain pending');
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
const clockLabels=slots.map(q=>clock.format(new Date(q.t)));
assert.equal(api.forecastGrid(nativeChart(clockLabels),slots,own(10)).valid,true,'all Amsterdam clock labels may identify the contiguous grid');
assert.equal(api.forecastGrid(nativeChart(clockLabels.map((value,k)=>k===2?'09:17':value)),slots).valid,false,'every clock label is checked');
const midnight=Array.from({length:4},(_,k)=>({t:Date.parse('2026-11-01T22:45:00Z')+k*Q,dt:Q}));
assert.equal(api.forecastGrid(nativeChart(midnight.map(q=>clock.format(new Date(q.t)))),midnight,{t:midnight[1].t,soc:10}).valid,true,'clock-only grids preserve Amsterdam day rollovers');
const skipped=slots.map((q,k)=>({...q,t:q.t+(k>=2?Q:0)}));
assert.equal(api.forecastGrid(nativeChart(skipped.map(q=>clock.format(new Date(q.t)))),skipped).valid,false,'clock-only grids with skipped slots remain pending');
assert.equal(api.forecastGrid(nativeChart(clockLabels),slots,own(10,T-Q)).valid,false,'clock-only grids must cover the measured anchor');
assert.equal(api.sameForecastDay(Date.parse('2026-11-01T22:59:00Z'),Date.parse('2026-11-01T23:01:00Z')),false,'forecast freshness follows Amsterdam midnight rather than UTC midnight');
assert.equal(api.sameForecastDay(T,T+Q),true,'a same-day fetched forecast remains eligible');

// Exercise the production coordinator, without starting the userscript or any requests.
const fA=source.indexOf('  function forecastValues(chart){'),fB=source.indexOf('  function applyVisibility(chart)',fA);
let fallbackCalls=0;
const forecastBox={
 payload:{items:[{hours:labels,interval_minutes:15,usage_kwh:[0,0,0,0],pv_production_kwh:[99,99,99,99]}]},
 forecastFetch:T,settings:()=>cfg,result:{points:[]},latest:()=>own(10),visualSoc:p=>p.soc,core:{at:()=>null},
 ext:{...api,sameForecastDay:a=>api.sameForecastDay(a,T),projectNative:(...args)=>api.projectNative(...args,T),project:()=>{fallbackCalls++;return [1,2,3,4];}}
};
vm.createContext(forecastBox);vm.runInContext(source.slice(fA,fB),forecastBox);
const mismatch=forecastBox.forecastValues(nativeChart(slots.map(q=>new Date(q.t+3600000).toISOString())));
assert.equal(mismatch.pending,true);assert.equal(mismatch.future.length,0);assert.equal(mismatch.actual.length,0);
assert.equal(fallbackCalls,0,'an unverified native time grid cannot silently fall back to PV');
forecastBox.forecastFetch=T-86400000;
assert.equal(forecastBox.forecastValues(chart).pending,true,'a previous-day payload clears projected series until refreshed');
assert.equal(fallbackCalls,0);

const dA=source.indexOf('  function decorate(chart){'),dB=source.indexOf('  function attachPastColors(chart)',dA);
const oldChart={canvas:{id:'soc-forecast-chart'},data:{datasets:[{beOwnSOC:'measured',data:[1,2,3]},{beOwnSOC:'forecast',data:[4,5,6]}]}};
const decorateBox={
 forecastValues:()=>mismatch,dataset:(c,tag,label,points)=>{c.data.datasets.find(d=>d.beOwnSOC===tag).data=points;},
 attachPastColors(){},applyVisibility(){},filterNativeLegend(){},settings:()=>cfg,payload:null,
 window:{BESocHover:{attach(){}}}
};
vm.createContext(decorateBox);vm.runInContext(source.slice(dA,dB),decorateBox);decorateBox.decorate(oldChart);
assert.equal(oldChart.data.datasets.every(d=>d.data.length===0),true,'both old projected arrays are cleared under an invalid grid');
assert.match(oldChart.$beForecastNotice,/tijdkoppeling/);
console.log('PASS forecast planning: relative native SOC, source selection, validated timestamps and clock grids, day rollover, gap handling and pending-state clearing.');
