const fs=require('node:fs'),assert=require('node:assert/strict');
const user=fs.readFileSync(__dirname+'/../Balansenergie-All-in.user.js','utf8');
assert.match(user,/\/\/ @connect\s+services\.tenergy\.nl\n/);
const Q=900000,now=Date.parse('2026-11-18T10:31:00+01:00'),q=now-now%Q;
// Page side: fill order Balans > TenneT > Tenergy, previously filled values recognised, need list for TenneT.
{
  const a=user.indexOf('  var BETenergy = (function'),b=user.indexOf('  window.BETenergy = {',a);
  const store={be_onbalans_tenergy_v1:JSON.stringify({[q-Q]:{ki:0.1,ke:0.2,klaar:true,bron:'tenergy'},
    [q-2*Q]:{ki:0.3,ke:0.31,klaar:true,bron:'tennet',tg:{ki:0.29,ke:0.31}},[q]:{ki:0.11,ke:0.21,klaar:false,bron:'tenergy'}})};
  const ctx={localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v},document:{addEventListener(){},dispatchEvent(){}},
    Event:class{constructor(t){this.type=t}},setTimeout:f=>f(),clearTimeout(){},Date:class extends Date{constructor(...x){super(...(x.length?x:[now]))}static now(){return now}}};
  const B=new Function(...Object.keys(ctx),user.slice(a,b)+';return BETenergy;')(...Object.values(ctx));
  const rows=[{start:q-3*Q,values:{}},{start:q-2*Q,values:{onbalans_import:0.29,onbalans_export:0.31}},{start:q-Q,values:{onbalans_import:0.5}}];
  B.vulAanRijen(rows);
  assert.deepEqual(rows[1].values,{onbalans_import:0.3,onbalans_export:0.31});
  assert.equal(rows[1].beOnbalansBron.import,'tennet');
  assert.equal(rows[2].values.onbalans_import,0.5,'a Balans price is never replaced');
  assert.equal(rows[2].values.onbalans_export,0.2);
  assert.deepEqual(JSON.parse(store.be_onbalans_vraag_v1).officieel,[q-3*Q]);
  const j={prices:[{start:q-Q,end:q,values:{}}]};B.vulAan(j,now);
  assert.equal(j.prices.at(-1).start,q,'running quarter added');
  assert.equal(j.prices.at(-1).beOnbalansBron.import,'tenergy-voorlopig');
}
// Fetcher: last minute per quarter, future padding ignored, TenneT entries kept.
{
  const src=fs.readFileSync(__dirname+'/../src/tenergy.js','utf8');
  const minute=(i,v)=>({Key:'/Date('+(q-30*60000+i*60000)+')/',Value:v});
  const take=Array.from({length:42},(_,i)=>minute(i,100+i)).concat([{Key:'/Date('+(q+25*60000)+')/',Value:999}]);
  const feed=Array.from({length:42},(_,i)=>minute(i,50+i)).concat([{Key:'/Date('+(q+25*60000)+')/',Value:999}]);
  const html='<script>var data = '+JSON.stringify({ChartSeries:[{Id:'PRICES_TAKE',Data:take},{Id:'PRICES_FEED',Data:feed}]})+'; serialChart.updateChart(data, false);</script>';
  const store={be_onbalans_tenergy_v1:JSON.stringify({[q-2*Q]:{ki:9,ke:9,bron:'tennet',klaar:true}})};
  const t0=q+11*60000+20000;const events=[];
  const ctx={location:{hostname:'dashboard.balansenergie.nl'},window:{},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v},
    document:{hidden:false,addEventListener(){},dispatchEvent:e=>events.push(e.type)},Event:class{constructor(t){this.type=t}},
    setInterval(){},console,Date:class extends Date{constructor(...x){super(...(x.length?x:[t0]))}static now(){return t0}},
    GM_xmlhttpRequest:o=>o.onload({status:200,responseText:html})};
  new Function(...Object.keys(ctx),src)(...Object.values(ctx));
  const c=JSON.parse(store.be_onbalans_tenergy_v1);
  assert.deepEqual(c[q-2*Q],{ki:9,ke:9,bron:'tennet',klaar:true},'official entry untouched');
  assert.equal(c[q-Q].ki,0.129);assert.equal(c[q-Q].ke,0.079);assert.equal(c[q-Q].klaar,true);
  assert.equal(c[q].ki,0.141);assert.equal(c[q].klaar,false);
  assert.deepEqual(events,['be-onbalans-tenergy-update']);
}
console.log('PASS Tenergy/TenneT onbalans: fill order, archive recognition, running quarter, last-minute quarters, official precedence.');
