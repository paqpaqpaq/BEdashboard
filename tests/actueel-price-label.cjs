const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dashboard=fs.readFileSync(__dirname+'/../src/dashboard.js','utf8');
const bridge=fs.readFileSync(__dirname+'/../src/actueel-bridge-beta.js','utf8');
function section(source,first,last){
 const a=source.indexOf(first),b=source.indexOf(last,a);assert(a>=0&&b>a);return source.slice(a,b);
}
const now=Date.parse('2026-11-02T10:05:00Z'),quarter=Math.floor(now/900000)*900000;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const current={start:quarter,end:quarter+900000,ki:.10417,ke:.2,marktImport:'Dynamisch',marktExport:'onbalans'};
const previous={...current,start:quarter-900000,end:quarter,ki:.02,ke:.05};
function element(text,title){
 const attributes=new Map();let value=text,tip=title,writes=0;
 return {get textContent(){return value;},set textContent(next){value=next;writes++;},
  get title(){return tip;},set title(next){tip=next;writes++;},get writes(){return writes;},
  getAttribute:k=>attributes.get(k),setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)};
}
function dom(text='Import € 0,10/kWh',title='Dynamisch · import: € 0,10/kWh — Day-aheadprijs',rows=[current]){
 const e=element(text,title),observers=[];
 const c={Date:Clock,document:{getElementById:()=>e},isActueelPagina:()=>true,actueelAan:true,
  actueelRijen:rows,actueelLaatstGeschreven:null,BTW:1.21,EB:.11085,OPSLAG:.02,ACTUEEL_SALDEERT:true,
  MutationObserver:class{constructor(callback){this.callback=callback;}observe(node,options){observers.push({node,options});}}};
 vm.createContext(c);
 vm.runInContext(section(dashboard,'  function actueelEuro(','  var ACTUEEL_BRIDGE_CODE =')+
  section(dashboard,'  function actueelHuidigeRij()','  function actueelLegenda()'),c);
 return {c,e,observers,refresh:()=>c.actueelWerkSchemaBij()};
}
let d=dom();d.refresh();
assert.equal(d.e.textContent,'Import € 0,257/kWh','Pure day-ahead needs no approximate-price marker');
assert.match(d.e.title,/All-in/);assert.match(d.e.title,/Import · Dynamisch: € 0,257\/kWh/);
const firstWrites=d.e.writes;for(let i=0;i<10;i++)d.refresh();
assert.equal(d.e.writes,firstWrites,'Observer callbacks must converge without repeated DOM writes');
d.c.actueelVolgSchema();assert(d.observers[0].options.attributeFilter.includes('title'));
d.e.title='Nieuwe native toelichting';d.refresh();
assert.equal(d.e.textContent,'Import € 0,257/kWh');
d.c.actueelAan=false;d.refresh();
assert.equal(d.e.textContent,'Import € 0,10/kWh','Turning off restores the real native text after a title-only update');
assert.equal(d.e.title,'Nieuwe native toelichting','Turning off restores the latest native title');
d.c.actueelAan=true;d.refresh();assert.equal(d.e.textContent,'Import € 0,257/kWh');
d.e.textContent='Import € 0,11/kWh';d.e.title='Bron opnieuw opgehaald';
d.c.actueelRijen=[{...current,ki:.10549}];d.refresh();
assert.equal(d.e.textContent,'Import € 0,258/kWh','Native refresh and source precision do not cause double conversion');
for(const [raw,input,expected] of [
 [0,'Import € 0,00/kWh','Import € 0,131/kWh'],
 [-.02,'Import € −0,02/kWh','Import € 0,107/kWh'],
 [-.2,'Import € -0,20/kWh','Import € -0,111/kWh'],
 [.25,'Import € 0,25/kWh','Import € 0,433/kWh']
]){d=dom(input,'Bron',[{...current,ki:raw}]);d.refresh();assert.equal(d.e.textContent,expected);}
d=dom('Import ≈ € 0,10/kWh · Export € 0,20/kWh');d.refresh();
assert.equal(d.e.textContent,'Import ≈ € 0,257/kWh · Export € 0,333/kWh','Directions use independent raw values/formulas');
d=dom(undefined,undefined,[]);d.refresh();assert.equal(d.e.textContent,'Import prijs volgt (all-in)');
assert(!d.e.title.includes('€ 0,10'),'Pending all-in must not expose a bare amount as all-in');
d.c.actueelRijen=[current];d.refresh();assert.equal(d.e.textContent,'Import € 0,257/kWh');
d.c.actueelAan=false;d.refresh();assert.equal(d.e.textContent,'Import € 0,10/kWh');
for(const rows of [[previous],[{...current,carried:true,sourceStart:previous.start}],[{...current,ki:null}]]){
 d=dom(undefined,undefined,rows);d.refresh();assert.equal(d.e.textContent,'Import prijs volgt (all-in)');
}
d=dom('Export € 0,20/kWh','Export',[{...current,ki:null}]);d.refresh();assert.equal(d.e.textContent,'Export € 0,333/kWh');
d=dom('Import Prijs niet beschikbaar','Geen prijs',[{...current,ki:null}]);d.refresh();assert.equal(d.e.textContent,'Import Prijs niet beschikbaar');

