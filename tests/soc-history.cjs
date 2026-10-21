const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',source=fs.readFileSync(root+'src/coulomb-beta.js','utf8');
const day=86400000,start=Date.parse('2026-10-20T00:00:00+02:00');
const c={window:{},location:{pathname:'/customer/test/history/'},console};
vm.createContext(c);vm.runInContext(fs.readFileSync(root+'src/soc-history-beta.js','utf8'),c);
const api=c.window.BESocHistory;
const chart={canvas:{id:'soc-chart'},data:{datasets:[{label:'SOC',data:[{x:start,y:null},{x:start+day-900000,y:59}]}]},config:{options:{scales:{x:{}}}},scales:{x:{min:start-3*day,max:start+day,parse:x=>Date.parse(x)}}};
assert(api.active(chart));assert.deepEqual(JSON.parse(JSON.stringify(api.range(chart))),{min:start,max:start+day-900000});
chart.data.datasets.push({beOwnSOC:'measured',data:[{x:start-3*day,y:50},{x:start+3*day,y:60}]});
assert.equal(api.range(chart).min,start);assert.equal(api.range(chart).max,start+day-900000);
const original=JSON.stringify(chart.data.datasets[0]);
Object.assign(c,{result:{points:[-3*day,0,60000,120000,day-900000,day].map((offset,i)=>({t:start+offset,soc:50+i,gap:i===2}))},visualSoc:p=>p.soc,followsOriginal:()=>false,cfg:{},applyVisibility:()=>{},filterNativeLegend:()=>{}});
vm.runInContext(source.slice(source.indexOf('  function dataset('),source.indexOf('  function forecastValues('))+source.slice(source.indexOf('  function decorate('),source.indexOf('  function attachPastColors(')),c);
c.decorate(chart);
assert.equal(JSON.stringify(chart.data.datasets[0]),original);
assert.deepEqual(Array.from(chart.data.datasets[1].data,p=>p.x),[start,start+60000,start+120000,start+day-900000]);
assert.equal(chart.data.datasets[1].data[1].y,null,'real measurement gaps remain gaps');
assert.equal(chart.data.datasets[1].spanGaps,undefined); // existing dataset properties are not overwritten
for(const [name,min,max] of [['previous day',start-day,start-1],['month',start-19*day,start+11*day],['year',start-292*day,start+73*day]]){
  chart.data.datasets[0].data=[{x:min,y:20},{x:max,y:60}];
  c.decorate(chart);assert.equal(api.range(chart).min,min,name);assert.equal(api.range(chart).max,max,name);
  assert(chart.data.datasets[1].data.every(p=>p.x>=min&&p.x<=max),name);
}
chart.config.options.scales.x={min:start,max:start+day};
assert.equal(api.range(chart).min,start);assert.equal(api.range(chart).max,start+day);
chart.config.options.scales.x={};chart.data.datasets[0].data=[];c.decorate(chart);
assert.equal(api.range(chart),null);assert.equal(chart.data.datasets[1].data.length,0,'empty period must not display the complete archive');
chart.data.labels=['2026-10-20T00:00:00+02:00','2026-10-20T23:45:00+02:00'];chart.data.datasets[0].data=[null,60];
assert.equal(api.range(chart).min,start);assert.equal(api.range(chart).max,start+day-900000);
c.location.pathname='/customer/test/';assert(!api.active(chart));
c.location.pathname='/customer/test/forecast/';assert(!api.active(chart));
assert(source.includes(fs.readFileSync(root+'src/soc-history-beta.js','utf8')));
console.log('PASS history: native period only, initial/old axis ignored, day/month/year replacement, explicit bounds, empty periods, labels, real gaps preserved, other pages excluded.');
