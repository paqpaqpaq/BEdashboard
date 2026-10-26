const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../src/',box={window:{}};vm.createContext(box);
for(const file of ['voltage-profile.js','coulomb-core-beta.js','capacity-settings-beta.js'])vm.runInContext(fs.readFileSync(root+file,'utf8'),box);
const v=box.window.BEMeasuredVoltage,core=box.window.BEEnergySOC,cap=box.window.BECapacity;
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,`${a} != ${b}`),T=Date.parse('2026-10-25T12:00:00Z');
// Independent low-SOC measurement: 13.66 A discharge at 47.031 V.
near(v.current(13.66*47.031,9.992654710167105,330),-13.66,.3);
assert(Math.abs(v.current(1000,10,330))>Math.abs(v.current(1000,80,330)));
assert(v.current(-1000,50,330)>0);assert(v.current(1000,50,330)<0);assert.equal(v.current(0,50,330),0);
near(v.current(3000,50,990),3*v.current(1000,50,330));
assert(v.referenceVoltage>50&&v.referenceVoltage<55);
const cfg={capacity:330*v.referenceVoltage/1000,capacityAh:330,voltageProfile:v.id};
const rows=[[T,50,-1000],[T+60000,null,-1000],[T+120000,50,-1000],[T+180000,50,1000],[T+240000,50,1000]];
const measured=core.calculate(rows,cfg),legacy=core.calculate(rows,{capacity:cfg.capacity});
assert(measured.points.every(p=>Number.isFinite(p.soc)),'missing raw SOC never discards valid power');
near(measured.input,legacy.input);near(measured.output,legacy.output);
near(measured.points[2].soc,50+measured.points[2].inputAh/330*100);
assert(measured.points[2].soc<legacy.points[2].soc,'charging at measured voltage must add less Ah than a nominal-energy shortcut');
const cross=v.integrate(-1000,1000,60000,50,50,330);assert(cross.input>0&&cross.output>0);
const endpoints=core.calculate([[T,99,6000],[T+60000,100,6000],[T+120000,100,6000]],cfg);
near(endpoints.points[1].soc,100);assert(endpoints.points[2].soc<100);
const manual=core.calculate(rows,cfg,[{t:T+120000,soc:56,kind:'handmatig'}]);near(manual.points[2].soc,56);
// Save and reload a trimmed checkpoint without a duplicate boundary calibration.
const p=endpoints.points[1],checkpoint={t:p.t,soc:p.soc,lowState:p.lowState,highState:p.highState,boundaryState:p.boundaryState};
const restored=core.calculate([[T+60000,100,6000],[T+120000,100,6000]],cfg,[checkpoint]);near(restored.points[1].soc,endpoints.points[2].soc);
const resolved=cap.resolve({capacityMode:'fcc',fccAh:999,packCount:3,nominalVoltage:1});
near(resolved.capacityAh,990);near(resolved.fccAh,330);assert(!('nominalVoltage' in resolved));
const elements=Object.fromEntries(Object.entries({capacityMode:'fcc',capacity:'',fccAh:'999',packCount:'3'}).map(([k,value])=>[k,{value}]));
const saved=cap.readForm({elements},{nominalVoltage:51.2});assert.equal(saved.fccAh,330);assert(!('nominalVoltage' in saved));
// The forecast must use the same varying-voltage Ah conversion and time units.
const source=fs.readFileSync(root+'coulomb-beta.js','utf8'),start=source.indexOf("(function(root){\n  'use strict';\n  const clamp="),end=source.indexOf('\n})(window);',start)+'\n})(window);'.length;
vm.runInContext(source.slice(start,end),box);
const Q=900000,three={capacity:990*v.referenceVoltage/1000,capacityAh:990,voltageProfile:v.id};
const future=box.window.BESOCExtras.project([{t:T,dt:Q,pv:3,load:0},{t:T+Q,dt:Q,pv:0,load:3}],{t:T,soc:50},three,Infinity,T);
near(future[0],50);assert(future[1]>55&&future[1]<56.5,'3 kWh charged is converted through the voltage curve');
const empty=box.window.BESOCExtras.project([{t:T,dt:Q,pv:0,load:3},{t:T+Q,dt:Q,pv:0,load:3}],{t:T,soc:5},three,Infinity,T);
near(empty[1],5); // Forecast retains the existing 5% lower bound.
console.log('PASS measured Coulomb: real low-voltage fixture, SOC/current dependence, Ah units, parallel scaling, energy meters, sign crossings, missing SOC, 100% release, manual anchors, checkpoint replay and 330 Ah saved cap without nominal voltage.');
