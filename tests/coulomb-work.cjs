const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/coulomb-beta.js','utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const T=Date.now()-60000,rows=[[T,50,100],[T+30000,49,-50]];
let stored={rows:structuredClone(rows),manual:[]},writes=0,calculations=0;
const box={record:{rows:[],manual:[]},recordVersion:0,resultVersion:0,computedVersion:-1,computedSettings:'',pruneAttempt:null,
  result:null,id:'demo',DAY:86400000,settings:()=>({capacity:48.2}),
  core:{valid:r=>Array.isArray(r)&&Number.isFinite(r[0]),calculate:r=>{calculations++;return {points:r.map(v=>({t:v[0],soc:v[1]}))};}},
  db:{transaction(){const tx={abort(){}};let req;const store={get(){req={};queueMicrotask(()=>{req.result=structuredClone(stored);req.onsuccess();queueMicrotask(()=>tx.oncomplete());});return req;},put(value){writes++;stored=structuredClone(value);}};tx.objectStore=()=>store;return tx;}}
};
vm.createContext(box);
vm.runInContext(between('  const sameRows=','  async function request(url){')+between('  function compute(){','  async function poll(){'),box);
(async()=>{
 await box.persist(rows);box.compute();assert.equal(writes,0);assert.equal(calculations,1);
 const initial=box.result;
 await box.persist(structuredClone(rows));box.compute();assert.equal(writes,0);assert.equal(calculations,1);assert.equal(box.result,initial,'identical samples keep the calculated result');
 await box.persist([[T+30000,48,-55]]);box.compute();assert.equal(writes,1);assert.equal(calculations,2);assert.equal(box.record.rows[1][1],48,'a corrected older timestamp is retained');
 stored.rows.push([T+45000,47,80]);await box.persist([]);box.compute();assert.equal(writes,1);assert.equal(calculations,3);assert.equal(box.record.rows.length,3,'another tab’s added observations are adopted without overwriting them');
 await box.persist([],{t:T+45000,soc:55,kind:'handmatig'});box.compute();assert.equal(writes,2);assert.equal(calculations,4);assert.equal(box.record.manual[0].soc,55);
 await box.persist([],{t:T+45000,soc:55,kind:'handmatig'});box.compute();assert.equal(writes,2);assert.equal(calculations,4,'the same manual anchor does not repeat full integration');
 const elements=new Map(),el=()=>({textContent:'',hidden:false,replaceChildren(...items){this.items=items;}}),panel={querySelector:q=>{if(!elements.has(q))elements.set(q,el());return elements.get(q);}};
 let updates=0,registered=0;
 const chart={canvas:{id:'soc-chart'},width:500,height:200,data:{datasets:[{label:'SOC',data:[{x:T,y:50},{x:T+45000,y:47}]},{beOwnSOC:'measured',data:[]}]},scales:{x:{min:T,max:T+45000}},update(){updates++;renderBox.rememberChart(this);}};
 const renderBox={document:{hidden:false,documentElement:{getAttribute:()=>null},getElementById:()=>chart.canvas,createElement:()=>el()},
  window:{Chart:{getChart:v=>v==='soc-forecast-chart'?null:chart}},resultVersion:1,payloadVersion:1,cfg:{},payload:null,forecastFetch:T,
  result:{events:[]},latest:()=>({t:T,soc:50}),ext:{sameForecastDay:()=>true},register:()=>registered++,panel:()=>panel,
  display:()=>({soc:'50%',chemicalContent:'~ 24 kWh',energy:'in 0',state:'actueel',history:'historie'}),textIfChanged:(e,v)=>{if(e.textContent!==v)e.textContent=v;},legend(){},date:String,number:String
 };
 vm.createContext(renderBox);vm.runInContext(between('  const chartVersions=','  function decorate(chart){'),renderBox);
 renderBox.render();assert.equal(updates,1);const eventList=elements.get('[data-events]').items;
 renderBox.render();assert.equal(updates,1,'an unchanged maintenance tick does not update the canvas');assert.equal(elements.get('[data-events]').items,eventList,'an unchanged event list is not rebuilt');
 renderBox.resultVersion++;renderBox.render();assert.equal(updates,2,'new measured data requests one update');
 renderBox.document.hidden=true;renderBox.resultVersion++;renderBox.render();assert.equal(updates,2,'hidden tabs defer own drawing');
 renderBox.document.hidden=false;renderBox.render();assert.equal(updates,3,'returning to the tab draws all queued changes');
 chart.width=350;renderBox.render();assert.equal(updates,4,'resizing invalidates the cached view');
 renderBox.cfg.show_kwh=false;renderBox.render();assert.equal(updates,5,'visibility settings still update the chart');
 chart.data.datasets=chart.data.datasets.filter(d=>!d.beOwnSOC);renderBox.render();assert.equal(updates,6,'native dataset replacement restores the own line');
 console.log('PASS Coulomb work: unchanged samples avoid writes/calculation; corrections, cross-tab updates and anchors survive; unchanged canvas ticks/events are skipped, hidden work resumes, resize/settings/replaced datasets refresh.');
})().catch(error=>{console.error(error);process.exitCode=1;});
