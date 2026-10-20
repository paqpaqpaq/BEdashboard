const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),root=__dirname+'/../src/',source=fs.readFileSync(root+'coulomb-beta.js','utf8'),now=Date.now();
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`),values=new Map([['be-own-soc-settings:demo',JSON.stringify({capacity:50.3})]]);let writes=0,failSave=false,section;
function control(value=''){return {value,disabled:false,required:false};}
const f={elements:Object.fromEntries(['capacityMode','capacity','fccAh','packCount','nominalVoltage'].map(n=>[n,control()])),reportValidity:()=>true,nodes:{}};
f.querySelector=q=>f.nodes[q]??=( {textContent:'',hidden:false} );
const manual={},exp={};function node(tag){if(tag==='section')return section={querySelector:q=>q==='[data-settings]'?f:q==='[data-manual]'?manual:q==='[data-export]'?exp:null};return {style:{},textContent:''};}
const box={window:{},location:{pathname:'/customer/demo',origin:'https://dashboard.balansenergie.nl'},document:{createElement:node,head:{append(){}},getElementById:()=>null},localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){if(failSave)throw Error('quota');writes++;values.set(k,v);}},console,Date,URL,AbortController,setTimeout,clearTimeout};vm.createContext(box);
const marker='  // The dashboard refreshes';const exposed=source.replace(marker,`  window.capacityTest={panel,poll,compute,display,settings,get(){return {cfg,record,result,error};},set(v){cfg=v.cfg||{};record=v.record||{rows:[],manual:[]};payload=null;compute();}};return;\n`+marker);vm.runInContext(exposed,box);
const api=box.window.capacityTest,model=box.window.BECapacity;
assert.equal(model.resolve({}),null);assert.equal(model.resolve({capacityMode:'unknown',capacity:48.2}),null);near(model.resolve({capacity:50.3}).capacity,50.3);near(model.resolve({capacityMode:'kwh',capacityKwh:'50,35'}).capacity,50.35);
near(model.resolve({capacityMode:'fcc',fccAh:328,packCount:3,nominalVoltage:51.2}).capacity,50.3808);
for(const bad of [{fccAh:0},{packCount:0},{packCount:2.5},{nominalVoltage:0},{nominalVoltage:NaN}])assert.equal(model.resolve({capacityMode:'fcc',fccAh:328,packCount:3,nominalVoltage:51.2,capacity:48.2,...bad}),null);
api.panel({parentElement:{insertAdjacentElement(){}}});assert.equal(f.elements.capacity.value,50.3);assert.equal(f.elements.capacityMode.value,'kwh');assert(f.elements.fccAh.disabled);
f.elements.capacityMode.value='fcc';f.elements.fccAh.value='328';f.elements.packCount.value='3';f.elements.nominalVoltage.value='51.2';f.onchange();assert(f.elements.capacity.disabled);assert(f.elements.fccAh.required);assert.match(f.nodes['[data-capacity-preview]'].textContent,/50,38 kWh/);near(api.settings().capacity,50.3);assert.equal(writes,0);
module.exports=(async()=>{
 await f.onsubmit({preventDefault(){}});near(api.settings().capacity,50.3808);assert.equal(JSON.parse(values.get('be-own-soc-settings:demo')).capacityMode,'fcc');
 f.elements.capacityMode.value='kwh';f.elements.capacity.value='52';f.onchange();failSave=true;await f.onsubmit({preventDefault(){}});near(api.settings().capacity,50.3808);assert.match(api.get().error,/quota/);failSave=false;
 f.elements.capacity.value='50.5';await f.onsubmit({preventDefault(){}});near(api.settings().capacity,50.5);assert.equal(api.get().error,'');
 f.elements.capacityMode.value='fcc';f.elements.packCount.value='2.5';f.onchange();await f.onsubmit({preventDefault(){}});near(api.settings().capacity,50.5);
 // No forecast/account value may replace either an existing setting or missing configuration.
 const calls=[];box.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>String(url).includes('current-history')?{rows:[{t:now-60000,s:50,bo:1000},{t:now,s:50,bo:1000}]}:{battery_capacity_kwh:999,items:[]}};};
 await api.poll();near(api.settings().capacity,50.5);assert(calls.every(u=>!u.includes('/account')));
 api.set({cfg:{}});await api.poll();assert.equal(model.resolve(api.get().cfg),null);assert.equal(api.get().result,null);assert.equal(api.get().record.rows.length,2);assert.match(api.display().state,/Kies de rekencapaciteit/);
 assert(!source.includes('payload.battery_capacity_kwh'));new vm.Script(fs.readFileSync(root+'../Balansenergie-All-in-v6.0-beta.user.js','utf8'));
 console.log('PASS capacity: legacy 50.3 preserved, kWh/FCC modes, 328×3×51.2=50.3808, live preview not auto-applied, save/failure/validation, no account/forecast/default adoption, unconfigured history retained safely.');
})();
