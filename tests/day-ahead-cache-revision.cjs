const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../';
const dashboard=fs.readFileSync(root+'src/dashboard.js','utf8');
const cacheSource=fs.readFileSync(root+'src/current-tariff-cache.js','utf8');
const financial=fs.readFileSync(root+'src/financial-beta.js','utf8');
const Q=900000,base=Date.parse('2026-11-02T00:00:00');
let now=base+12*3600000+300000;
class Clock extends Date{static now(){return now;}}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
const day=iso(new Date(base));
function setup(){
  const store=new Map();let days={};
  const c={Date:Clock,window:{addEventListener(){}},setTimeout(){},clearTimeout(){},
    localStorage:{get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    KLANT:'installation-test',beLokalePrijsHistorie:{},actueelAan:false,BTW:1.21,OPSLAG:.02,
    iso,voorlopigeSessie:'revision-test',
    leesVoorlopigeDagen:()=>structuredClone(days),schrijfVoorlopigeDagen:v=>{days=structuredClone(v);},
    beOvFinite:v=>typeof v==='number'&&Number.isFinite(v)};
  vm.createContext(c);vm.runInContext(cacheSource,c);
  vm.runInContext(dashboard.slice(dashboard.indexOf('  function voorlopigeDagGrenzen('),dashboard.indexOf('  // Duurzaam bronarchief;')),c);
  vm.runInContext(dashboard.slice(dashboard.indexOf('  function beVoegPrijzenSamen('),dashboard.indexOf('  async function beVerwerkBron(')),c);
  vm.runInContext(dashboard.slice(dashboard.indexOf('  function bewaarVoorlopigeDag('),dashboard.indexOf('  function voorlopigeDagenVoorMaand(')),c);
  const calc=dashboard.indexOf('  function actueelProjectieBereken(');
  vm.runInContext(dashboard.slice(calc,dashboard.indexOf('\n  function ',calc+5)),c);
  vm.runInContext(financial.slice(financial.indexOf('  function beOvMergeRows('),financial.indexOf('  function beOvForecast(')),c);
  return {c,api:c.window.BECurrentTariffCache,days:()=>structuredClone(days)};
}
function row(start,values={},state='none'){
  return {start,end:start+Q,dayAheadState:state,provisional:true,directions:[],
    values:{onbalans_import:.3,onbalans_export:.2,...values}};
}
function payload(prices=[],plans=[],unknown=[]){
  return {prices,dayAheadPlans:plans,dayAheadUnavailableWindows:unknown,afrrEventIsps:[],
    afrrDiscovery:prices.map(r=>({start:r.start,directions:[],complete:true}))};
}
function merge(e,old,p){return e.c.beVoegPrijzenSamen(old,p?.prices,p?.afrrEventIsps,p?.afrrDiscovery,p);}
function plan(start){return {start,end:start+Q,direction:'import'};}
function pricedResult(e,rows,count=2){
  const points=Array.from({length:count*3+1},(_,i)=>({x:base+i*300000,y:4000}));
  return e.c.actueelProjectieBereken(points,rows.map(e.c.actueelPrijsRij),base,base+count*Q,now);
}
function financialRows(e,source=[]){return e.c.beOvMergeRows(source,e.days(),'installation-test',day,day,now);}

// Explicit unknown windows must cover historical archive rows even when the
// new response omits all price rows. Empty plan lists do not erase other history.
let e=setup(),past=base+2*Q,other=base+3*Q;
let old=[row(past),row(other,{day_ahead_import:.12},'planned')];
const response=payload([],[],[[past,past+Q]]),before=JSON.stringify(response);
let merged=merge(e,old,response);
assert.equal(merged.find(r=>r.start===past).dayAheadState,'unavailable');
assert.equal(e.c.actueelPrijsRij(merged.find(r=>r.start===past)).ki,null);
assert.equal(merged.find(r=>r.start===other).dayAheadState,'planned');
assert.equal(e.c.actueelPrijsRij(merged.find(r=>r.start===other)).ki,.12);
assert.equal(JSON.stringify(response),before,'source response is never mutated');
merged=merge(e,old,payload());
assert.equal(merged.find(r=>r.start===other).dayAheadState,'planned','a partial response cannot unplan unrelated archived quarters');
merged=merge(e,[row(past,{day_ahead_import:.11})],payload([],[plan(past)]));
assert.equal(e.c.actueelPrijsRij(merged.find(r=>r.start===past)).ki,.11,'new planning reuses the exact quarter raw values');
assert.equal(merged.find(r=>r.start===past).values.onbalans_import,.3,'planning updates retain raw source fields');
const current=Math.floor(now/Q)*Q,future=current+Q;
merged=merge(e,[],payload([],[plan(future)],[[current,current+Q]]));
assert.equal(merged.find(r=>r.start===current).dayAheadState,'unavailable');
assert.equal(merged.find(r=>r.start===future).dayAheadState,'planned');

// A current day first has two priced quarters. The first quote is then
// explicitly withdrawn; recomputation must retain the correctly priced second.
e=setup();
old=[row(base,{day_ahead_import:.1},'planned'),row(base+Q,{onbalans_import:.2})];
let result=pricedResult(e,old);
assert(Math.abs(result.importKwh-2)<1e-10);
assert(e.c.bewaarVoorlopigeDag(day,result,base,base+2*Q));
assert(Math.abs(e.days()[day].inkoop-.403)<1e-10);
assert.equal(e.days()[day].prijsHerberekenen,false);
merged=merge(e,old,payload([row(base,{day_ahead_import:null},'planned')],[plan(base)]));
assert(e.days()[day].prijsHerberekenen,'explicit DA null invalidates the old day amount before reuse');
assert.equal(financialRows(e).length,0,'the stale pre-revision amount is temporarily excluded');
result=pricedResult(e,merged);
assert(result.prijsOnvolledig);
assert(Math.abs(result.importKwh-2)<1e-10);
assert(Math.abs(result.geprijsdeImportKwh-1)<1e-10);
assert(Math.abs(result.inkoopEur-.262)<1e-10);
assert(e.c.bewaarVoorlopigeDag(day,result,base,base+2*Q));
assert(Math.abs(e.days()[day].imp-2)<1e-10,'all measured kWh remain stored');
assert(Math.abs(e.days()[day].inkoop-.262)<1e-10,'valid other-quarter amounts survive repricing');
assert.equal(e.days()[day].prijsHerberekenen,false);
let visible=financialRows(e);
assert.equal(visible.length,1);
assert(Math.abs(visible[0].inkoop-.262)<1e-10);
assert(visible[0].deelresultaat);
assert.equal(e.days()[day].prijsBronVersie,1);
const partialBefore=JSON.stringify(e.days());
merged=merge(e,merged,payload([row(base,{day_ahead_import:null},'planned')],[plan(base)]));
assert.equal(JSON.stringify(e.days()),partialBefore,'an already rebuilt partial day is not repeatedly invalidated');

// A legacy partial day can still include a stale amount for the withdrawn
// quarter. The old partial flag alone does not prove it has been repriced.
const legacy=e.days();
delete legacy[day].prijsBronVersie;
legacy[day].inkoop=99;
e.c.schrijfVoorlopigeDagen(legacy);
merged=merge(e,merged,payload([row(base,{day_ahead_import:null},'planned')],[plan(base)]));
assert(e.days()[day].prijsHerberekenen,'a legacy partial day also gets a scoped reprice');
assert.equal(financialRows(e).length,0);
result=pricedResult(e,merged);
assert(e.c.bewaarVoorlopigeDag(day,result,base,base+2*Q));
assert(Math.abs(e.days()[day].inkoop-.262)<1e-10);
assert.equal(e.days()[day].prijsBronVersie,1);

// If explicit planning becomes unavailable for both quarters, keep the raw
// measurements but do not turn unknown import into a zero-euro financial day.
merged=merge(e,merged,payload([],[],[[base,base+2*Q]]));
assert(e.days()[day].prijsHerberekenen);
result=pricedResult(e,merged);
assert.equal(result.stukken,0);assert(result.prijsOnvolledig);
assert(e.c.bewaarVoorlopigeDag(day,result,base,base+2*Q));
assert(Math.abs(e.days()[day].imp-2)<1e-10);
assert.equal(e.days()[day].geprijsdeImportKwh,0);
assert.equal(e.days()[day].prijsHerberekenen,true);
assert.equal(financialRows(e).length,0,'unknown prices do not display as free energy');
const legacyUnknown=e.days();
delete legacyUnknown[day].prijsBronVersie;
Object.assign(legacyUnknown[day],{prijsHerberekenen:false,inkoop:.262,geprijsdeImportKwh:1,gedektMs:Q});
e.c.schrijfVoorlopigeDagen(legacyUnknown);
assert.equal(financialRows(e).length,1);
merged=merge(e,merged,payload([],[],[[base,base+2*Q]]));
assert(e.days()[day].prijsHerberekenen,'an unchanged historical unknown window also invalidates a legacy partial day');
assert.equal(financialRows(e).length,0);
assert(e.c.bewaarVoorlopigeDag(day,pricedResult(e,merged),base,base+2*Q));
const official={key:day,imp:2,exp:0,inkoop:12.34,verkoop:0};
assert.equal(financialRows(e,[official])[0].inkoop,12.34,'official result rows still override all local states');

// A later valid quote permits rebuilding the same measurements. A failed
// request supplies no authoritative planning and must not invalidate that data.
merged=merge(e,merged,payload(old,[plan(base)]));
result=pricedResult(e,merged);
assert(e.c.bewaarVoorlopigeDag(day,result,base,base+2*Q));
assert.equal(e.days()[day].prijsHerberekenen,false);
const retained=JSON.stringify(e.days());
merged=merge(e,merged,null);
assert.equal(JSON.stringify(e.days()),retained,'network failure preserves good provisional cache');
assert(Math.abs(pricedResult(e,merged).inkoopEur-.403)<1e-10);
assert.equal(financialRows(e).length,1);

// A stale provisional response cannot revoke an already final source quote.
old=[{...row(base,{day_ahead_import:.1},'planned'),provisional:false}];
merged=merge(e,old,payload([row(base,{day_ahead_import:null},'planned')],[plan(base)]));
assert.equal(e.c.actueelPrijsRij(merged[0]).ki,.1);
assert.equal(e.days()[day].prijsHerberekenen,false);
console.log('PASS day-ahead cache revision: scoped historical planning, explicit quote withdrawal, partial repricing, unknown-price exclusion, official priority and network preservation.');
