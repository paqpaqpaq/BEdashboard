const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/current-tariff-cache.js','utf8');
const dashboard=fs.readFileSync(__dirname+'/../src/dashboard.js','utf8');
const QUARTER=900000,TTL=1800000,start=Date.parse('2026-10-22T12:00:00Z');
let now=start+120000;
class Clock extends Date{static now(){return now;}}
function environment(store=new Map(),fail=false){
 let reads=0,serial=0;const timers=new Map(),events={};
 const storage={get length(){return store.size;},key:i=>Array.from(store.keys())[i],getItem(k){reads++;if(fail)throw Error('storage denied');return store.get(k)||null;},setItem(k,v){if(fail)throw Error('storage denied');store.set(k,v);},removeItem:k=>store.delete(k)};
 const c={window:{addEventListener:(name,handler)=>events[name]=handler},localStorage:storage,Date:Clock,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,at:now+ms});return serial;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(c);vm.runInContext(source,c);
 return {api:c.window.BECurrentTariffCache,c,store,events,reads:()=>reads,expire(){for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
function payload(values,extra={}){return {prices:[{start,end:start+QUARTER,values,provisional:true,updatedAt:new Date(now).toISOString(),...extra}],afrrEventIsps:[]};}
let e=environment(),p=payload({onbalans_import:.55,onbalans_export:-.08,afrr_import:9,afrr_export:8}),original=JSON.stringify(p);
e.api.remember('installation-a',p);assert.equal(JSON.stringify(p),original,'never mutate the response received by the dashboard');
assert.equal(e.api.get('installation-a',start).quotes.onbalans_import.value,.55);
assert.equal(e.api.get('installation-a',start).quotes.onbalans_export.value,-.08);
assert(![...e.store.values()].join('').includes('"afrr_import"'),'BID/aFRR values do not enter the temporary imbalance cache');
const reads=e.reads();for(let i=0;i<500;i++)e.api.get('installation-a',start);assert.equal(e.reads(),reads,'drawing historical rows must not repeatedly read disk storage');
const oldAt=e.api.get('installation-a',start).quotes.onbalans_import.at;
now+=60000;e.api.remember('installation-a',payload({onbalans_import:null,onbalans_export:null}));
assert.equal(e.api.get('installation-a',start).quotes.onbalans_import.at,oldAt,'empty responses never extend expiry');
e=environment(e.store);
const restored=e.api.restore('installation-a',[]);assert.equal(restored.length,1);assert(restored[0].temporaryTariffs);assert.equal(restored[0].values.onbalans_import,undefined,'cached quotes remain separate from API/settlement values');
Object.assign(e.c,{KLANT:'installation-a',beLokalePrijsHistorie:{}});
vm.runInContext(dashboard.slice(dashboard.indexOf('  function actueelPrijsRij(p) {'),dashboard.indexOf('  async function beVerwerkBron(')),e.c);
const quote=e.c.actueelPrijsRij(restored[0]);assert.equal(quote.ki,.55);assert.equal(quote.ke,-.08);assert(quote.provisional);assert.equal(quote.verloop[0].t,oldAt,'restored line starts at its actual observation time');
Object.assign(e.c,{beLivePrijsRows:[],actueelRijen:[],actueelDagPunten:[],actueelAan:false,beOverbrugPrijzen:rows=>rows});
vm.runInContext(dashboard.slice(dashboard.indexOf('  function tariefKwartieren() {'),dashboard.indexOf('  function tariefZetNoot() {')),e.c);
const plotted=e.c.tariefKwartieren();assert.equal(plotted.length,1);assert.equal(plotted[0].pi,.55);assert.equal(plotted[0].pe,-.08);assert.equal(plotted[0].wacht,false);assert.equal(plotted[0].verloop[0].t,oldAt,'tariff chart restores actual observations, rather than a lone invisible point');
const fresh=e.c.actueelPrijsRij(payload({onbalans_import:.7,onbalans_export:.2}).prices[0]);assert.equal(fresh.ki,.7);assert.equal(fresh.ke,.2,'fresh response wins over cached values');
const mixed=e.c.actueelPrijsRij(payload({afrr_import:null,onbalans_export:null},{directions:['import']}).prices[0]);assert.equal(mixed.ki,null,'cached imbalance prices never stand in for an aFRR direction');assert.equal(mixed.ke,-.08);
assert.equal(e.api.get('installation-b',start),null,'installations are isolated');
now=start+480000;e.api.remember('installation-a',payload({onbalans_import:.6,onbalans_export:null}));
const newer=e.api.get('installation-a',start).quotes.onbalans_import.at;
const stale=payload({onbalans_import:99},{updatedAt:new Date(start+180000).toISOString()});e.api.remember('installation-a',stale);assert.equal(e.api.get('installation-a',start).quotes.onbalans_import.value,.6,'late old responses cannot replace newer observations');
now=oldAt+TTL-1;assert(e.api.get('installation-a',start).quotes.onbalans_export);
now=oldAt+TTL;assert.equal(e.api.get('installation-a',start).quotes.onbalans_export,undefined,'each direction expires at exactly thirty minutes');assert(e.api.get('installation-a',start).quotes.onbalans_import);
now=newer+TTL;e.expire();assert.equal(e.api.get('installation-a',start),null);assert.equal(e.api.restore('installation-a',restored).length,0);assert.equal(e.store.size,0,'expired transient quotes are physically removed when the timer runs');
const expired=e.c.actueelPrijsRij(restored[0]);assert.equal(expired.ki,undefined);assert.equal(expired.ke,undefined);assert.equal(expired.verloop.length,0,'expired cache cannot leave a stale visible line');
assert.equal(e.c.tariefKwartieren().length,0,'expiry removes the temporary plotted quarter as well');
e.api.remember('installation-a',p);assert.equal(e.api.get('installation-a',start),null,'re-fetching an ended quarter never resurrects the live cache');
now=start+100000;e=environment(new Map(),true);e.api.remember('installation-a',payload({onbalans_import:0,onbalans_export:-.2}));assert.equal(e.api.get('installation-a',start).quotes.onbalans_import.value,0,'zero and negative prices also work with unavailable storage');
now+=TTL;assert.equal(e.api.get('installation-a',start),null);
console.log('PASS current tariff cache: reload recovery, raw response preservation, genuine timestamps, fresh-price priority, per-direction 30-minute expiry, active cleanup, market/installation separation, old-response rejection and storage failure.');
