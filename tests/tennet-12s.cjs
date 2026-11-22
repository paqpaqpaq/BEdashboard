// 7.2: afrekenprijs uit de TenneT 12-secondenreeks, afsluitregels en extreme prijzen.
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../src/afrr-market.js','utf8');
const QUARTER=900000;
const kwartierUitReeks=new Function('QUARTER',src.slice(src.indexOf('  function kwartierUitReeks'),src.indexOf('  function leesPrijsCache'))+';return kwartierUitReeks;')(QUARTER);
const q=Date.UTC(2026,10,21,12,0),next={start:q+QUARTER,up:0,down:0,upPrice:null,downPrice:null,midPrice:90};
const mk=(n,f)=>Array.from({length:n},(_,i)=>Object.assign({start:q+i*12000,up:0,down:0,upPrice:null,downPrice:null,midPrice:80},f?f(i):{})).concat([next]);
let r=kwartierUitReeks(mk(75,i=>i<20?{up:50,upPrice:150+i}:i>50?{down:30,downPrice:-20+i}:{}),q);
assert.deepEqual([r.rs,r.ki,r.ke],[2,0.169,0.031]);
r=kwartierUitReeks(mk(75,i=>({midPrice:i<70?80:120,up:i==3?1:0,upPrice:i==3?100:null,down:i==60?1:0,downPrice:i==60?70:null})),q);
assert.deepEqual([r.rs,r.ki,r.ke],[2,0.12,0.07],'toestand 2 met middenprijs');
r=kwartierUitReeks(mk(75,i=>i==10?{up:5,upPrice:4500}:{}),q);assert.deepEqual([r.rs,r.ki,r.ke],[1,4.5,4.5],'piek niet afgekapt');
r=kwartierUitReeks(mk(75,()=>({down:10,downPrice:-300})),q);assert.deepEqual([r.rs,r.ki,r.ke],[-1,-0.3,-0.3],'negatief blijft');
r=kwartierUitReeks(mk(75),q);assert.deepEqual([r.rs,r.ki],[0,0.08]);
assert.equal(kwartierUitReeks(mk(69),q),null,'te weinig punten');
assert.equal(kwartierUitReeks(mk(75).slice(0,-1),q),null,'nog geen punt na het kwartier');
assert.equal(kwartierUitReeks(mk(75).slice(3),q),null,'eerste punt te laat');
console.log('PASS TenneT 12 s: rekenregel per regeltoestand, middenprijs in toestand 2, afsluitregels, geen afkappen.');
