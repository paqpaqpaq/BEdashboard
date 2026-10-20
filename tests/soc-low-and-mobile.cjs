const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),root=__dirname+'/../src/',source=fs.readFileSync(root+'coulomb-beta.js','utf8');
// Actual startup: no Chart.js yet, then native chart creation, and pageshow.
{
 const intervals=new Map(),timeouts=[],listeners={};let next=1,registered;
 const doc={documentElement:{},createElement:()=>({style:{}}),head:{append(){}},getElementById:()=>null,addEventListener:(k,f)=>listeners[k]=f};
 const box={window:{addEventListener:(k,f)=>listeners[k]=f},document:doc,location:{pathname:'/customer/demo'},localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{observe(){}},setInterval:(f,ms)=>{let id=next++;intervals.set(id,{f,ms});return id;},clearInterval:id=>intervals.delete(id),setTimeout:f=>timeouts.push(f),console,Date};
 vm.createContext(box);vm.runInContext(source.replace('  let storageTimer;','  return;\n  let storageTimer;'),box);
 assert(box.window.__beCoulombInOut6);const fast=[...intervals.values()].find(t=>t.ms===500);assert(fast);
 box.window.Chart={register:(...plugins)=>{registered=plugins.find(p=>p.id==='beOwnEnergySoc');assert(plugins.some(p=>p.id==='beSocSynchronizedHover'));},getChart:()=>null};fast.f();assert(registered);while(timeouts.length)timeouts.shift()();
 registered.afterInit();assert.equal(timeouts.length,1);while(timeouts.length)timeouts.shift()();
 listeners.pageshow();assert.equal(timeouts.length,1);while(timeouts.length)timeouts.shift()();
 for(let i=1;i<40;i++){fast.f();while(timeouts.length)timeouts.shift()();}assert(![...intervals.values()].some(t=>t.ms===500));
 console.log('PASS mobile startup: delayed Chart library registration, afterInit attachment and pageshow refresh; fast retry stops after startup.');
}
