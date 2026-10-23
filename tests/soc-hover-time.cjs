const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box={window:{},Date,console};vm.createContext(box);
vm.runInContext(fs.readFileSync(__dirname+'/../src/soc-hover-beta.js','utf8'),box);
const hover=box.window.BESocHover,T=Date.now()-8*3600000,h=3600000;
const series=[{label:'Originele SOC',color:'#69318d',points:[{x:T,y:20},{x:T+6*h,y:80}]},
 {label:'BE',beOwnSOC:'measured',color:'#0891b2',points:[{x:T,y:25},{x:T+2*h,y:35},{x:T+4*h,y:45},{x:T+6*h,y:55}]}];
const metas=series.map(d=>({type:'line',yAxisID:'y',data:d.points.map(()=>({})),_parsed:d.points,dataset:{options:{borderWidth:2,borderColor:d.color}}}));
const chart={canvas:{id:'soc-chart'},scales:{x:{type:'time',getValueForPixel:x=>T+x*h,getPixelForValue:x=>(x-T)/h},y:{getPixelForValue:y=>100-y}},data:{datasets:series},getDatasetMeta:i=>metas[i],isDatasetVisible:()=>true};
for(const position of [0,1,2.5,3,4.5,6]){
 const info=hover.info(chart,{x:position});assert.equal(info.x,T+position*h);assert.equal(info.px,position);
 assert(Math.abs(info.rows[0].value-(20+10*position))<1e-8);
 assert(Math.abs(info.rows[1].value-(25+5*position))<1e-8);
}
assert.equal(hover.info(chart,{x:6.1}).rows[0].value,null);
metas[1].data[2].stop=true;assert.equal(hover.info(chart,{x:3}).rows[1].value,null);
assert.equal(hover.info(chart,{x:3}).rows[0].value,50);
chart.isDatasetVisible=i=>i===0;assert.equal(hover.info(chart,{x:3}).rows.length,1);
assert.equal(hover.plugin.beforeEvent({canvas:{}},{event:{type:'mousemove'}}),undefined);
// Native index-mode markers are suppressed; our markers share one screen x.
const nodes=[],events={};let active=[{}],draws=0;
function node(){return {style:{},setAttribute(){},append(...n){this.children=n;},replaceChildren(...n){this.children=n;},getBoundingClientRect(){return {width:220,height:100};},remove(){}};}
box.document={createElement:node,body:{append(...n){nodes.push(...n);}},documentElement:{clientWidth:800,clientHeight:600}};
box.window.innerWidth=800;box.window.innerHeight=600;box.window.addEventListener=box.window.removeEventListener=()=>{};
chart.width=600;chart.height=200;chart.chartArea={left:0,right:600,top:0,bottom:200};
chart.canvas.getBoundingClientRect=()=>({left:0,top:0,width:600,height:200});chart.canvas.addEventListener=(type,fn)=>events[type]=fn;chart.canvas.removeEventListener=()=>{};
chart.scales.x.getValueForPixel=x=>T+x/100*h;chart.scales.x.getPixelForValue=x=>(x-T)/h*100;
chart.getActiveElements=()=>active;chart.setActiveElements=v=>{active=v;};chart.draw=()=>draws++;chart.tooltip={options:{enabled:true}};
chart.isDatasetVisible=()=>true;metas[1].data[2].stop=false;
hover.attach(chart,{capacity:48.2});events.mousemove({clientX:300,clientY:100});
assert.equal(active.length,0);assert.equal(draws,1);assert.equal(nodes[2].children.length,2);
assert(nodes[2].children.every(n=>n.style.cssText.includes('left:300px')));
assert.equal(nodes[0].children[1].children[2].textContent,'≈ 50% · 24,1 kWh');
assert.equal(nodes[0].children[2].children[2].textContent,'≈ 40% · 19,3 kWh');
assert.equal(hover.info(chart,{x:300}).rows[0].energyKwh,24.1);
assert(Math.abs(hover.info(chart,{x:300}).rows[1].energyKwh-19.28)<1e-10);
assert(nodes[0].children[2].children[2].style.cssText.includes('--be-soc-tooltip-series:var(--be-coulomb-line'));
assert.equal(hover.plugin.beforeEvent(chart,{event:{type:'mousemove'}}),false);
assert.equal(hover.plugin.beforeEvent(chart,{event:{type:'click'}}),undefined);
events.mouseleave();assert.equal(nodes[0].style.display,'none');assert.equal(nodes[2].style.display,'none');assert.equal(chart.tooltip.options.enabled,true);
hover.attach(chart,{capacity:60});assert.equal(hover.info(chart,{x:300}).rows[0].energyKwh,30);
hover.attach(chart,{capacity:NaN});assert.equal(hover.info(chart,{x:300}).rows[0].energyKwh,null);
hover.attach(chart,{capacity:48.2});
metas[1].data[2].stop=true;assert.equal(hover.info(chart,{x:300}).rows[1].energyKwh,null);metas[1].data[2].stop=false;
box.window.BETheme={isDark:()=>true,color:()=> '#a879ff'};
assert.equal(hover.info(chart,{x:300}).rows[0].color,'#a879ff','native tooltip uses the rendered dark-mode line colour');
delete box.window.BETheme;
box.document.createElement=()=>{throw Error('simulated DOM failure');};const warn=console.warn;console.warn=()=>{};
try{assert.doesNotThrow(()=>events.mousemove({clientX:300,clientY:100}));}finally{console.warn=warn;}
assert.equal(nodes[2].style.display,'none');
console.log('PASS SOC hover: shared timestamps and gaps, kWh from unrounded interpolation, one decimal, changed/missing capacity, matching line colours and mobile wrapping.');
