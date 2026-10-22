const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/soc-history-beta.js','utf8');
const linux='Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36';
function setup(ua=linux){
  const context={window:{navigator:{userAgent:ua}},location:{pathname:'/customer/test/history/'}};
  vm.createContext(context);vm.runInContext(source,context);
  return {context,api:context.window.BESocHistory};
}
const {context,api}=setup();
const points=Array.from({length:40000},(_,i)=>({x:1700000000000+i*60000,y:i%100===50?null:50+Math.sin(i/13)*20}));
// Include adjacent nulls, an isolated extremum, and two runs within one pixel.
points[51].y=null;points[52].y=null;points[55].y=99;points[57].y=1;
const extent={min:points[0].x,max:points.at(-1).x};
const chart={canvas:{id:'soc-chart'},chartArea:{width:900},data:{datasets:[]}};
const projected=api.project(chart,points,extent);
assert(projected.length<points.length/3,'dense histories are reduced for rendering');
assert(projected.includes(points[55])&&projected.includes(points[57]),'preserve extrema on either side of a gap');
assert.equal(projected[0],points[0]);assert.equal(projected.at(-1),points.at(-1));
for(let i=0;i<projected.length;i++){
  assert(points.includes(projected[i]),'original sample objects and timestamps are retained');
  if(i)assert(projected[i].x>projected[i-1].x,'chronological order');
}
// Every valid segment must have exactly the same endpoints as the source.
function runs(data){
  const output=[];let run=null;
  for(const p of data){
    if(p.y===null){run=null;continue;}
    if(!run){run=[p.x,p.x];output.push(run);}else run[1]=p.x;
  }
  return output;
}
assert.deepEqual(runs(projected),runs(points),'real gap boundaries must never move or be bridged');
for(const width of [320,900,1920]){
  chart.chartArea.width=width;
  assert.deepEqual(runs(api.project(chart,points,extent)),runs(points),'gap boundaries survive resize');
}
assert.equal(api.project(chart,points.slice(0,20),extent).length,20);
assert.equal(api.project(chart,points,null),points);
assert.equal(api.project(chart,points,{min:1,max:1}),points);

const nativeData=[{x:1,y:20},{x:100,y:30}],ownData=[{x:1,y:50},{x:50,y:null},{x:100,y:60}];
const native={data:[{x:25,y:20},{x:75,y:30}],_data:nativeData};
const own={beOwnSOC:'measured',_data:ownData,_decimated:[ownData[0],ownData[2]]};
Object.defineProperty(own,'data',{configurable:true,enumerable:true,get(){return this._decimated;},set(value){this._data=value;}});
const controllers=[{supportsDecimation:true},{supportsDecimation:true}];
const options={scales:{x:{}},plugins:{decimation:{enabled:true,algorithm:'lttb'}}};
Object.assign(chart,{data:{datasets:[native,own]},config:{options},getDatasetMeta:i=>({controller:controllers[i]})});
const nativeSnapshot=JSON.stringify(native),optionsSnapshot=JSON.stringify(options);
assert.deepEqual({...api.range(chart)},{min:1,max:100},'range uses undecimated native input');
api.plugin.beforeElementsUpdate(chart);
assert.equal(own.data,ownData,'restore own original input before Chart.js builds elements');
assert(!('_data' in own)&&!('_decimated' in own));
assert.equal(Object.getOwnPropertyDescriptor(own,'data').writable,true);
assert.equal(controllers[1].supportsDecimation,false);
assert.equal(controllers[0].supportsDecimation,true);
assert.equal(JSON.stringify(native),nativeSnapshot,'native SOC remains untouched');
assert.equal(JSON.stringify(options),optionsSnapshot,'global decimation remains untouched');
assert.equal(own.spanGaps,false);assert.equal(own.stepped,false);assert.equal(own.tension,0);
const refreshed=[{x:1,y:10},{x:100,y:90}];own.data=refreshed;
api.plugin.beforeElementsUpdate(chart);assert.equal(own.data,refreshed,'refresh keeps the new data');
context.location.pathname='/customer/test/';api.plugin.beforeElementsUpdate(chart);
assert.equal(controllers[1].supportsDecimation,true,'restore controller when leaving history');
assert.equal(api.project(chart,points,extent),points,'Actueel remains untouched');
context.location.pathname='/customer/test/forecast/';assert.equal(api.project(chart,points,extent),points);

for(const ua of [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36'
]){
  const other=setup(ua).api;
  assert.equal(other.project(chart,points,extent),points,'other platforms keep their exact input');
  const before=JSON.stringify(chart.data),supports=controllers.map(c=>c.supportsDecimation);
  other.plugin.beforeElementsUpdate(chart);
  assert.equal(JSON.stringify(chart.data),before);
  assert.deepEqual(controllers.map(c=>c.supportsDecimation),supports);
}
// Every platform needs independent time sampling for the native and own line.
for(const ua of [linux,'Macintosh Version/18.0 Safari/605.1.15','iPhone Version/18.0 Mobile/15E148 Safari/604.1']){
  const {api:other,context:ctx}=setup(ua);
  const config={options:{normalized:true}},scales={x:{axis:'x',_normalized:true},y:{axis:'y',_normalized:true}};
  const chart={canvas:{id:'soc-chart'},config,scales};
  other.plugin.beforeUpdate(chart);
  assert.equal(config.options.normalized,false);
  assert.equal(scales.x._normalized,false,'first render also uses independent time sampling');
  assert.equal(scales.y._normalized,true,'no changes to vertical scale');
  for(const path of ['/customer/test/','/customer/test/forecast/']){
    ctx.location.pathname=path;config.options.normalized=true;scales.x._normalized=true;
    other.plugin.beforeUpdate(chart);assert.equal(config.options.normalized,true);assert.equal(scales.x._normalized,true);
  }
  ctx.location.pathname='/customer/test/history/';chart.canvas.id='battery-chart';
  other.plugin.beforeUpdate(chart);assert.equal(config.options.normalized,true,'other charts stay untouched');
}
console.log('PASS history: Linux Chromium reduction preserves timestamps, extrema and exact gaps; native decimation isolation; all platforms keep independent time sampling; other pages/charts unchanged.');
