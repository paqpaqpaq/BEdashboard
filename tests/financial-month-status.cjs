const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/financial-beta.js','utf8');
function between(first,last){
 const start=source.indexOf(first),end=source.indexOf(last,start);
 assert(start>=0&&end>start,'Financial source section exists');return source.slice(start,end);
}
const now=Date.parse('2027-04-01T12:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const queue=[],requests=[];
const c={Date:Clock,Intl,URL,Map,Promise,cache:new Map(),location:{origin:'https://dashboard.balansenergie.nl'},
 origFetch:async url=>{requests.push(url);assert(queue.length,'Expected API request');return queue.shift();},
 beOvNormalize:(body,month)=>{if(!Array.isArray(body.series))throw Error('Onbekend antwoordformaat voor '+month+'.');return body.series;}};
vm.createContext(c);
vm.runInContext(between('  function beOvDate(','  function beOvAnniversary(')+
 between('  function beOvApplyMonthResult(','  function beOvCalculate(')+
 between('    async function fetchMonth(','    async function load()'),c);
function response(status,body){return {ok:status>=200&&status<300,status,json:async()=>body};}
function plain(value){return JSON.parse(JSON.stringify(value));}

module.exports=(async()=>{
 queue.push(response(400,{error:{code:'period_not_available'}}));
 const unavailable=await c.fetchMonth('demo','2027-04');
 assert.deepEqual(plain(unavailable),{rows:[],unavailable:true});
 const count=requests.length;
 assert.equal((await c.fetchMonth('demo','2027-04')).unavailable,true);
 assert.equal(requests.length,count,'A cached unavailable month keeps its classification');
 for(const [status,body,expected] of [
  [400,{error:{code:'bad_period'}},/HTTP 400/],
  [401,{error:{code:'period_not_available'}},/Log opnieuw in/],
  [403,{error:{code:'period_not_available'}},/Log opnieuw in/],
  [429,{error:{code:'period_not_available'}},/429/],
  [500,{error:{code:'period_not_available'}},/HTTP 500/]
 ]){
  c.cache.clear();queue.push(response(status,body));
  await assert.rejects(c.fetchMonth('demo','2027-04'),expected);
 }
 c.cache.clear();queue.push({ok:false,status:400,json:async()=>{throw Error('Invalid JSON');}});
 await assert.rejects(c.fetchMonth('demo','2027-04'),/HTTP 400/,'An unreadable error body is not an unavailable month');
 const official={key:'2027-04-01',inkoop:12.34,verkoop:4.56};
 c.cache.clear();queue.push(response(200,{series:[official]}));
 assert.deepEqual(plain(await c.fetchMonth('demo','2027-04')),{rows:[official],unavailable:false});
 assert.equal(new URL(requests.at(-1)).searchParams.get('period'),'2027-04');

 // Exercise the actual status rendering, stopping before unrelated HTML/charts.
 Object.assign(c,{beOvSettings:{tax:true,vat:true},beOvCalculate:rows=>rows,beOvTotal:()=>({}),
  selected:(rows,r)=>rows.filter(d=>d.key>=r.a&&d.key<=r.b),beOvStatementData:()=>({}),
  beOvFixed:()=>({}),statementRange:r=>r,beOvForecast:()=>({rows:null}),
  iso:d=>d.toISOString().slice(0,10),verversKlantUitPad:()=> 'demo',load(){throw Error('Unexpected reload');}});
 const render=between('    function render(){','      var summary=')+'    }';
 vm.runInContext(render,c);
 const today={key:'2027-04-01',eigenCache:true,voorlopig:true,deelresultaat:true,bijgewerkt:now};
 function statusFor(rows,range,errors=[]){
  c.latest={id:'demo',rows,range,errors,unavailableMonths:['2027-04'],contextMissing:0,contextPartial:false};
  let result;c.status=(text,warning)=>{result={text,warning};};c.render();return result;
 }
 let status=statusFor([today],{a:'2027-04-01',b:'2027-04-30'});
 assert.equal(status.warning,false,'An unprocessed current month with today in local cache is neutral');
 assert.match(status.text,/April 2027 nog niet verwerkt · voorlopige eigen cache/);
 assert.match(status.text,/1 van 1 verstreken dagen bekend/);
 assert(!status.text.includes('HTTP 400'));
 status=statusFor([today],{a:'2027-03-31',b:'2027-04-30'});
 assert(status.warning);assert.match(status.text,/1 dag ontbreekt/,'Missing completed days remain visible');
 status=statusFor([{key:'2027-03-31',voorlopig:true,eigenCache:true,deelresultaat:true},today],{a:'2027-03-31',b:'2027-04-30'});
 assert(status.warning);assert.match(status.text,/onvolledig dagdeel/,'Incomplete completed days remain warnings');
 status=statusFor([today],{a:'2027-04-01',b:'2027-04-30'},[{month:'2027-04',message:'Balans vraagt om even te wachten (429).'}]);
 assert(status.warning);assert.match(status.text,/429/,'Actual request failures remain warnings');

 // Recovery changes only the month that was reloaded, even with identical rows.
 const march={key:'2027-03-31',inkoop:9.87,verkoop:6.54};
 const target={id:'demo',sourceRows:[march,official],rows:[march,official],
  errors:[{month:'2027-04',message:'Old April failure'},{month:'2027-02',message:'Other month failure'}],
  unavailableMonths:['2027-04','2027-02']};
 let renders=0;
 Object.assign(c,{latest:target,opened:true,document:{hidden:false},ownRefreshPromise:null,ownRefreshAt:0,
  resultatenHaalVoorlopigeDagen:async()=>false,beOvMonths:()=>['2027-03','2027-04'],
  fetchMonth:async(id,month)=>({rows:[month==='2027-03'?march:official],unavailable:false}),
  mergeOwnCache:()=>{c.latest.rows=c.latest.sourceRows.slice();},render:()=>{renders++;}});
 vm.runInContext(between('    function refreshOwnCache(){','    function selected('),c);
 c.refreshOwnCache();await c.ownRefreshPromise;
 assert.deepEqual(plain(target.errors),[{month:'2027-02',message:'Other month failure'}]);
 assert.deepEqual(plain(target.unavailableMonths),['2027-02']);
 assert.deepEqual(plain(target.sourceRows),[march,official]);
 assert.equal(renders,1,'Clearing an error must refresh the notice even when source/cache rows did not change');
 assert.equal(c.ownRefreshPromise,null);
 console.log('PASS Financial month availability: explicit API error, real failures, neutral cache coverage, missing/partial warnings and month-scoped automatic recovery.');
})();
