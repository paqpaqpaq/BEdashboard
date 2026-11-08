const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',epex=fs.readFileSync(root+'src/epex.js','utf8'),soc=fs.readFileSync(root+'src/coulomb-beta.js','utf8');
const T=Date.parse('2026-11-06T00:00:00Z'),Q=900000,swatch={style:{setProperty(k,v){this[k]=v;}}};
const c={window:{},Intl,Date,document:{documentElement:{getAttribute:()=>null},getElementById:()=>swatch}};
vm.createContext(c);
const a=soc.indexOf("(function(root){\n  'use strict';\n  const clamp=");
vm.runInContext(soc.slice(a,soc.indexOf('\n(function(root){',soc.indexOf('root.BESOCExtras=',a))),c);
c.data={forecastEnabled:true,allin:true,btw:1.21,opslag:.02,eb:.11085,planPrice:{allin:false,rates:{2026:.09161}},
 forecastRows:Array.from({length:8},(_,i)=>({start:T+i*Q,end:T+(i+1)*Q,price:(i-2)/10}))};
vm.runInContext('const forecastPaints=new WeakMap();'+epex.match(/^    const dayClock=.*$/m)[0]+'\n'+epex.slice(epex.indexOf('    function forecastSlots(c){'),epex.indexOf('    function install(force=false){')),c);
const chart={canvas:{id:'soc-forecast-chart'},ctx:{createLinearGradient(){return {stops:[],addColorStop(at,color){this.stops.push([at,color]);}};}},
 config:{options:{scales:{y:{min:0,max:100}},plugins:{annotation:{annotations:{dayAheadImport:{borderColor:'rgba(142,197,235,0.25)'}}}}}},
 data:{labels:Array.from({length:3},(_,i)=>new Date(T+i*3600000).toISOString()),datasets:[{label:'SOC p50',data:[20,30,40]}]},
 $beEpexForecastSlots:Array.from({length:3},(_,i)=>({t:T+i*3600000,dt:3600000}))};
c.forecast(chart);let line=chart.data.datasets.find(d=>d.beEpexForecast);
assert.equal(line.borderWidth,1);assert.equal(line.stepped,false);assert.equal(line.cubicInterpolationMode,'monotone');
assert.deepEqual(Array.from(line.data.slice(0,4),p=>p.x),[0,.25,.5,.75],'quarter samples retain fractional positions on an hourly grid');
assert.equal(line.data.at(-1).x,2,'last known quarter is closed at its own end');
assert.equal(line.data[0].y,-.2+.02/1.21,'Financieel ex retains the fee without EB and VAT');
assert.equal(line.label,'EPEX · excl. EB/btw');assert.equal(chart.config.options.scales.y.max,100);
assert.equal(chart.config.options.scales.beEpex.display,false);assert.equal(chart.config.options.scales.beEpex.ticks.display,false);
assert.equal(chart.config.options.scales.beEpex.title.display,false);assert.equal(chart.config.options.scales.beEpex.grid.display,false);
assert.equal(line.beEpexForecastColor,'rgb(156,204,237)');
assert.deepEqual(line.borderColor.stops,[[0,'rgb(156,204,237)'],[1,'rgb(156,204,237)']],'lighter paint stays fully opaque');
assert.equal(swatch.style['--be-epex-forecast-color'],line.beEpexForecastColor);
c.data.allin=false;c.data.planPrice.allin=true;c.forecast(chart);
assert.equal(chart.$beEpexForecastRows[0].value,(-.2+.09161)*1.21+.02);
assert.equal(line.label,'EPEX · all-in');
c.data.forecastRows=c.data.forecastRows.filter((_,i)=>i!==2);c.forecast(chart);
assert(line.data.some(p=>p.y===null),'missing quarter separates the smooth line');
assert(line.data.some(p=>p.x===.5&&p.y!==null),'one-quarter segment ends before a gap');
assert(!chart.$beEpexForecastRows.some(r=>r.start===T+2*Q),'no invented quote in the gap');
c.data.planPrice.rates[2026]=null;c.forecast(chart);
assert.equal(chart.$beEpexForecastRows.length,0,'a missing annual EB rate leaves a gap in all-in mode');
c.data.planPrice.rates[2026]=.09161;
c.data.forecastEnabled=false;c.forecast(chart);assert(!chart.data.datasets.some(d=>d.beEpexForecast));
c.data.forecastEnabled=true;chart.data.labels=chart.data.labels.map(t=>new Date(Date.parse(t)+3600000).toISOString());c.forecast(chart);
assert(!chart.data.datasets.some(d=>d.beEpexForecast),'mismatched native timestamps never display shifted prices');
console.log('PASS forecast EPEX: exact quarter grid, smooth thin opaque light-blue line, invisible price axis, gaps, all-in, toggling and time alignment.');
