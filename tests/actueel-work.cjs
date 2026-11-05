const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',source=fs.readFileSync(root+'src/dashboard.js','utf8');
const before=fs.readFileSync(root+'Balansenergie-All-in-v6.6.3.user.js','utf8');
function fn(text,name){const a=text.indexOf('  function '+name+'(');assert(a>=0,name);const b=text.indexOf('\n  function ',a+5);return text.slice(a,b);}
function context(text){const c={BTW:1.21,OPSLAG:.02,actueelAan:true,actueelAllin:(v,e)=>e?v*1.21-.02+.11085:v*1.21+.02+.11085};vm.createContext(c);vm.runInContext(fn(text,'actueelProjectieBereken'),c);return c;}
const old=context(before),fresh=context(source),start=Date.parse('2026-11-05T00:00:00Z'),Q=900000;
let seed=664;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
// Compare every returned field with the published algorithm: missing samples,
// sign crossings, duplicate timestamps, partial quarters and unavailable prices.
for(let day=0;day<4;day++){
 const points=[];
 for(let k=0;k<2880;k++)if(random()>.035){const p={x:start+k*30000,y:Math.round((random()-.5)*34000)};points.push(p);if(random()<.002)points.push({...p,y:p.y+1});}
 points.push({x:NaN,y:1},{x:start,y:null});
 const prices=Array.from({length:96},(_,i)=>({start:start+i*Q,end:start+(i+1)*Q,ki:i%9?random()-.2:null,ke:i%11?random()-.3:null}));
 const sorted=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.x-b.x);
 for(const allin of [false,true]){
  old.actueelAan=fresh.actueelAan=allin;
  for(let i=0;i<96;i++){
   const from=start+i*Q,to=from+Q,now=to-(i%3?0:72000);
   const a=old.actueelProjectieBereken(points,[prices[i]],from,to,now);
   const b=fresh.actueelProjectieBereken(sorted,[prices[i]],from,to,now,true);
   assert.deepEqual(JSON.parse(JSON.stringify(b)),JSON.parse(JSON.stringify(a)),'quarter arithmetic must remain exact');
  }
 }
}
let now=start+12*3600000+60000,calls=0,saves=0;
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
const info={__beResultaatTekst:null,querySelector:()=>null},c={Date:Clock,KLANT:'test',actueelAan:true,actueelDagBerekening:null,
 actueelDagPunten:[{x:start,y:1000},{x:now-60000,y:2000}],actueelRijen:[],
 isActueelPagina:()=>true,actueelZorgBedieningsRij:()=>true,document:{getElementById:()=>info},
 actueelProjectieBereken:()=>{calls++;return {gemetenMs:100,bedrag:1};},bewaarVoorlopigeDag:()=>{saves++;},
 iso:d=>d.toISOString().slice(0,10),actueelResultaatHtml:()=>'<span>same</span>',actueelResultaatInfoBediening(){},beDarkOn:false};
vm.createContext(c);vm.runInContext(fn(source,'actueelProjectieToon'),c);
c.actueelProjectieToon();now+=3000;c.actueelProjectieToon();assert.equal(calls,1,'idle maintenance reuses calculation');
c.actueelAan=false;c.actueelProjectieToon();assert.equal(calls,2,'all-in switch invalidates result');
c.actueelRijen=[];c.actueelProjectieToon();assert.equal(calls,3,'revised prices invalidate result');
c.actueelDagPunten=c.actueelDagPunten.map(p=>({...p}));c.actueelProjectieToon();assert.equal(calls,4,'corrected observations invalidate result');
now=start+12*3600000+5*60000;c.actueelProjectieToon();assert.equal(calls,5,'20-minute ageing boundary stays live');
now=start+12*3600000+15*60000;c.actueelProjectieToon();assert.equal(calls,6,'quarter boundary stays live');
const store={},storage={Date:Clock,KLANT:'test',voorlopigeSessie:'test',window:{BECurrentTariffCache:{priceModel:2}},
 leesVoorlopigeDagen:()=>structuredClone(store),voorlopigeBerekeningGeldig:()=>true,
 voorlopigeDagGrenzen:()=>({start,eind:start+86400000}),schrijfVoorlopigeDagen:o=>{Object.assign(store,o);storage.writes++;},writes:0};
vm.createContext(storage);vm.runInContext(fn(source,'bewaarVoorlopigeDag'),storage);
const res={gemetenMs:1000,gedekt:1000,stukken:1,importKwh:1,exportKwh:0,inkoopEur:.2,verkoopEur:0};
storage.bewaarVoorlopigeDag('2026-11-05',res,start,now);assert.equal(storage.writes,1);
now+=3000;storage.bewaarVoorlopigeDag('2026-11-05',res,start,now-3000);assert.equal(storage.writes,1,'same cache is not rewritten just to advance its timestamp');
storage.bewaarVoorlopigeDag('2026-11-05',{...res,inkoopEur:.3},start,now);assert.equal(storage.writes,2,'corrected amount is saved');
console.log('PASS Actueel work: 768 exact old/new quarter comparisons, idle result reuse, source/toggle/time invalidation and changed-only cache writes.');
