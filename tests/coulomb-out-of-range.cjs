const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box={window:{}};vm.createContext(box);vm.runInContext(fs.readFileSync(__dirname+'/../src/coulomb-core-beta.js','utf8'),box);
const core=box.window.BEEnergySOC,T=Date.parse('2026-11-06T12:00:00Z');
// 6.7.1: drift between 20% and 80% BE-SOC without any 5/10/95/100% calibration.
// Net charging of 10 kW for an hour on a 10 kWh pack would count to ~>100%.
const rows=[];for(let i=0;i<=60;i++)rows.push([T+i*60000,i===0?30:(i<=30?40:60),-10000]);
const r=core.calculate(rows,{capacity:10});
assert(r.points.every(p=>p.soc===null||(p.soc>=-0.5&&p.soc<=100.5)),'counter never leaves 0–100%');
const ev=r.events.filter(e=>e.kind==='Buiten bereik · ijking op BE-SOC');
assert(ev.length>=1,'out-of-range recalibration recorded');
assert.equal(ev[0].soc,60,'recalibrates to the BE-SOC of that moment');
// Within range nothing changes: no extra anchors.
const calm=core.calculate([[T,50,-1000],[T+60000,50,-1000],[T+120000,51,1000]],{capacity:10});
assert(!calm.events.some(e=>e.kind.startsWith('Buiten bereik')));
console.log('PASS coulomb out-of-range: drift above 100% or below 0% recalibrates on BE-SOC; normal range unchanged.');
