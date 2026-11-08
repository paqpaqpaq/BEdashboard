const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/soc-hover-beta.js','utf8');
const nodes=[],events={};
function element(){return {style:{},setAttribute(){},append(...n){this.children=n;},replaceChildren(...n){this.children=n;},getBoundingClientRect:()=>({width:200,height:90}),remove(){}};}
const box={Date,console,document:{createElement:element,body:{append(...n){nodes.push(...n);}},documentElement:{clientWidth:800,clientHeight:600}},
 window:{innerWidth:800,innerHeight:600,addEventListener(){},removeEventListener(){},BEMeasuredVoltage:{energyKwh:(soc,capacity)=>Number.isFinite(soc)?soc/100*capacity:null}}};
vm.createContext(box);vm.runInContext(source,box);
const hover=box.window.BESocHover,T=Date.parse('2026-11-06T11:00:00Z'),Q=900000;
const datasets=[{label:'SOC p50',data:[20,60],borderWidth:2},{label:'EPEX · all-in',beEpexForecast:true,yAxisID:'yEpex',data:[],borderWidth:1.5}];
const metas=[{type:'line',yAxisID:'y',data:[{},{}],_parsed:[{x:0,y:20},{x:1,y:60}],dataset:{options:{borderColor:'#69318d',borderWidth:2}}},
 {type:'line',yAxisID:'yEpex',data:[],_parsed:[],dataset:{options:{borderColor:'#e0a62b',borderWidth:1.5}}}];
let showPrice=true;
const chart={canvas:{id:'soc-forecast-chart',getBoundingClientRect:()=>({left:0,top:0,width:100,height:200}),addEventListener:(n,f)=>events[n]=f,removeEventListener(){}},
 width:100,height:200,chartArea:{left:0,right:100,top:0,bottom:200},data:{labels:['12:00','13:00'],datasets},
 scales:{x:{type:'category',getValueForPixel:x=>Math.round(x/100),getPixelForValue:x=>x*100,getLabelForValue:x=>chart.data.labels[x]},y:{getPixelForValue:y=>200-y},yEpex:{getPixelForValue:y=>100-y*100}},
 getDatasetMeta:i=>metas[i],isDatasetVisible:i=>i===0||showPrice,
 $beEpexForecastSlots:[{t:T,dt:3600000},{t:T+3600000,dt:3600000}],
 $beEpexForecastPlans:[
   {start:T+Q,end:T+2*Q,direction:'import',quantityW:5956},
   {start:T+2*Q,end:T+3*Q,direction:'export',quantityW:5000}
 ],
 $beEpexForecastRows:[.1,.2,null,-.05].map((value,i)=>({start:T+i*Q,end:T+(i+1)*Q,price:.01,value}))};
hover.attach(chart,{capacity:40,times:[new Date(T).toISOString(),new Date(T+3600000).toISOString()]});
let info=hover.info(chart,{x:26});
assert.equal(info.time,T+Q);assert.equal(info.x,.25);assert.equal(info.px,25);
assert.equal(info.rows[0].value,30,'SOC interpolates at the same quarter');
assert.equal(info.rows[0].energyKwh,12);
assert.equal(info.rows[1].value,.2,'the exact display price wins over raw price and duplicate plotted endpoints');
assert.equal(info.rows[1].unit,'eur-kwh');assert.equal(info.rows[1].energyKwh,null);assert.equal(info.rows[1].approx,false);
assert(info.title.includes('12:15–12:30'));
assert.equal(info.rows[2].label,'Geplande EPEX-import');
assert.equal(info.rows[2].value,5.956);
assert.equal(info.rows[2].py,null,'planned power has no SOC or price marker');
assert.equal(hover.info(chart,{x:50}).rows[1].value,null,'missing quarter cannot carry the previous bid/price');
assert.equal(hover.info(chart,{x:50}).rows[2].label,'Geplande EPEX-export');
assert.equal(hover.info(chart,{x:50}).rows[2].value,5,'planned power is available without an EPEX quote');
assert.equal(hover.info(chart,{x:99}).rows.length,2,'an unplanned quarter has no planned power row');
assert.equal(hover.info(chart,{x:99}).rows[1].value,-.05,'negative EPEX is preserved');
assert.equal(hover.info(chart,{x:100}).rows[1].value,null,'price does not carry into a new hour');
events.mousemove({clientX:26,clientY:80});
assert.equal(nodes[0].children[2].children[2].textContent,'€ 0,200/kWh');
assert.equal(nodes[0].children[3].children[2].textContent,'5,956 kW');
assert(!nodes[0].children[2].children[2].textContent.includes('%'));
assert.equal(nodes[0].children[1].children[2].textContent,'≈ 30% · ~ 12,0 kWh');
showPrice=false;info=hover.info(chart,{x:26});assert.equal(info.x,0);assert.equal(info.rows.length,1,'hidden EPEX restores the original category hover');
showPrice=true;delete chart.$beEpexForecastSlots;info=hover.info(chart,{x:26});assert.equal(info.x,0);assert.equal(info.rows[1].value,null,'missing validated times cannot guess a price');
console.log('PASS forecast EPEX hover: quarter precision on hourly categories, exact quote selection, same-time SOC, planned kW, missing/negative values, EUR display and unchanged native mode.');
