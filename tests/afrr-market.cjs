// Core tests use synthetic API data; no real API key or network is involved.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {IDBFactory}=require(process.env.BE_TEST_IDB_MODULE||'fake-indexeddb');
const source=fs.readFileSync(__dirname+'/../src/afrr-market.js','utf8');
new vm.Script(source);
const c={Intl,Date,Math,console,setTimeout,clearTimeout};vm.createContext(c);
vm.runInContext(source.slice(source.indexOf('  const INTERVAL='),source.indexOf('  async function boot()'))+
 '\nglobalThis.test={powerRows,graphWindow,numeric,parsePayload,parseMerit,ladderPosition,captureBid,comparison,trainingQuarter,historicalChance,marketFeature,publicationAfter,meritPath,retryAfter,failureDelay,createCoordinator,request,Fault};',c);
const core=c.test,now=Date.now(),start=now-120000,Q=900000;
function payload(points){return {Response:{informationType:'BALANCE_DELTA_HIGH_RES',TimeSeries:[{quantity_Measurement_Unit_name:'MAW',currency_Unit_name:'EUR',Period:[{points}]}]}};}
function point(i,extra={}){return {timeInterval_start:new Date(start+i*12000).toISOString(),timeInterval_end:new Date(start+(i+1)*12000).toISOString(),power_afrr_in:'25.5',power_afrr_out:'0.0',max_upw_regulation_price:'0.0',min_downw_regulation_price:null,...extra};}
const q=Math.floor(now/Q)*Q;
function molPayload(at=q,wrapped=false){return {Response:{informationType:'MERIT_ORDER_LIST',TimeSeries:[{quantity_Measurement_Unit_name:'MAW',price_Measurement_Unit_name:'MWh',currency_Unit_name:'EUR',Period:{Points:[{timeInterval_start:new Date(at).toISOString(),timeInterval_end:new Date(at+Q).toISOString(),Thresholds:[{capacity_threshold:'100',price_up:'100',price_down:'50'},{capacity_threshold:'200',price_up:'200',price_down:'0'},{capacity_threshold:'300',price_up:'300',price_down:'-100'}].map(t=>wrapped?{threshold:t}:t)}]}}]}};}
const ladder=core.parseMerit(molPayload()).quarters[0];
assert.equal(core.numeric(''),null);assert.equal(core.numeric(false),null);assert.equal(core.numeric(null),null);assert.equal(core.numeric('1,2'),null);assert.equal(core.numeric('0'),0);assert.equal(core.numeric('-125.3'),-125.3);
const parsed=core.parsePayload(payload([point(2),point(0),point(1)]),now);
assert.equal(parsed.rows.length,3);assert.equal(parsed.latest.upPrice,0);
assert.equal(core.parsePayload(payload([point(0,{power_afrr_in:null})]),now).latest.up,null);
assert.equal(core.parsePayload(payload([point(0,{power_afrr_in:'-25'})]),now).latest.up,null);
assert.throws(()=>core.parsePayload(payload([]),now),/Geen bruikbare/);
assert.throws(()=>core.parsePayload(payload([point(100)]),now),/Geen bruikbare/);
assert.throws(()=>core.parsePayload(payload([point(0,{timeInterval_start:new Date(start).toISOString().replace('Z','')})]),now),/Geen bruikbare/);
assert.equal(core.parseMerit(molPayload(q,true)).quarters[0].thresholds.length,3,'both official threshold schema variants');
assert.throws(()=>core.parseMerit({error:'No data found'}),/nog niet beschikbaar/);
assert.throws(()=>core.parseMerit({Response:{informationType:'WRONG',TimeSeries:[]}}),/geen Merit/);
assert.deepEqual(JSON.parse(JSON.stringify(core.ladderPosition(ladder,250,'up'))),{lower:200,upper:300});
assert.deepEqual(JSON.parse(JSON.stringify(core.ladderPosition(ladder,-50,'down'))),{lower:200,upper:300},'downward merit order runs in the opposite price direction');
assert.equal(core.ladderPosition(ladder,500,'up').upper,null,'outside published ladder never extrapolates');
const flat={...ladder,thresholds:[{capacity:10,up:100},{capacity:20,up:100},{capacity:30,up:200}]};
assert.equal(core.ladderPosition(flat,100,'up').upper,20,'equal-price blocks retain an interval');
assert.equal(core.ladderPosition({...ladder,thresholds:[{capacity:10,up:200},{capacity:20,up:100}]},150,'up'),null,'non-monotonic ladder is rejected');
const raw={start:q,end:q+Q,afrrBidStatus:{export:'bid_fallback',import:'confirmed'},values:{afrr_export:.25,afrr_import:99}};
const activeRow={start:q+120000,end:q+132000,up:50,upPrice:120};
assert.equal(core.graphWindow(now,7200000).end-core.graphWindow(now,7200000).start,7200000);
const net=core.powerRows([{t:now-30000,po:1000},{t:now-20000,po:-3000},{t:now+20000,po:5000},{t:now-7*3600000,po:2000}],now);
assert.equal(net.length,2);assert.equal(net[1].po,-3000,'negative net power is export; positive is import');
const bid=core.captureBid(raw,q+30000);assert.equal(bid.export.value,.25);assert.equal(bid.import,undefined,'confirmed quotes cannot become bids');
assert.equal(core.captureBid(raw,q+120000),null,'live capture stops exactly at two minutes');
assert.equal(core.captureBid({...raw,carried:true},q+30000),null,'carried data is never a fresh bid');
const archive={start:q,end:q+Q,export:{value:.8,observedAt:q+130000,observations:[{value:.25,observedAt:q+30000},{value:.8,observedAt:q+130000}]}};
assert.equal(core.captureBid(archive,q+500000).export.value,.25,'archive recovers the early bid instead of later prices');
let row={start:q+240000,end:q+252000,up:250,down:0,upPrice:260,downPrice:null};
assert.equal(core.comparison(row,bid,ladder,'up').tone,'reached','raw EUR/kWh is converted to EUR/MWh without tax');
assert.equal(core.comparison({...row,upPrice:240},bid,ladder,'up').tone,'waiting');
assert(core.comparison({...row,start:q-Q},bid,ladder,'up').label.includes('ontbreekt'),'never compares quarters');
assert(core.comparison({...row,upPrice:null},bid,ladder,'up').label.includes('niet bevestigd'),'dummy energy cannot confirm activation');
assert(core.comparison(row,bid,ladder,'up',true).label.includes('verouderd'));
assert.equal(core.retryAfter('Retry-After: 120\r\n',now),now+120000);
assert.equal(core.failureDelay(new core.Fault('http','rate',429,now+180000),1,now),180000);
const schedule=Date.parse('2026-10-25T12:03:01Z');
assert.equal(core.publicationAfter(schedule+12000),schedule+12000);
assert(core.meritPath(schedule-schedule%Q).includes('date_from=25-10-2026%2011%3A45%3A00'),'quarter queries use explicit UTC and no DST ambiguity');

