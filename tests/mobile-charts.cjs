const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const root=__dirname+'/../src/';
// Delayed library AND delayed native chart; source events have already fired.
{
 const timers=[],charts=new Map(),nodes={'be-actueel-allin-data':{textContent:JSON.stringify({aan:true})},'be-tarief-data':{textContent:JSON.stringify({aan:true,rijen:[{start:1000,end:2000,pi:.3,pe:.2}]})},'be-tarief-chart':{id:'be-tarief-chart',isConnected:true},'be-tarief-row':{hidden:true}};
 let created=0,registered=0;const c={window:{},document:{getElementById:id=>nodes[id],addEventListener(){}},setTimeout:f=>timers.push(f),setInterval(){},console,Date};vm.createContext(c);
 vm.runInContext(fs.readFileSync(root+'actueel-bridge-beta.js','utf8'),c);assert.equal(timers.length,1);assert(!c.window.__beActueelAllinBridge);
 function Chart(canvas,config){created++;this.canvas=canvas;this.data=config.data;this.options=config.options;this.update=()=>{};charts.set(canvas.id,this);}
 Chart.register=()=>registered++;Chart.getChart=id=>charts.get(typeof id==='string'?id:id.id);c.Chart=Chart;timers.shift()();assert.equal(created,0);assert.equal(timers.length,1);
 charts.set('battery-chart',{ctx:{fillText(){}},options:{scales:{x:{type:'linear',ticks:{}}}},scales:{x:{min:0,max:3000}},canvas:{id:'battery-chart'},update(){},draw(){}});
 timers.shift()();assert(c.window.__beActueelAllinBridge);assert.equal(created,1);assert.equal(registered,1);assert.equal(nodes['be-tarief-row'].hidden,false);assert.equal(charts.get('be-tarief-chart').data.datasets[0].data.length,2);
 console.log('PASS mobile: delayed Chart.js and native chart recover automatically, including initial tariff data emitted before readiness.');
}
// Hidden/zero-size chart -> visible, resized, replaced, page restored. No update loop.
{
 const listeners={},intervals=[],frames=[],canvases=new Map();let observer;
 let width=0,height=0,resizes=0,updates=0;const parent={getBoundingClientRect:()=>({width,height})};
 const canvas={id:'soc-chart',isConnected:true,parentElement:parent,getClientRects:()=>width?[{}]:[]};canvases.set('soc-chart',canvas);
 let chart={width:0,height:0,resize(){resizes++;this.width=width;this.height=height;},update(){updates++;}};
 const document={hidden:false,documentElement:{},getElementById:id=>canvases.get(id),addEventListener:(k,f)=>listeners[k]=f};
 const ctx={document,window:{Chart:{getChart:()=>chart},addEventListener:(k,f)=>listeners[k]=f,visualViewport:{addEventListener(){}}},requestAnimationFrame:f=>frames.push(f),setInterval:f=>intervals.push(f),MutationObserver:class{constructor(f){observer=f;}observe(){}},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},console};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(root+'mobile-chart-recovery-beta.js','utf8'),ctx);const flush=()=>{while(frames.length)frames.shift()();};flush();assert.equal(resizes,0);
 width=360;height=280;intervals[0]();flush();assert.equal(resizes,1);assert.equal(updates,1);intervals[0]();flush();assert.equal(updates,1);
 width=390;listeners.resize();flush();assert.equal(updates,2);
 document.hidden=true;width=400;intervals[0]();flush();assert.equal(updates,2);document.hidden=false;listeners.pageshow();flush();assert.equal(updates,3);
 chart={...chart,width:0,height:0};intervals[0]();flush();assert.equal(updates,4);
 width=0;intervals[0]();flush();width=400;intervals[0]();flush();assert.equal(updates,5);
 observer([{addedNodes:[{nodeType:3}]}]);assert.equal(frames.length,0);
 console.log('PASS mobile: zero-size, reveal, rotate/resize, background/restore and replaced chart recover; no repeated redraws for unchanged size or text mutations.');
}
// EPEX mount must not depend on an out-of-scope variable; retry attaches late/new charts once.
{
 const source=fs.readFileSync(root+'epex-beta.js','utf8'),nodes=new Map(),intervals=[],listeners={};
 function node(){return {style:{},dataset:{},children:[],setAttribute(){},addEventListener(){},append(...v){this.children.push(...v);v.forEach(x=>{if(x.id)nodes.set(x.id,x);});},appendChild(v){this.append(v);},prepend(v){this.append(v);},querySelector(q){return q[0]==='#'?nodes.get(q.slice(1)):node();},remove(){}};}
 const host=node();nodes.set('be-tarief-row',host);const doc={documentElement:node(),body:node(),hidden:false,createElement:node,getElementById:id=>nodes.get(id),addEventListener:(k,f)=>(listeners[k]??=[]).push(f),dispatchEvent(){}};
 const context={window:{addEventListener(){}},document:doc,localStorage:{getItem:()=>null},MutationObserver:class{observe(){}},setInterval:f=>intervals.push(f),setTimeout(){},Event:class{},console};
 assert.doesNotThrow(()=>vm.runInNewContext(source,context));assert(nodes.has('be-epex-switch'));assert(nodes.has('be-epex-legend'));
 const start=source.indexOf('  function chartBridge(){'),end=source.indexOf('\n  const bridge=',start),bridge=source.slice(start,end);
 let chart,registered=0,updated=0;nodes.set('be-epex-addon',{textContent:JSON.stringify({enabled:true,rows:[]})});
 const state={window:{},document:doc,setInterval:f=>intervals.push(f)};vm.createContext(state);vm.runInContext('('+bridge.trim()+')();',state);
 state.Chart={register(){registered++;},getChart:()=>chart};chart={update(){updated++;}};const retry=intervals.at(-1);retry();assert.equal(registered,1);assert.equal(updated,1);retry();assert.equal(updated,1);
 chart={update(){updated++;}};retry();assert.equal(updated,2);listeners['be-epex-data'].at(-1)();assert.equal(updated,3);
 console.log('PASS EPEX: mount succeeds with no D global; late Chart.js and replaced chart attach without navigation or redundant updates.');
}
new vm.Script(fs.readFileSync(root+'../Balansenergie-All-in-v6.0-beta.user.js','utf8'));
