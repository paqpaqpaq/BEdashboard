const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/afrr-background.js','utf8');
const CONFIG='be-afrr-market-settings-v1',BUDGET='be-afrr-background-budget-v1',key='LOCAL-TEST-KEY';
const latest='https://api.tennet.eu/publications/v1/balance-delta-high-res/latest';
const mol='https://api.tennet.eu/publications/v1/merit-order-list?date_from=25-10-2026%2011%3A45%3A00&date_to=25-10-2026%2012%3A15%3A00';
let now=Date.parse('2026-10-25T12:03:01Z'),responseStatus=200,retry='',calls=[];
const store=new Map([[CONFIG,{key,enabled:true,environment:'production'}]]);
const local={async get(k){return {[k]:structuredClone(store.get(k))};},async set(values){for(const [k,v] of Object.entries(values))store.set(k,structuredClone(v));},async remove(k){store.delete(k);}};
class Clock extends Date{static now(){return now;}}
function worker(){
 let listener;const chrome={storage:{local},runtime:{onMessage:{addListener(fn){listener=fn;}}}};
 const c={chrome,URL,Date:Clock,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});return {status:responseStatus,headers:{get:()=>retry},text:async()=>'{"publicData":true}'};}};
 vm.createContext(c);vm.runInContext(source,c);
 return (url=latest,sender='https://dashboard.balansenergie.nl/customer/test/')=>new Promise(resolve=>listener({type:'be-afrr-fetch',url},{url:sender},resolve));
}
(async()=>{
 let send=worker();
 assert((await send(latest,'https://evil.example/')).error);assert.equal(calls.length,0);
 assert((await send('https://evil.example/publications/v1/balance-delta-high-res/latest')).error);assert.equal(calls.length,0);
 assert((await send(mol+'&apikey=should-never-be-in-query')).error);assert.equal(calls.length,0);
 assert.equal((await send()).status,200);assert.equal(calls.length,1);assert.equal(calls[0].options.headers.apikey,key);assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
 now+=100;assert.equal((await send(mol)).status,429);assert.equal(calls.length,1,'global 1.1-second guard spans endpoints');
 now+=1000;assert.equal((await send(mol)).status,200);
 now-=1100;
 for(let i=1;i<5;i++){now+=12000;assert.equal((await send()).status,200);}
 now+=11000;send=worker();assert.equal((await send()).status,429,'five-per-minute guard survives worker restart');assert.equal(calls.length,6);
 now+=1000;assert.equal((await send()).status,200);
 now+=12000;responseStatus=429;retry='120';assert.equal((await send()).status,429);
 const failedAt=now;now+=60000;send=worker();const before=calls.length;assert.equal((await send(mol)).status,429);assert.equal(calls.length,before,'upstream Retry-After survives worker restart');
 now=failedAt+120000;responseStatus=200;assert.equal((await send()).status,200);
 now+=12000;store.set(BUDGET,{all:[],live:[],mol:Array.from({length:500},(_,i)=>now-500000+i),nextAt:0});
 assert.equal((await send(mol)).status,429);assert.equal((await send()).status,200,'daily MOL cap does not disable live-data allowance');
 // Adapter sends no API key through runtime messages and persists privately.
 let sent;const adapterBox={chrome:{storage:{local},runtime:{sendMessage(message,reply){sent=message;reply({status:200,text:'{}'});}}}};
 vm.createContext(adapterBox);vm.runInContext(fs.readFileSync(__dirname+'/../src/afrr-extension.js','utf8'),adapterBox);
 const manager=adapterBox.BEAfrrExtensionManager;assert.equal((await manager.get(CONFIG,{})).key,key);
 await new Promise(resolve=>manager.request({url:latest,headers:{apikey:key},onload:resolve}));
 assert(!JSON.stringify(sent).includes(key));assert.equal(sent.type,'be-afrr-fetch');
 console.log('PASS extension: isolated key storage, fixed endpoints/sender, no key in runtime requests, persistent cross-tab minute/day budgets, restart protection, Retry-After and omitted credentials.');
})().catch(e=>{console.error(e);process.exitCode=1;});
