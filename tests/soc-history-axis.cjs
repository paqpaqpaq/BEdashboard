// Render regression with Chart.js and @napi-rs/canvas; module paths may be
// supplied through BE_CHART_JS and BE_CANVAS_MODULE without shipping test deps.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createCanvas,Path2D}=require(process.env.BE_CANVAS_MODULE||'@napi-rs/canvas');
global.Path2D=Path2D;
const Chart=require(process.env.BE_CHART_JS||'chart.js/auto');
const root=__dirname+'/../',source=fs.readFileSync(root+'src/coulomb-beta.js','utf8');
const history=fs.readFileSync(root+'src/soc-history-beta.js','utf8');
const units={millisecond:1,second:1000,minute:60000,hour:3600000,day:86400000,week:604800000,month:2592000000,year:31536000000};
Chart._adapters._date.override({
  formats:()=>({datetime:'HH:mm',hour:'HH:mm',day:'date'}),
  parse:v=>typeof v==='number'?v:Date.parse(v),format:v=>new Date(v).toISOString().slice(11,16),
  add:(v,n,u)=>v+n*(units[u]||1),diff:(a,b,u)=>(a-b)/(units[u]||1),
  startOf:(v,u)=>Math.floor(v/(units[u]||1))*(units[u]||1),
  endOf:(v,u)=>Math.ceil((v+1)/(units[u]||1))*(units[u]||1)-1
});
const start=Date.parse('2026-10-20T00:00:00Z'),minute=60000;
const userAgents={
  ubuntu:'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36',
  mac:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36',
  safari:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15',
  iphone:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
  firefox:'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  windows:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36'
};
const dataset=source.slice(source.indexOf('  function dataset('),source.indexOf('  function forecastValues('));
const decorate=source.slice(source.indexOf('  function decorate('),source.indexOf('  function attachPastColors('));
function fixture(ua,type='time',width=1000){
  const c={window:{navigator:{userAgent:ua}},location:{pathname:'/customer/demo/history/'},cfg:{},
    result:{points:[]},visualSoc:p=>p.soc,followsOriginal:()=>false,applyVisibility:()=>{},filterNativeLegend:()=>{}};
  vm.createContext(c);vm.runInContext(history+dataset+decorate,c);
  const canvas=createCanvas(width,300);canvas.id='soc-chart';
  const native={label:'SOC',borderColor:'#6b3f8d',pointRadius:0,data:Array.from({length:1440},(_,i)=>({x:start+i*minute,y:50}))};
  const chart=new Chart(canvas,{type:'line',platform:Chart.BasicPlatform,plugins:[],data:{datasets:[native]},
    options:{animation:false,responsive:false,parsing:false,normalized:true,plugins:{legend:{display:false}},
      scales:{x:{type,time:{unit:'hour'},ticks:{source:'data',autoSkip:false,maxRotation:0}},y:{min:0,max:100}}}});
  const ticks=()=>chart.scales.x.ticks.map(t=>({value:t.value,label:t.label}));
  const expected=ticks(),bounds=[chart.scales.x.min,chart.scales.x.max],snapshot=JSON.stringify(native);
  chart.config.plugins.push(c.window.BESocHistory.plugin,{id:'own',beforeUpdate:c.decorate});
  function update(points){
    c.result.points=points;chart.update('none');
    assert.deepEqual(ticks(),expected,'native time labels must survive partial/empty Coulomb history');
    assert.deepEqual([chart.scales.x.min,chart.scales.x.max],bounds,'native day extent is preserved');
    assert.equal(JSON.stringify(native),snapshot,'native data are unchanged');
    const meta=chart.getDatasetMeta(0);
    assert(meta.data[0].x>=chart.chartArea.left&&meta.data.at(-1).x<=chart.chartArea.right,'full native day still renders');
  }
  return {c,chart,canvas,update};
}
for(const [platform,ua] of Object.entries(userAgents))for(const type of ['time','timeseries']){
  const f=fixture(ua,type);
  const partial=Array.from({length:812},(_,i)=>({t:start+(628+i)*minute,soc:10+i*.05}));
  f.update(partial);f.update(partial);f.update([]);
  f.update([{t:start+628*minute,soc:10}]);
  f.update(Array.from({length:1440},(_,i)=>({t:start+i*minute,soc:i<=628?72.8-i*.1:10+(i-628)*.05,anchor:i===628?{soc:10}:null})));
  f.chart.setDatasetVisibility(1,false);f.chart.update('none');f.chart.setDatasetVisibility(1,true);f.update(partial);
  f.chart.destroy();
  console.log('PASS full day time labels:',platform,type,'partial/empty/single/full history, 10% anchor, refresh and toggle');
}
// Real gaps in a complete day remain gaps; the 10% anchor itself never hides
// the morning. Verify the pixels of the actual Coulomb line on a phone width.
const f=fixture(userAgents.ubuntu,'time',375);
const coreBox={window:{}};vm.createContext(coreBox);vm.runInContext(source.slice(0,source.indexOf('\n(function(root){',100)),coreBox);
const rows=Array.from({length:5760},(_,i)=>{const m=i/4;return [start+i*15000,m<=628?10+(628-m)/10:10+(m-628)/10,m<=628?600:-600];});
const result=coreBox.window.BEEnergySOC.calculate(rows,{capacity:10});
assert(result.points.find(p=>p.t===start+628*minute).anchor,'test includes the actual 10% re-anchor');
f.update(result.points);
const own=f.chart.data.datasets.find(d=>d.beOwnSOC),meta=f.chart.getDatasetMeta(f.chart.data.datasets.indexOf(own));
assert.equal(own.data[0].x,start);assert.equal(meta.dataset.segments.length,1);
const pixels=f.canvas.getContext('2d').getImageData(0,0,375,300).data;
const x0=Math.ceil(f.chart.scales.x.getPixelForValue(start+60*minute)),x1=Math.floor(f.chart.scales.x.getPixelForValue(start+600*minute));
let visible=0;for(let x=x0;x<x1;x++){for(let y=0;y<270;y++){const k=(y*375+x)*4;if(pixels[k]<30&&pixels[k+1]>70&&pixels[k+2]>100&&pixels[k+3]>80){visible++;break;}}}
assert(visible>(x1-x0)*.9,'morning Coulomb pixels must render before the 10:28 re-anchor');
f.chart.destroy();
console.log('PASS real 10% calculation and narrow canvas: morning Coulomb line renders continuously.');