const samples=Array.from({length:75},(_,i)=>({start:q+i*12000,end:q+(i+1)*12000,up:250,down:0,upPrice:i>=50?260:240,downPrice:null}));
const train=core.trainingQuarter(samples,bid,ladder,120000);assert(train);
const probe=samples[29],forecastNow=q+480000;
const changed=samples.map((p,i)=>i>=50?{...p,upPrice:240}:p);
const other=core.trainingQuarter(changed,bid,ladder,120000);
assert.equal(train.samples.find(s=>s.minute===8).ratio,other.samples.find(s=>s.minute===8).ratio,'future data never enters features');
assert.notEqual(train.samples.find(s=>s.minute===8).outcome,other.samples.find(s=>s.minute===8).outcome,'future data only supplies outcome');
assert.equal(core.trainingQuarter(samples.filter((_,i)=>i!==40),bid,ladder,120000),null,'missing source points cannot teach a failed call');
let history=Array.from({length:30},(_,i)=>({start:q-(i+1)*Q,samples:(i<15?train:other).samples}));
const chance=core.historicalChance(history,probe,bid,ladder,'up',samples,forecastNow);
assert.equal(chance.n,30);assert.equal(chance.p,.5);assert(chance.lower<.5&&chance.upper>.5);
assert.equal(core.historicalChance(history.slice(0,29),probe,bid,ladder,'up',samples,forecastNow).p,undefined,'no fabricated percentage before 30 independent quarters');
assert.equal(core.historicalChance(history,probe,bid,ladder,'up',samples,q+Q+120000),null,'previous-quarter source cannot predict a new quarter');

