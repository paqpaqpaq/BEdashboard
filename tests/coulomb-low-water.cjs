const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),root=__dirname+'/../src/',box={window:{},Date,console};vm.createContext(box);
vm.runInContext(fs.readFileSync(root+'coulomb-core-beta.js','utf8'),box);const core=box.window.BEEnergySOC,now=Date.now(),T=now-14*60000,near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const raw=[12,10,8,8,8,9,10,11,10,9,12,10,7,7,7],power=raw.map((_,i)=>[3,4,5,6,7,8,13,14].includes(i)?-6000:6000),rows=raw.map((s,i)=>[T+i*60000,s,power[i]]),r=core.calculate(rows,{capacity:10});
for(const [i,soc] of [[1,10],[2,8],[3,8],[4,9],[5,10],[6,11],[7,12],[8,13],[11,10],[12,7],[13,7],[14,8]])near(r.points[i].soc,soc);
assert.equal(r.points[3].lowState.mode,'tracking');assert.equal(r.points[4].lowState.mode,'released');assert(!r.points[6].anchor);assert(!r.points[8].anchor);assert.equal(r.points[10].lowState.mode,'ready');assert.equal(r.points[11].anchor.soc,10);
near(core.at(r.points,T+150000),8); // interpolate within two low-tracking measurements
let input=0,output=0;for(let i=1;i<rows.length;i++){const e=core.energy(rows[i-1][2],rows[i][2],60000);input+=e.input;output+=e.output;}near(r.input,input);near(r.output,output);
// Native SOC remains flat or rises noisily while discharging: hold its lowest point.
const noisy=core.calculate([[T,10,6000],[T+60000,8,6000],[T+120000,9,6000],[T+180000,8,6000]],{capacity:10});near(noisy.points[2].soc,8);near(noisy.points[3].soc,8);assert.equal(noisy.events.length,2);
// Initial charging below 10 does not engage the following mode.
const charging=core.calculate([[T,8,-6000],[T+60000,9,-6000],[T+120000,10,-6000]],{capacity:10});near(charging.points.at(-1).soc,10);assert.equal(charging.events.length,1);assert(charging.points.every(p=>p.lowState.mode==='released'));
// 95% anchoring is unchanged, regardless of current power direction.
for(const p of [-6000,0,6000,null])for(const [a,b] of [[94,95],[94,96],[96,94]]){const h=core.calculate([[T,a,p],[T+60000,b,p]],{capacity:10});near(h.points[1].soc,b);assert.match(h.lastAnchor.kind,/95%/);}
// Manual anchor releases tracking; all energy meters continue.
const manual=core.calculate(rows.slice(0,7),{capacity:10},[{t:rows[3][0],soc:20,kind:'handmatig'}]);near(manual.points[6].soc,23);near(manual.input,core.calculate(rows.slice(0,7),{capacity:10}).input);
// Trimming/reloading must preserve the low state, including an already released bottom.
for(const k of [2,3,4,6,12,13,14]){const point=r.points[k],carried={t:point.t,soc:point.soc,kind:'bewaard telpunt',lowState:point.lowState};const resumed=core.calculate(rows.slice(k),{capacity:10},[carried]);for(let i=1;i<resumed.points.length;i++)near(resumed.points[i].soc,r.points[k+i].soc);}
// Every available power interval still contributes, including long intervals and missing native SOC.
const full=core.calculate([[T,50,-1000],[T+1800000,null,-1000],[T+3600000,50,-1000]],{capacity:10});near(full.input,1);near(full.points.at(-1).soc,60);assert(full.uncertain);
new vm.Script(fs.readFileSync(root+'../Balansenergie-All-in-v6.0-beta.user.js','utf8'));
console.log('PASS 6.1: 10→8 tracking, release to 9 while native stays 8, independent rise through 10, no low reset on native noise, next discharge cycle, 95%, manual, resume state, all kWh in/out retained, syntax.');
