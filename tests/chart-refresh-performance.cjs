const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/actueel-bridge-beta.js','utf8');
const bidSource=fs.readFileSync(__dirname+'/../src/bid.js','utf8');
let now=Date.parse('2026-11-05T12:05:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const Q=900000,q=Math.floor(now/Q)*Q,frames=[],intervals=[],listeners={},plugins=[],charts=new Map(),nodes={};
function canvas(id){return {id,isConnected:true,getBoundingClientRect:()=>({left:0,width:600})};}
const native={canvas:canvas('battery-chart'),width:600,ctx:{fillText(){}},options:{scales:{x:{type:'linear',ticks:{}}}},
 scales:{x:{min:q-3*Q,max:q-2*Q,ticks:[{value:q-3*Q},{value:q-2*Q}]}},chartArea:{left:40,right:590},draws:0,draw(){this.draws++;}};
charts.set('battery-chart',native);
function Chart(cv,config){this.canvas=cv;this.width=600;this.data=config.data;this.options=config.options;this.config={options:this.options};this.updates=0;this.draws=0;
 this.update=()=>{this.updates++;plugins.forEach(p=>p.beforeUpdate?.(this));plugins.forEach(p=>p.afterUpdate?.(this));};this.draw=()=>{this.draws++;};charts.set(cv.id,this);}
Chart.register=p=>plugins.push(p);Chart.getChart=v=>charts.get(typeof v==='string'?v:v.id);Chart.Interaction={modes:{}};
nodes['be-tarief-chart']=canvas('be-tarief-chart');nodes['be-tarief-row']={hidden:true};
const initial={aan:true,allin:true,rijen:[{start:q-3*Q,end:q-2*Q,pi:.3,pe:.2}]};
nodes['be-tarief-data']={textContent:JSON.stringify(initial)};nodes['be-actueel-allin-data']={textContent:JSON.stringify({aan:true,btw:1.21,eb:.1,opslag:.02,saldeert:true,rijen:[]})};
let hideRow=false;
const document={hidden:false,getElementById:id=>hideRow&&id==='be-tarief-row'?null:nodes[id],addEventListener:(n,f)=>(listeners[n]??=[]).push(f)};
const context={Chart,document,Date:Clock,console,location:{pathname:'/customer/test/'},localStorage:{getItem:()=>null,setItem(){}},
 requestAnimationFrame:f=>frames.push(f),setTimeout:f=>frames.push(f),setInterval:f=>intervals.push(f),addEventListener(){}};context.window=context;
vm.createContext(context);vm.runInContext(source,context);
function flush(){let limit=30;while(frames.length){assert(--limit>0,'refresh must not schedule an endless render loop');frames.shift()();}}
function event(name){for(const f of listeners[name]||[])f({type:name});}
flush();const tariff=charts.get('be-tarief-chart');assert.equal(tariff.updates,1);assert.equal(nodes['be-tarief-row'].hidden,false);
intervals[0]();flush();assert.equal(tariff.updates,1,'unchanged historical chart is not rebuilt by the watchdog');
const restoreListeners=[...(listeners.visibilitychange||[])];
vm.runInContext(bidSource.replace('    hydrate();','    window.bidPerformanceTest={setBid,prepareOverlay,plugin,refresh,bids};'),context);
const bid=context.bidPerformanceTest;assert(bid);hideRow=true;bid.refresh();flush();
assert.equal(tariff.updates,2,'BID plugin attaches to the existing chart once');
const importSet=tariff.data.datasets.find(d=>d.beBidDirection==='import'),initialPoints=importSet.data;
bid.refresh();bid.refresh();event('be-tarief-update');flush();assert.equal(tariff.updates,2,'unchanged event bursts do not redraw');
assert.equal(importSet.data,initialPoints,'unchanged BID arrays are reused');
// Three price/settings/BID events and a draw request share a single chart update.
bid.setBid(q-3*Q,{start:q-3*Q,end:q-2*Q,import:{value:.25,observedAt:q-3*Q+30000}});
nodes['be-tarief-data'].textContent=JSON.stringify({...initial,rijen:[{...initial.rijen[0],pi:.4}]});
event('be-tarief-update');event('be-actueel-allin-update');hideRow=true;bid.refresh();
context.BEChartRefresh.request(tariff,'draw');flush();
assert.equal(tariff.updates,3,'one burst means one full tariff update');assert.equal(native.draws,1,'native all-in relabel needs one draw and no update');
assert.equal(importSet.data[1].y,.25*1.21+.02+.1);
const cachedPoints=importSet.data;
// A native viewport change still aligns tariff bounds, while BID points remain cached.
native.scales.x.max=q-Q;plugins.forEach(p=>p.afterUpdate?.(native));flush();
assert.equal(tariff.updates,4);assert.equal(tariff.options.scales.x.max,q-Q);assert.equal(importSet.data,cachedPoints);
// The current quarter endpoint retains its normal moving timestamp.
native.scales.x.min=q;native.scales.x.max=q+Q;
nodes['be-tarief-data'].textContent=JSON.stringify({...initial,rijen:[{start:q,end:q+Q,pi:.4,pe:.2}]});
event('be-tarief-update');flush();assert.equal(tariff.data.datasets[0].data.at(-1).x,now);
const beforeLive=tariff.updates;now+=3000;intervals[0]();flush();assert.equal(tariff.updates,beforeLive+1);assert.equal(tariff.data.datasets[0].data.at(-1).x,now);
// Hidden tabs retain pending work and use the newest source on resume.
document.hidden=true;nodes['be-tarief-data'].textContent=JSON.stringify({...initial,rijen:[{start:q,end:q+Q,pi:.55,pe:.2}]});
event('be-tarief-update');assert.equal(frames.length,0);const hiddenUpdates=tariff.updates;
document.hidden=false;restoreListeners.forEach(f=>f());flush();assert.equal(tariff.updates,hiddenUpdates+1);assert.equal(tariff.data.datasets[0].data.at(-1).y,.55);
// Disconnected charts are discarded instead of touched after navigation.
const dead={canvas:{isConnected:false},update(){throw Error('destroyed chart updated');}};context.BEChartRefresh.request(dead,'update');flush();
console.log('PASS shared chart refresh: event coalescing, unchanged-data reuse, native axis alignment, moving live endpoint, background resume and navigation.');