const calls=[];let transform={a:2,c:0,e:0};
const chart={currentDevicePixelRatio:2,ctx:{fillText:text=>calls.push(text),getTransform:()=>transform},
 scales:{x:{getValueForPixel:pixel=>pixel<100?previous.start+300000:quarter+300000}}};
const c={Date:Clock,Chart:{getChart:()=>chart}};vm.createContext(c);
vm.runInContext(section(bridge,' var CANVAS=',' function verver()'),c);
c.st.rijen=[previous,current];c.wikkel();
function draw(text,x=150,y=0){chart.ctx.fillText(text,x,y);return calls.at(-1);}
assert.equal(draw('Import € 0,10/kWh'),'Import € 0,257/kWh');
assert.equal(draw('Import € 0,02/kWh',50),'Import € 0,155/kWh','Historical labels use their own quarter');
assert.equal(draw('Nu Import € 0,10/kWh',50),'Nu Import € 0,257/kWh','Pinned Nu label uses the current quarter rather than its right-side x position');
assert.equal(draw('ISP Import € 0,10/kWh',50),'ISP Import € 0,257/kWh');
transform={a:0,c:2,e:300};
assert.equal(draw('Import € 0,10/kWh',0,0),'Import € 0,257/kWh','Rotated labels resolve their actual chart position');
transform={a:2,c:0,e:0};
assert.equal(draw('Import € 0,10/kWh · Export € 0,20/kWh'),'Import € 0,257/kWh · Export € 0,333/kWh');
c.st.rijen=[{...current,ki:0}];assert.equal(draw('Import € 0,00/kWh'),'Import € 0,131/kWh');
c.st.rijen=[{...current,ki:-.02}];assert.equal(draw('Import € −0,02/kWh'),'Import € 0,107/kWh');
c.st.rijen=[];assert.equal(draw('Import € 0,10/kWh'),'Import prijs volgt (all-in)');
c.st.rijen=[current];chart.scales={};assert.equal(draw('Import € 0,10/kWh'),'Import prijs volgt (all-in)');
assert.equal(draw('Nu Import € 0,10/kWh'),'Nu Import € 0,257/kWh','Pinned labels remain resolvable before scales are ready');
c.st.aan=false;assert.equal(draw('Import € 0,10/kWh'),'Import € 0,10/kWh');
c.st.aan=true;chart.scales={x:{getValueForPixel:()=>quarter+300000}};c.wikkel();c.wikkel();
assert.equal(draw('Import € 0,10/kWh'),'Import € 0,257/kWh','Repeated wrapping must not convert twice');
console.log('PASS Actueel price labels: precise per-direction all-in, native text/title restoration, pending source, current/historical/pinned/rotated canvas labels and idempotent updates.');
