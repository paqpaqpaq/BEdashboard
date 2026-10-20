const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),root=__dirname+'/../src/',source=fs.readFileSync(root+'coulomb-beta.js','utf8');
const marker='  // The dashboard refreshes and sometimes replaces its datasets. Restore only our own series.';
const expose=`  window.followTest={visualSoc,followsOriginal,forecastValues,decorate,display,set(v){cfg={capacity:10};record=v.record||{rows:[],manual:[]};result=v.result||null;payload=v.payload||null;}};return;`;
const now=Date.now();
for(const pathname of ['/customer/demo','/customer/demo/','/customer/demo/forecast/']){
 const box={window:{},document:{createElement:()=>({style:{}}),head:{append(){}}},location:{pathname},localStorage:{getItem:()=>null,setItem(){}},console,Date};vm.createContext(box);vm.runInContext(source.replace(marker,expose),box);
 const api=box.window.followTest;assert(api,'counter did not initialize for '+pathname);
 assert.equal(api.visualSoc({soc:7,raw:8}),8);assert.equal(api.visualSoc({soc:11,raw:10}),11);assert.equal(api.visualSoc({soc:12,raw:11}),12);assert.equal(api.visualSoc({soc:7,raw:null}),7);
 const core=box.window.BEEnergySOC,rows=[[now-240000,11,1000],[now-180000,9,1000],[now-120000,8,1000],[now-60000,10,-1000],[now,11,-1000]],calculated=core.calculate(rows,{capacity:10});
 assert.equal(calculated.points[2].raw,8);assert(calculated.points[2].soc!==8);assert.equal(calculated.points[3].soc,10);assert(calculated.points[4].soc>10);
 const before=JSON.stringify(calculated),native={label:'origineel',borderColor:'#69318d',borderWidth:3,fill:true},chart={canvas:{id:'soc-chart'},scales:{x:{min:0,max:Infinity}},data:{datasets:[native]},setDatasetVisibility(){}};
 api.set({record:{rows,manual:[]},result:calculated});box.window.BESocHover.attach=()=>{};api.decorate(chart);
 const d=chart.data.datasets[1];assert.equal(d.order,-20);assert.equal(d.data[2].y,8);assert.equal(d.data[3].y,10);assert.equal(d.data[4].y,calculated.points[4].soc);assert.equal(JSON.stringify(calculated),before);assert.equal(native.borderWidth,3);
 api.set({record:{rows:rows.slice(0,3),manual:[]},result:{...calculated,points:calculated.points.slice(0,3)}});assert.equal(api.display().soc,'8,0%');
 // Future starts at the displayed low SOC and remains capped only in the forecast.
 const hours=[new Date(now-120000).toISOString(),new Date(now+780000).toISOString()];
 api.set({record:{rows,manual:[]},result:{...calculated,points:[{t:now,raw:8,soc:9}]},payload:{items:[{hours,usage_kwh:[0,0],pv_production_kwh:[0,0]}]}});
 const f=api.forecastValues({data:{labels:hours}});assert.equal(f.future[1],8);assert.equal(JSON.stringify(calculated),before);
}
console.log('PASS 6.0.7: slashless/root/forecast URLs initialize, blue follows raw SOC below 10, resumes independent count at 10 upward, counters and native styles unchanged, blue rendered above fill, forecast starts consistently.');
// Actual startup: no Chart.js yet, then native chart creation, and pageshow.
{
 const intervals=new Map(),timeouts=[],listeners={};let next=1,registered;
 const doc={documentElement:{},createElement:()=>({style:{}}),head:{append(){}},getElementById:()=>null,addEventListener:(k,f)=>listeners[k]=f};
 const box={window:{addEventListener:(k,f)=>listeners[k]=f},document:doc,location:{pathname:'/customer/demo'},localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{observe(){}},setInterval:(f,ms)=>{let id=next++;intervals.set(id,{f,ms});return id;},clearInterval:id=>intervals.delete(id),setTimeout:f=>timeouts.push(f),console,Date};
 vm.createContext(box);vm.runInContext(source.replace('  let storageTimer;','  return;\n  let storageTimer;'),box);
 assert(box.window.__beCoulombInOut6);const fast=[...intervals.values()].find(t=>t.ms===500);assert(fast);
 box.window.Chart={register:p=>registered=p,getChart:()=>null};fast.f();assert(registered);while(timeouts.length)timeouts.shift()();
 registered.afterInit();assert.equal(timeouts.length,1);while(timeouts.length)timeouts.shift()();
 listeners.pageshow();assert.equal(timeouts.length,1);while(timeouts.length)timeouts.shift()();
 for(let i=1;i<40;i++){fast.f();while(timeouts.length)timeouts.shift()();}assert(![...intervals.values()].some(t=>t.ms===500));
 console.log('PASS mobile startup: delayed Chart library registration, afterInit attachment and pageshow refresh; fast retry stops after startup.');
}
