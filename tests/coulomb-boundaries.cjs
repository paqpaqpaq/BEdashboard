const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box={window:{}};vm.createContext(box);const source=fs.readFileSync(__dirname+'/../src/coulomb-core-beta.js','utf8');vm.runInContext(source,box);
const core=box.window.BEEnergySOC,T=Date.parse('2026-10-25T12:00:00Z'),near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
// Arrive at full while already discharging; the broad tracker was released.
const high=[[T,98,6000],[T+60000,99,6000],[T+120000,100,6000],[T+180000,100,6000],[T+240000,null,6000],[T+300000,100,6000],[T+360000,99,6000],[T+420000,100,6000]];
const h=core.calculate(high,{capacity:10});near(h.points[2].soc,100);assert.equal(h.points[2].anchor.kind,'BE-SOC 100% · ijking');
near(h.points[3].soc,99);near(h.points[5].soc,97);assert(!h.points[3].anchor&&!h.points[5].anchor,'full plateau releases; missing raw SOC does not invent another arrival');near(h.points[7].soc,100);
// Arrive at reserve while already charging; the low tracker was released.
const low=high.map(([t,s,p])=>[t,s===null?null:105-s,-p]);
const l=core.calculate(low,{capacity:10});near(l.points[2].soc,5);assert.equal(l.points[2].anchor.kind,'BE-SOC 5% · ijking');near(l.points[3].soc,6);near(l.points[5].soc,8);near(l.points[7].soc,5);
// Normal approach still calibrates, and reversal begins a free count.
const normal=core.calculate([[T,94,-6000],[T+60000,95,-6000],[T+120000,100,-6000],[T+180000,100,-6000],[T+240000,100,6000],[T+300000,100,6000]],{capacity:10});
near(normal.points[2].soc,100);near(normal.points[3].soc,100);near(normal.points[5].soc,99);
// Explicit user anchors take priority, even at an observed boundary.
const manual=core.calculate(high,{capacity:10},[{t:high[2][0],soc:80,kind:'handmatig'}]);near(manual.points[2].soc,80);near(manual.points[3].soc,79);
// Checkpoints retain the arrival latch, reference time and cycle counters.
for(const [rows,result] of [[high,h],[low,l]])for(let k=2;k<rows.length;k++){
 const p=result.points[k],anchor={t:p.t,soc:p.soc,kind:'bewaard telpunt',lowState:p.lowState,highState:p.highState,boundaryState:p.boundaryState,statsReference:{reference:p.reference,input:p.sinceInput,output:p.sinceOutput}};
 const restored=core.calculate(rows.slice(k),{capacity:10},[anchor]);
 for(let i=0;i<restored.points.length;i++){near(restored.points[i].soc,result.points[k+i].soc);near(restored.points[i].sinceInput,result.points[k+i].sinceInput);near(restored.points[i].sinceOutput,result.points[k+i].sinceOutput);}
}
// Calibration changes chemical SOC only, never total metered energy.
let input=0,output=0;for(let i=1;i<high.length;i++){const e=core.energy(high[i-1][2],high[i][2],60000);input+=e.input;output+=e.output;}
near(h.input,input);near(h.output,output);
assert(fs.readFileSync(__dirname+'/../src/coulomb-beta.js','utf8').includes(source.trim()));
console.log('PASS SOC endpoints: independent 5%/100% arrivals, energy reversal, no plateau pinning, missing raw samples, manual priority, checkpoints and energy totals.');
