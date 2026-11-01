const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',source=fs.readFileSync(root+'src/dashboard.js','utf8');
const cacheSource=fs.readFileSync(root+'src/current-tariff-cache.js','utf8');
const financial=fs.readFileSync(root+'src/financial-beta.js','utf8');
const start=Date.parse('2026-11-01T09:00:00Z'),end=start+900000,now=start+300000;
class Clock extends Date{static now(){return now;}}
function setup(store=new Map()){
 const c={Date:Clock,window:{addEventListener(){}},setTimeout(){},clearTimeout(){},
  localStorage:{get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  KLANT:'test',beLokalePrijsHistorie:{},actueelAan:false,BTW:1.21,OPSLAG:.02};
 vm.createContext(c);vm.runInContext(cacheSource,c);
 vm.runInContext(source.slice(source.indexOf('  function beVoegPrijzenSamen('),source.indexOf('  async function beVerwerkBron(')),c);
 vm.runInContext(source.slice(source.indexOf('  function beOverbrugPrijzen('),source.indexOf('  function beOntvangLivePrijzen(')),c);
 const a=source.indexOf('  function actueelProjectieBereken('),b=source.indexOf('\n  function ',a+5);
 vm.runInContext(source.slice(a,b),c);
 return {c,api:c.window.BECurrentTariffCache,store};
}
let e=setup();
function payload({planned=true,mixed=false,unknown=false,values={},plans}={}){
 return {prices:[{start,end,provisional:true,values:{onbalans_import:.9,onbalans_export:.2,afrr_import:.7,afrr_export:.8,day_ahead_import:.1,day_ahead_afrr_import:.43,...values}}],
  dayAheadPlans:plans||(planned?[{start,end,direction:'import'}]:[]),dayAheadUnavailableWindows:unknown?[[start,end]]:[],
  afrrEventIsps:mixed?[start]:[],afrrDiscovery:[{start,directions:mixed?['import']:[]}]};
}
function rows(p,old=[]){return e.c.beVoegPrijzenSamen(old,p.prices,p.afrrEventIsps,p.afrrDiscovery,p);}
function quote(p){return e.c.actueelPrijsRij(rows(p)[0]);}
let p=payload(),before=JSON.stringify(p),q=quote(p);
assert.equal(q.ki,.1);assert.equal(q.ke,.2);assert.equal(q.marktImport,'Dynamisch');
assert.equal(JSON.stringify(p),before,'API response stays unchanged');
assert.equal(quote(payload({planned:false})).ki,.9,'a quote alone never selects day-ahead');
assert.equal(quote(payload({plans:[{start,end:end+1,direction:'import'}]})).ki,.9,'only exact import quarters select planning');
assert.equal(quote(payload({plans:[{start,end,direction:'export'}]})).ki,.9,'export plans do not reprice import');
q=quote(payload({mixed:true}));assert.equal(q.ki,.43,'use the API mix value, never calculate a new average');assert(q.gemengdImport);
assert.equal(q.ke,.2,'aFRR import leaves the export market independent');
q=quote(payload({mixed:true,values:{day_ahead_afrr_import:null}}));assert.equal(q.ki,null,'missing mix never falls back to ordinary aFRR or day-ahead');
q=quote(payload({unknown:true,planned:false}));assert.equal(q.ki,null);assert.equal(q.ke,.2);assert.equal(q.marktImport,'Prijsbron onbekend');
assert.equal(quote(payload({values:{day_ahead_import:0}})).ki,0);
assert.equal(quote(payload({values:{day_ahead_import:-.1}})).ki,-.1);
let stored=rows(payload());
assert.equal(e.c.actueelPrijsRij(e.c.beVoegPrijzenSamen(stored,stored)[0]).ki,.1,'archive hydration retains the planning context');
q=e.c.actueelPrijsRij(e.api.preparePrices(payload().prices)[0]);assert.equal(q.ki,null,'legacy dynamic quotes without planning context stay unknown');
q=e.c.actueelPrijsRij(e.c.beVoegPrijzenSamen(payload().prices,[])[0]);assert.equal(q.ki,null,'older archived rows are normalized before hydration');
const missing=payload();missing.prices=[];
assert.equal(rows(missing)[0].dayAheadState,'planned','planning without a price row still prevents bridging');
assert.equal(e.c.actueelPrijsRij(rows(missing)[0]).ki,undefined);
const previous={start:start-900000,end:start,values:{onbalans_import:.9,onbalans_export:.2},dayAheadState:'none'};
stored=rows(payload({values:{day_ahead_import:null}}));
assert.equal(e.c.beOverbrugPrijzen([previous,...stored],now).find(r=>r.start===start).dayAheadState,'planned');
e.api.remember('test',payload({planned:false}));assert(e.api.get('test',start).samples.length);
e.api.remember('test',payload());assert.equal(e.api.get('test',start).samples.length,0);
assert.equal(e.api.get('test',start).quotes.onbalans_import,undefined,'old cached imbalance imports cannot leak into planning');
e=setup(e.store);q=e.c.actueelPrijsRij(e.api.restore('test',[])[0]);assert.equal(q.ki,undefined);assert.equal(q.ke,.2,'reload keeps valid export and unknown planned import separate');
e=setup();
const points=[0,300000,600000,900000].map(t=>({x:start+t,y:4000}));
function result(p){return e.c.actueelProjectieBereken(points,rows(p).map(e.c.actueelPrijsRij),start,end,end);}
let r=result(payload());assert(Math.abs(r.importKwh-1)<1e-10);assert(Math.abs(r.inkoopEur-.141)<1e-10);
r=result(payload({mixed:true}));assert(Math.abs(r.inkoopEur-.5403)<1e-10);
r=result(payload({unknown:true,planned:false}));assert(r.prijsOnvolledig);assert.equal(r.geprijsdeImportKwh,0);assert.equal(r.inkoopEur,0);
// Financial source rows always override the local estimate for the same day.
Object.assign(e.c,{iso:d=>d.toISOString().slice(0,10),voorlopigeDagGrenzen:()=>({start:start-3600000,eind:start+23*3600000}),beOvFinite:v=>typeof v==='number'&&Number.isFinite(v)});
vm.runInContext(financial.slice(financial.indexOf('  function beOvMergeRows('),financial.indexOf('  function beOvForecast(')),e.c);
const key='2026-11-01',official={key,inkoop:12.34,verkoop:4.56,imp:2,exp:1};
assert.equal(e.c.beOvMergeRows([official],{[key]:{prijsHerberekenen:true}},'test',key,key,now)[0].inkoop,12.34);
const outdated={key,klant:'test',archiefVersie:1,voorlopig:true,prijsHerberekenen:true,imp:1,exp:0,inkoop:99,verkoop:0,gemetenVanaf:start-3600000,gemetenTot:now,gedektMs:100000,bijgewerkt:now};
assert.equal(e.c.beOvMergeRows([],{[key]:outdated},'test',key,key,now).length,0,'old computed day amounts stay out until repriced');
console.log('PASS day-ahead pricing: planning, API mix, independent export, missing prices, cache/reload, financial arithmetic and official-source priority.');
