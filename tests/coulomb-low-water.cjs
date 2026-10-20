const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),root=__dirname+'/../src/',box={window:{},Date,console};vm.createContext(box);
vm.runInContext(fs.readFileSync(root+'coulomb-core-beta.js','utf8'),box);const core=box.window.BEEnergySOC,now=Date.now(),T=now-14*60000,near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const raw=[12,10,8,8,8,9,10,11,10,9,12,10,7,7,7],power=raw.map((_,i)=>[3,4,5,6,7,8,13,14].includes(i)?-6000:6000),rows=raw.map((s,i)=>[T+i*60000,s,power[i]]),low=core.calculate(rows,{capacity:10}),upper=rows.map(([t,s,p])=>[t,105-s,-p]),high=core.calculate(upper,{capacity:10});
for(const [i,soc] of [[1,10],[2,8],[3,8],[4,9],[5,10],[6,11],[7,12],[8,13],[11,10],[12,7],[13,7],[14,8]]){near(low.points[i].soc,soc);near(high.points[i].soc,105-soc);}
assert.equal(high.points[2].soc,97);assert.equal(high.points[4].soc,96);assert.equal(high.points[6].raw,95);assert.equal(high.points[6].soc,94);assert(!high.points[6].anchor);assert(!low.points[6].anchor);
assert.equal(high.points[3].highState.mode,'tracking');assert.equal(high.points[4].highState.mode,'released');
near(core.at(high.points,T+150000),97);
for(const r of [low,high])for(const p of r.points){if(p.reference){near(p.soc,p.reference.soc+(p.sinceInput-p.sinceOutput)/10*100);assert(p.sinceInput>=0&&p.sinceOutput>=0);}}
near(low.points[4].sinceInput,.1);near(low.points[4].sinceOutput,0);near(high.points[4].sinceOutput,.1);near(high.points[4].sinceInput,0);assert.equal(high.points[4].reference.t,upper[3][0]);
// Initial discharge above 95 remains independent; no backwards crossing anchor.
const initial=core.calculate([[T,98,6000],[T+60000,95,6000],[T+120000,94,6000]],{capacity:10});near(initial.points.at(-1).soc,96);assert.equal(initial.events.length,1);
// Manual anchoring resets displayed cycle counters, never archive energy.
const manual=core.calculate(upper.slice(0,7),{capacity:10},[{t:upper[3][0],soc:90,kind:'handmatig'}]);near(manual.points[3].sinceInput,0);near(manual.points[3].sinceOutput,0);near(manual.points[6].soc,87);near(manual.points[6].sinceOutput,.3);near(manual.output,core.calculate(upper.slice(0,7),{capacity:10}).output);
// Replay after trimming keeps both tracking states, original reference time, and cycle totals.
for(const [data,r] of [[rows,low],[upper,high]])for(const k of [2,3,4,6,12,13,14]){
 const p=r.points[k],anchor={t:p.t,soc:p.soc,kind:'bewaard telpunt',lowState:p.lowState,highState:p.highState,statsReference:{reference:p.reference,input:p.sinceInput,output:p.sinceOutput}};
 const resumed=core.calculate(data.slice(k),{capacity:10},[anchor]);
 for(let i=0;i<resumed.points.length;i++){const a=resumed.points[i],b=r.points[k+i];near(a.soc,b.soc);near(a.sinceInput,b.sinceInput);near(a.sinceOutput,b.sinceOutput);assert.equal(a.reference.t,b.reference.t);}
}
let input=0,output=0;for(let i=1;i<rows.length;i++){const e=core.energy(rows[i-1][2],rows[i][2],60000);input+=e.input;output+=e.output;}near(low.input,input);near(low.output,output);near(high.input,output);near(high.output,input);
const full=core.calculate([[T,50,-1000],[T+1800000,null,-1000],[T+3600000,50,-1000]],{capacity:10});near(full.input,1);near(full.points.at(-1).soc,60);assert(full.uncertain);
new vm.Script(fs.readFileSync(root+'../Balansenergie-All-in-v6.0-beta.user.js','utf8'));
console.log('PASS 6.1.1: mirrored low/high extrema, release on energy reversal, no return crossing anchors, cycle kWh exactly explain SOC, archive counts retained, manual anchors, trimming/reload preserve reference time and counters.');
