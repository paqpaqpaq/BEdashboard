// 6.8.3: day_ahead_import alleen aanvullen met EPEX als Balans null geeft, en alleen voor ingeplande import.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../src/dashboard.js','utf8');
const a=src.indexOf('  var BEDayAhead = (function () {'),b=src.indexOf('  window.BEDayAhead =',a);assert(a>0&&b>a);
const store={be_epex_nordpool_prices_v1:JSON.stringify({body:{multiAreaEntries:[
 {deliveryStart:'2026-11-21T00:00:00Z',deliveryEnd:'2026-11-21T00:15:00Z',entryPerArea:{NL:186.99}},
 {deliveryStart:'2026-11-21T00:15:00Z',deliveryEnd:'2026-11-21T00:30:00Z',entryPerArea:{NL:179.81}}]}})};
const c={localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}},Date,Set,Math,JSON,Number,Array,Object};
vm.createContext(c);vm.runInContext(src.slice(a,b)+';this.M=BEDayAhead;',c);
const t1=Date.parse('2026-11-21T00:00:00Z'),t2=t1+900000,t3=t2+900000;
const j={dayAheadPlans:[{start:t1,direction:'import'},{start:t2,direction:'import'}],prices:[
 {start:t1,values:{day_ahead_import:null}},{start:t2,values:{day_ahead_import:0.2}},{start:t3,values:{}}]};
c.M.vulAan(j);
assert.equal(j.prices[0].values.day_ahead_import,0.18699);assert.equal(j.prices[0].beDayAheadBron,'epex');
assert.equal(j.prices[1].values.day_ahead_import,0.2,'Balans-waarde blijft');assert.equal(j.prices[1].beDayAheadBron,undefined);
assert.equal(j.prices[2].values.day_ahead_import,undefined,'niet ingepland: niets invullen');
const rows=[{start:t1,dayAheadState:'planned',values:{}},{start:t2,dayAheadState:'none',values:{}}];
c.M.vulAanRijen(rows);assert.equal(rows[0].values.day_ahead_import,0.18699);assert.equal(rows[1].values.day_ahead_import,undefined);
console.log('epex-dayahead-fill ok');
