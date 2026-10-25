// DOM/behaviour tests; no external requests and no actual credentials.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {IDBFactory}=require(process.env.BE_TEST_IDB_MODULE||'fake-indexeddb');
const {Window}=await import(process.env.BE_DOM_MODULE||'happy-dom');
const source=fs.readFileSync(new URL('../src/afrr-market.js',import.meta.url),'utf8');
const secret='LOCAL-TEST-KEY',store=new Map(),idb=new IDBFactory(),requests=[],Q=900000;
const now=Date.parse('2026-10-25T12:08:01Z'),q=Math.floor(now/Q)*Q,end=q+360000;
function balance(at=end){return {Response:{informationType:'BALANCE_DELTA_HIGH_RES',TimeSeries:[{quantity_Measurement_Unit_name:'MAW',currency_Unit_name:'EUR',Period:[{points:[
 {timeInterval_start:new Date(at-24000).toISOString(),timeInterval_end:new Date(at-12000).toISOString(),power_afrr_in:'12.0',power_afrr_out:'0.0',max_upw_regulation_price:'100.0',min_downw_regulation_price:null},
 {timeInterval_start:new Date(at-12000).toISOString(),timeInterval_end:new Date(at).toISOString(),power_afrr_in:'25.5',power_afrr_out:'0.0',max_upw_regulation_price:'117.25',min_downw_regulation_price:null}
]}]}]}};}
const molBody={Response:{informationType:'MERIT_ORDER_LIST',TimeSeries:[{quantity_Measurement_Unit_name:'MAW',price_Measurement_Unit_name:'MWh',currency_Unit_name:'EUR',Period:{Points:[q-Q,q].map(start=>({timeInterval_start:new Date(start).toISOString(),timeInterval_end:new Date(start+Q).toISOString(),Thresholds:[{capacity_threshold:'10',price_up:'50',price_down:'20'},{capacity_threshold:'20',price_up:'100',price_down:'0'},{capacity_threshold:'30',price_up:'150',price_down:'-50'}]}))}}]}};
const success=body=>({status:200,responseText:JSON.stringify(body)});
const windows=[];
function page({mainPlugin=true,response=success(balance()),molResponse=success(molBody),database=idb,values=store,record=requests,at=now,hidden=false,modern=false,visible=true}={}){
 const w=new Window({url:'https://dashboard.balansenergie.nl/customer/test/'});windows.push(w);
 const RealDate=w.Date;w.Date=class extends RealDate{static now(){return at;}};
 w.document.write('<!doctype html><html><body><main>'+(mainPlugin?'<div id="be-tarief-row">Tariefgrafiek</div>':'')+'</main></body></html>');
 if(!visible)w.localStorage.setItem('be_cfg_afrr_market','uit');
 let visibility=hidden;
 Object.defineProperty(w.document,'hidden',{get:()=>visibility,configurable:true});w.indexedDB=database;
 const get=(key,def)=>structuredClone(values.has(key)?values.get(key):def),set=(key,value)=>values.set(key,structuredClone(value)),del=key=>values.delete(key);
 const request=options=>{record.push(options);queueMicrotask(()=>options.onload(options.url.includes('/merit-order-list?')?molResponse:response));};
 if(modern)w.GM={getValue:get,setValue:set,deleteValue:del,xmlHttpRequest:request};
 else{w.GM_getValue=get;w.GM_setValue=set;w.GM_deleteValue=del;w.GM_xmlhttpRequest=request;}
 const attach=w.HTMLElement.prototype.attachShadow;let root;
 w.HTMLElement.prototype.attachShadow=function(init){const r=attach.call(this,init);if(this.id==='be-tennet-standalone-test'){assert.equal(init.mode,'closed');root=r;}return r;};
 w.eval(source);return {w,get root(){return root;},setHidden(value){visibility=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},advance(ms){at+=ms;}};
}
async function until(check,label){const deadline=Date.now()+6500;while(Date.now()<deadline){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error(label);}
async function seedBids(database){
 const db=await new Promise((resolve,reject)=>{const r=database.open('balansenergie-bids-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('kwartieren',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('kwartieren','readwrite');tx.objectStore('kwartieren').put({id:'test:'+q,customer:'test',start:q,end:q+Q,export:{value:.11,observedAt:q+30000},import:{value:-.02,observedAt:q+40000}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
}
const enabled=scope=>new Map([['be-afrr-market-settings-v1',{key:secret,scope,enabled:true,environment:'production'}]]);
try{
 await seedBids(idb);
 const a=page();await until(()=>a.root?.querySelector('[data-status]').textContent.includes('Vul'),'initial panel');
 assert.equal(requests.length,0,'zero network before entering a key, including with existing BIDs');
 assert.equal(a.root.querySelector('[data-advanced]').open,false,'technical details start collapsed');
 assert.equal(a.root.querySelectorAll('.summary-card').length,2,'two clear summaries replace the data wall');
 assert(!a.root.querySelector('[data-settings]').closest('[data-advanced]'),'key entry remains accessible');
 assert.equal(a.w.document.getElementById('be-tarief-row').nextElementSibling.id,'be-tennet-standalone-test');
 a.root.querySelector('[data-key]').value=secret;
 a.root.querySelector('[data-form]').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>a.root.querySelector('[data-up]').textContent==='25,5 MW','connected values');
 assert.equal(requests.length,1);assert.equal(requests[0].headers.apikey,secret);
 assert.equal(requests[0].url,'https://api.tennet.eu/publications/v1/balance-delta-high-res/latest');
 assert.equal(a.root.querySelector('[data-key]').value,'');assert(!a.root.textContent.includes(secret));
 assert.equal(a.root.querySelector('[data-down]').textContent,'0,0 MW');
 assert.equal(a.root.querySelector('[data-up-price]').textContent,'€ 117,25 / MWh');
 assert.equal(a.root.querySelector('[data-down-price]').textContent,'—');
 assert.equal(a.root.querySelector('[data-up-bid]').textContent,'€ 110,00 / MWh','raw BID without all-in tax');
 assert(a.root.querySelector('[data-up-comparison]').textContent.includes('bereikt in bronmeting'));
 assert(a.root.querySelector('[data-down-comparison]').textContent.includes('Geen regelvolume'));
 assert.equal(a.root.querySelector('[data-summary-up]').textContent,'Prijsvoorwaarde gehaald');
 assert.equal(a.root.querySelector('[data-summary-up-power]').textContent,'25,5 MW');
 assert.equal(a.root.querySelector('[data-summary-down-power]').textContent,'0,0 MW');
 assert.equal(a.root.querySelector('[data-summary-up-bid]').textContent,'≥ € 0,110/kWh');
 assert.equal(a.root.querySelector('[data-summary-down-bid]').textContent,'≤ € -0,020/kWh');
 assert(!a.root.querySelector('[data-summary-up-power]').closest('[data-advanced]'),'MW remains visible above details');
 assert(!a.root.querySelector('[data-summary-up-bid]').closest('[data-advanced]'),'EMS bid remains visible');
 assert.equal(a.root.querySelector('[data-summary-down]').textContent,'Geen regelvolume');
 assert(a.root.querySelector('.summary-note').textContent.includes('niet bevestigd'));
 assert(a.root.querySelector('[data-up-chance]').textContent.includes('niet beschikbaar'),'a percentage needs a ladder and sufficient cases');
 assert.equal(a.root.querySelectorAll('tbody tr').length,2);
 assert(a.root.querySelector('[data-refresh]').disabled);
 // Advancing the synthetic clock lets the independent MOL request past the
 // global one-per-second guard; no real API or waiting for a new publication.
 a.advance(1500);a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));
 await until(()=>a.root.querySelector('[data-up-ladder]').textContent.includes('20–30 MW'),'merit-order comparison');
 assert.equal(requests.length,2);assert(requests[1].url.includes('/merit-order-list?'));
 assert(a.root.querySelector('[data-up-chance]').textContent.includes('0/30'),'no untrained probability is fabricated');
 assert.equal(a.root.querySelector('[data-status]').parentElement.tagName,'HEADER','connection status shares the title row');
 assert(a.root.querySelector('h3').textContent==='Regelvermogen & biedingen');
 assert(a.root.querySelector('[data-summary-up-price]').textContent.startsWith('TenneT-regelprijs €'));
 const graph=a.root.querySelector('[data-power-graph]');assert.equal(graph.open,false,'graph is optional');
 const graphRequests=requests.length;graph.open=true;graph.dispatchEvent(new a.w.Event('toggle'));
 await until(()=>a.root.querySelector('[data-power-plot] svg'),'power graph rendered from cache');
 assert(a.root.querySelector('[data-power-plot] svg').getAttribute('aria-label').includes('dezelfde schaal'));
 assert(a.root.querySelectorAll('[data-power-plot] polyline').length>=2,'up/down get separate series');
 assert.equal(requests.length,graphRequests,'opening graph makes no API calls');
 const b=page({at:now+1500});
 await until(()=>b.root?.querySelector('[data-up-ladder]').textContent.includes('20–30 MW'),'second tab full cache');
 assert.equal(requests.length,2,'reloads and tabs reuse both API caches');
 assert.equal(b.root.querySelector('[data-settings]').open,false,'stored key does not require setup after reload');
 assert(b.root.querySelector('[data-settings-title]').textContent.includes('sleutel opgeslagen'));
 assert(b.root.querySelector('[data-key-state]').textContent.includes('automatisch gebruikt bij herladen'));
 assert(b.root.querySelector('[data-key]').placeholder.includes('opgeslagen sleutel'));
 assert.equal(b.root.querySelector('[data-key]').value,'','saved key is used without exposing it in the input');
 assert.equal(store.get('be-afrr-market-settings-v1').key,secret);
 assert.equal(b.w.document.getElementById('be-tarief-row').nextElementSibling.id,'be-tennet-standalone-test');
 a.w.document.documentElement.setAttribute('data-be-dark','aan');a.w.document.documentElement.setAttribute('data-be-dark-style','grafiet');
 await until(()=>a.w.document.getElementById('be-tennet-standalone-test').dataset.theme==='grafiet','theme follows dashboard');
 assert(a.root.querySelector('[data-diagnostic]').textContent.includes('HTTP-status: 200'));
 assert(a.root.querySelector('[data-diagnostic]').textContent.includes('Biedladder HTTP-status: 200'));
 assert(!a.root.querySelector('[data-diagnostic]').textContent.includes(secret));
 a.root.querySelector('[data-pause]').click();
 await until(()=>store.get('be-afrr-market-settings-v1')?.enabled===false,'pause stored');
 await until(()=>a.root.querySelector('[data-status]').textContent.startsWith('Gepauzeerd'),'paused panel');
 a.root.querySelector('[data-forget]').click();
 await until(()=>!store.has('be-afrr-market-settings-v1')&&a.root.querySelector('[data-up]').textContent==='— MW','key/cache cleared');
 const blockedRequests=[];
 const denied=page({database:new IDBFactory(),values:enabled('blocked'),record:blockedRequests,response:{status:403,responseText:'<html>'+secret+'</html>'}});
 await until(()=>denied.root?.querySelector('[data-status]').textContent.includes('HTTP 403'),'403 diagnostic');
 assert(!denied.root.textContent.includes(secret));assert(denied.root.querySelector('[data-refresh]').disabled);assert.equal(blockedRequests.length,1);
 const accStore=enabled('acc');accStore.get('be-afrr-market-settings-v1').environment='acceptance';const accRequests=[];
 const acc=page({database:new IDBFactory(),values:accStore,record:accRequests,modern:true});
 await until(()=>acc.root?.querySelector('[data-up]').textContent==='25,5 MW','modern GM / acceptance');
 assert(accRequests[0].url.startsWith('https://api.acc.tennet.eu/'));assert(acc.root.querySelector('[data-up-chance]').textContent.includes('Geen kansmodel op testgegevens'));
 const partialDB=new IDBFactory();await seedBids(partialDB);const partialRequests=[];
 const partial=page({database:partialDB,values:enabled('partial'),record:partialRequests,molResponse:{status:403,responseText:'<html>'+secret+'</html>'}});
 await until(()=>partial.root?.querySelector('[data-up]').textContent==='25,5 MW','balance still works');
 partial.advance(1500);partial.w.document.dispatchEvent(new partial.w.Event('visibilitychange'));
 await until(()=>partial.root.querySelector('[data-mol-status]').textContent.includes('HTTP 403'),'separate MOL permission failure');
 assert.equal(partial.root.querySelector('[data-up]').textContent,'25,5 MW');assert(!partial.root.textContent.includes(secret));
 const oldDB=new IDBFactory();await seedBids(oldDB);
 const old=page({database:oldDB,values:enabled('old-quarter'),record:[],at:q+60000,response:success(balance(q-60000))});
 await until(()=>old.root?.querySelector('[data-up]').textContent==='25,5 MW','prior-quarter source');
 assert.equal(old.root.querySelector('[data-up-bid]').textContent,'€ 110,00 / MWh');
 assert(old.root.querySelector('[data-up-comparison]').textContent.includes('BID ontbreekt'),'new BID never compares with previous-quarter measurements');
 assert(old.root.querySelector('[data-comparison-quarter]').textContent.includes('niet gebruikt'));
 assert.equal(old.root.querySelector('[data-summary-up]').textContent,'Wachten op dit kwartier');
 const hiddenRequests=[],hidden=page({database:new IDBFactory(),values:enabled('hidden'),record:hiddenRequests,hidden:true});
 await until(()=>hidden.root?.querySelector('[data-poll]').textContent.includes('zichtbaar'),'hidden page idle');
 assert.equal(hiddenRequests.length,0,'hidden tab starts no requests');
 hidden.setHidden(false);await until(()=>hiddenRequests.length===1,'visible page resumes');
 // Navigation teardown must not cause a panel/native-page reinsertion loop.
 const navigationDB=new IDBFactory(),navigationRequests=[],navigation=page({database:navigationDB,values:enabled('navigation'),record:navigationRequests});
 await until(()=>navigation.root?.querySelector('[data-up]').textContent==='25,5 MW','navigation baseline');
 const navHost=navigation.w.document.getElementById('be-tennet-standalone-test'),nativeMain=navigation.w.document.querySelector('main');
 const marker=navigation.w.document.createElement('span');marker.id='native-navigation-marker';
 navigation.w.document.getElementById('be-tarief-row').after(marker);
 navigation.w.document.dispatchEvent(new navigation.w.Event('be-tarief-update'));
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(marker.nextElementSibling,navHost,'native sibling insertions are respected');
 navigation.w.history.pushState({},'', '/customer/test/current-history/');
 nativeMain.innerHTML='<article id="history-content">Historie blijft zichtbaar</article>';
 navigation.w.dispatchEvent(new navigation.w.PopStateEvent('popstate'));
 navigation.advance(60000);navigation.w.document.dispatchEvent(new navigation.w.Event('visibilitychange'));
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(nativeMain.children.length,1);assert.equal(nativeMain.firstElementChild.id,'history-content');
 assert(!navigation.w.document.getElementById('be-tennet-standalone-test'),'panel stays out of a new native page');
 assert.equal(navigationRequests.length,1,'history navigation cannot start another TenneT request');
 navigation.w.history.pushState({},'', '/customer/test/');nativeMain.innerHTML='<div id="be-tarief-row">Nieuwe tariefgrafiek</div>';
 navigation.w.document.dispatchEvent(new navigation.w.Event('be-tarief-update'));
 await until(()=>navHost.isConnected,'return to Actueel remounts original panel');
 assert.equal(navigation.w.document.getElementById('be-tarief-row').nextElementSibling,navHost);
 // Repeated native DOM changes must not wake the widget or create mutations.
 let widgetChanges=0;const observer=new navigation.w.MutationObserver(records=>{widgetChanges+=records.filter(r=>[...r.addedNodes,...r.removedNodes].includes(navHost)).length;});observer.observe(nativeMain,{childList:true,subtree:true});
 for(let i=0;i<25;i++){const child=navigation.w.document.createElement('i');nativeMain.append(child);child.remove();}
 await new Promise(resolve=>setTimeout(resolve,30));observer.disconnect();assert.equal(widgetChanges,0,'unrelated DOM changes cause zero widget moves');
 const absent=page({mainPlugin:false,database:new IDBFactory(),values:enabled('no-chart'),record:[]});
 await until(()=>absent.root,'anchorless module initialized');await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(absent.w.document.querySelector('main').children.length,0,'no fallback into native main');
 // Use the actual dashboard settings handlers, not a test-only switch.
 const dashboard=fs.readFileSync(new URL('../src/dashboard.js',import.meta.url),'utf8');
 const settings=dashboard.slice(dashboard.indexOf('  function beAfrrMarketEnabled()'),dashboard.indexOf('  var EB_BASIS'));
 assert(dashboard.includes('id="be-p-afrr"'),'general settings expose the switch');
 assert(dashboard.includes('id="cfg-afrr-market"'),'financial settings expose the same switch');
 const offRequests=[],offStore=enabled('disabled-test'),offDB=new IDBFactory();
 const off=page({database:offDB,values:offStore,record:offRequests,visible:false});
 await until(()=>off.w.document.getElementById('be-tennet-standalone-test')?.hidden,'disabled panel stays hidden');
 assert.equal(offRequests.length,0,'saved key cannot trigger a request while disabled');
 assert.equal(off.w.document.getElementById('be-tennet-standalone-test').style.display,'none');
 assert.equal(offStore.get('be-afrr-market-settings-v1').key,secret,'disabling preserves the key');
 off.w.eval(settings);off.w.beAfrrMarketSet(true);
 await until(()=>off.root.querySelector('[data-up]').textContent==='25,5 MW','settings restore panel with stored key');
 assert.equal(offRequests.length,1);assert(!off.w.document.getElementById('be-tennet-standalone-test').hidden);
 off.w.beAfrrMarketSet(false);assert(off.w.document.getElementById('be-tennet-standalone-test').hidden);
 off.advance(60000);off.w.document.dispatchEvent(new off.w.Event('visibilitychange'));
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(offRequests.length,1,'disabled panel cannot resume on visibility or refresh');
 assert.equal(off.w.localStorage.getItem('be_cfg_afrr_market'),'uit');
 const reloaded=page({database:offDB,values:offStore,record:offRequests,visible:off.w.localStorage.getItem('be_cfg_afrr_market')!=='uit'});
 await until(()=>reloaded.w.document.getElementById('be-tennet-standalone-test')?.hidden,'disabled preference survives reload');
 assert.equal(offRequests.length,1);assert.equal(offStore.get('be-afrr-market-settings-v1').key,secret);
 reloaded.w.localStorage.setItem('be_cfg_afrr_market','aan');
 reloaded.w.dispatchEvent(new reloaded.w.StorageEvent('storage',{key:'be_cfg_afrr_market',newValue:'aan'}));
 await until(()=>!reloaded.w.document.getElementById('be-tennet-standalone-test').hidden,'cross-tab setting resumes panel');
 assert(reloaded.root.querySelector('a[href="https://developer.tennet.eu/"]'),'key request portal is linked');
 console.log('PASS TenneT DOM: cached first-two-minute BIDs, correct raw prices/directions, both API caches shared across tabs, source-quarter isolation, honest chance warmup, per-endpoint permissions, modern/legacy GM, hidden-tab pause, dark theme and secret redaction.');
}finally{for(const w of windows){await w.happyDOM.cancelAsync();w.close();}}