(async()=>{
 const idb=new IDBFactory(),a=core.createCoordinator(idb,'test-shared'),b=core.createCoordinator(idb,'test-shared');
 const reservations=await Promise.all([a.reserve('scope','a',schedule),b.reserve('scope','b',schedule)]);
 assert.equal(reservations.filter(r=>r.reserved).length,1,'tabs reserve one request atomically');
 const owner=reservations[0].reserved?'a':'b';
 await a.success('scope',owner,parsed,schedule+100);
 assert.equal((await b.read()).good.rows.length,3);
 assert.equal((await b.reserve('scope','b',schedule+11999)).reserved,false,'refresh cannot beat a new 12-second publication');
 for(let i=1;i<=4;i++){
   assert.equal((await a.reserve('scope','a',schedule+i*12000)).reserved,true);
   await a.success('scope','a',{...parsed,latest:{...parsed.latest,end:parsed.latest.end+i*12000}},schedule+i*12000+100);
 }
 assert.equal((await b.reserve('scope','b',schedule+59000)).reserved,false,'hard five-per-minute latest budget');
 assert.equal((await b.reserve('scope','b',schedule+60000)).reserved,true);
 const rate=new core.Fault('http','Aanvraaglimiet bereikt',429,schedule+210000);
 await b.failure('scope','b',rate,schedule+60100);await a.retry('scope');
 assert.equal((await a.reserve('scope','a',schedule+90000)).reserved,false,'manual retry respects Retry-After');
 assert.equal((await a.reserve('scope','a',schedule+90000,'mol')).reserved,false,'429 cools down both endpoints');
 assert((await a.read()).good,'last data retained after failure');
 assert.equal((await a.reserve('scope','a',schedule+210000)).reserved,true);
 await a.failure('scope','a',new core.Fault('auth','Geen toegang',403),schedule+211000);
 assert.equal((await b.reserve('scope','b',schedule+400000)).reserved,false);
 await b.retry('scope');assert.equal((await b.reserve('scope','b',schedule+400000)).reserved,true);
 const current=await b.read();await a.success('scope','a',parsed,schedule+401000);
 assert.equal((await b.read()).owner,current.owner,'stale owner cannot replace a newer lease');
 await b.clear();await a.success('scope','b',parsed,schedule+402000);assert.equal((await a.read()).good,undefined);
 assert.equal((await a.reserve('other-key','c',schedule+500000)).reserved,true);
 // Separate API permissions: a denied merit-order endpoint must not stop live data.
 const planner=core.createCoordinator(new IDBFactory(),'test-mol'),pq=Math.floor(schedule/Q)*Q;
 assert.equal((await planner.reserve('s','a',schedule,'mol')).reserved,true);
 await planner.failure('s','a',new core.Fault('auth','MOL denied',403),schedule+100,'mol');
 assert.equal((await planner.reserve('s','a',schedule+1200)).reserved,true);
 await planner.success('s','a',parsed,schedule+1300);
 assert.equal((await planner.reserve('s','a',schedule+120000,'mol')).reserved,false);
 await planner.retry('s','mol');assert.equal((await planner.reserve('s','a',schedule+120000,'mol')).reserved,true);
 await planner.success('s','a',core.parseMerit(molPayload(pq)),schedule+120100,'mol');
 assert.equal((await planner.reserve('s','b',schedule+180000,'mol')).reserved,false,'cached ladder is fetched once for its quarter');
 const stalled=core.createCoordinator(new IDBFactory(),'test-stalled');
 await stalled.reserve('s','a',schedule);await stalled.success('s','a',parsed,schedule+100);
 await stalled.reserve('s','a',schedule+12000);await stalled.success('s','a',parsed,schedule+12100);
 assert.equal((await stalled.read()).nextAt,schedule+36000,'unchanged data slows down instead of wasting calls');
 assert.equal((await stalled.reserve('s','a',schedule+24000)).reserved,false);
 await stalled.reserve('s','a',schedule+36000);await stalled.success('s','a',{...parsed,latest:{...parsed.latest,end:parsed.latest.end+36000}},schedule+36100);
 assert.equal((await stalled.read()).nextAt,schedule+48000,'advancing source resumes publication cadence');
 const budget=core.createCoordinator(new IDBFactory(),'test-all-channels');
 assert.equal((await budget.reserve('s','a',schedule)).reserved,true);
 assert.equal((await budget.reserve('s','b',schedule+100,'mol')).reserved,false,'one-second global limit spans endpoints');
 assert.equal((await budget.reserve('s','b',schedule+1100,'mol')).reserved,true);
 // Missing publications have a strict three-attempt budget for each quarter.
 const missing=core.createCoordinator(new IDBFactory(),'test-unpublished');
 for(let i=0;i<3;i++){
   assert.equal((await missing.reserve('s','a',schedule+i*61000,'mol')).reserved,true);
   await missing.failure('s','a',new core.Fault('no-data','Nog niet gepubliceerd'),schedule+i*61000+100,'mol');
 }
 assert.equal((await missing.reserve('s','a',schedule+300000,'mol')).reserved,false);
 // A daily budget also survives reloads and account/key changes.
 const quotaDB=new IDBFactory(),quota=core.createCoordinator(quotaDB,'test-daily');
 const db=await new Promise(resolve=>{const r=quotaDB.open('test-daily',1);r.onupgradeneeded=()=>r.result.createObjectStore('state',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put({id:'budget',attempts:[],molAttempts:Array.from({length:500},(_,i)=>schedule-500000+i),nextAt:0});tx.oncomplete=resolve;});
 assert.equal((await quota.reserve('changed-key','a',schedule,'mol')).reserved,false,'rolling 24-hour budget cannot be bypassed by a new scope');
 assert.equal((await quota.reserve('changed-key','a',schedule)).reserved,true,'MOL daily cap does not consume the live-data allowance');
 const fullDB=new IDBFactory(),full=core.createCoordinator(fullDB,'test-minute-cap');
 const fullConnection=await new Promise(resolve=>{const r=fullDB.open('test-minute-cap',1);r.onupgradeneeded=()=>r.result.createObjectStore('state',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=fullConnection.transaction('state','readwrite');tx.objectStore('state').put({id:'budget',attempts:Array.from({length:8},(_,i)=>schedule-10000+i*1000),molAttempts:[],nextAt:0});tx.oncomplete=resolve;});
 assert.equal((await full.reserve('changed-key','a',schedule)).reserved,false,'global minute cap survives changed scopes');
 let rows=await budget.bids('customer-a',[raw],q+30000);assert(rows[q].export);
 assert.equal(Object.keys(await budget.bids('customer-b',[],q+30000)).length,0,'BIDs stay installation-scoped');
 rows=await budget.bids('customer-a',[{...raw,afrrBidStatus:{export:'confirmed'},values:{afrr_export:99}}],q+300000);
 assert.equal(rows[q].export.value,.25,'confirmed quote cannot replace cached BID');
 assert.equal((await budget.history('s','customer-a',[{...train,start:q-Q},{...train,start:q-Q}],now)).length,1,'one historical outcome per source quarter');
 assert.equal((await budget.history('s','customer-b',[],now)).length,0);
 let seen;
 c.GM_xmlhttpRequest=options=>{seen=options;options.onload({status:200,responseText:JSON.stringify(payload([point(0)]))});};
 const data=await core.request({environment:'production',key:'LOCAL-TEST-KEY'});
 assert.equal(seen.url,'https://api.tennet.eu/publications/v1/balance-delta-high-res/latest');
 assert.equal(seen.headers.apikey,'LOCAL-TEST-KEY');assert.equal(seen.anonymous,true);assert(!JSON.stringify(data).includes('LOCAL-TEST-KEY'));
 await core.request({environment:'acceptance',key:'LOCAL-TEST-KEY'});assert(seen.url.startsWith('https://api.acc.tennet.eu/'));
 c.GM_xmlhttpRequest=options=>{seen=options;options.onload({status:200,responseText:JSON.stringify(molPayload())});};
 await core.request({environment:'production',key:'LOCAL-TEST-KEY'},'mol',q);assert(seen.url.includes('/merit-order-list?'));
 c.GM_xmlhttpRequest=options=>options.onload({status:403,responseText:'<html>LOCAL-TEST-KEY</html>'});
 await assert.rejects(core.request({environment:'production',key:'LOCAL-TEST-KEY'}),e=>e.status===403&&!e.message.includes('LOCAL-TEST-KEY'));
 c.GM_xmlhttpRequest=options=>options.onload({status:429,responseHeaders:'Retry-After: 120'});
 await assert.rejects(core.request({environment:'production',key:'LOCAL-TEST-KEY'}),e=>e.status===429&&e.retryAt>Date.now()+110000);
 const retained=core.createCoordinator(new IDBFactory(),'test-retain-six-hours');
 await retained.reserve('s','a',now);await retained.success('s','a',{rows:[{...activeRow,start:now-7*3600000,end:now-7*3600000+12000},{...activeRow,start:now-3*3600000,end:now-3*3600000+12000}],latest:{end:now-3*3600000+12000}},now);
 assert.equal((await retained.reserve('s','a',now+30000)).reserved,true);await retained.success('s','a',{rows:[{...activeRow,start:now-12000,end:now}],latest:{end:now}},now+30000);
 assert.equal((await retained.read()).good.rows.length,2,'keep received history for six hours and discard older data');
 await retained.power('a',[{t:now,po:-3000}],now);assert.equal((await retained.power('a',[],now))[0].po,-3000);assert.equal((await retained.power('b',[],now)).length,0,'net measurements stay installation scoped');
 console.log('PASS TenneT core: early BID capture, quarter isolation, raw price units, up/down ladders, dummy-energy guard, source-time features, independent historical cases with uncertainty, atomic shared budgets, 12-second publication alignment, adaptive backoff, quarter cache, permissions isolation and secret redaction.');
})().catch(e=>{console.error(e);process.exitCode=1;});
