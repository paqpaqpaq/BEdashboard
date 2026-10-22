const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/financial-beta.js','utf8');
assert(!source.includes("button('Sluiten"),'Financial has no close-page button');
assert(!source.includes("$('close')"),'mounting the page must not bind a removed element');
assert(!source.includes("e.key==='Escape'){e.preventDefault();close();"),'Escape must not close a normal page');
function node(parent=null){
 const properties=new Map(),attributes=new Map();
 const el={parentElement:parent,children:[],inert:false,isConnected:true,hidden:false,className:'',
  style:{getPropertyValue:k=>properties.get(k)?.[0]||'',getPropertyPriority:k=>properties.get(k)?.[1]||'',setProperty:(k,v,p='')=>properties.set(k,[v,p]),removeProperty:k=>properties.delete(k)},
  setAttribute:(k,v)=>attributes.set(k,v),getAttribute:k=>attributes.get(k),removeAttribute:k=>attributes.delete(k),
  contains(other){return other===el||el.children.some(child=>child.contains(other));},
  focus(){},closest(){return null;},getBoundingClientRect:()=>({width:200,height:400,left:0,right:200})};
 if(parent)parent.children.push(el);return el;
}
const body=node(),header=node(body),main=node(body),menu=node(main),content=node(main),root=node(body),toggle=node(header),link=node(menu);
header.style.setProperty('position','relative','important');menu.style.setProperty('min-height','600px');content.style.setProperty('display','grid','important');
toggle.closest=()=>header;toggle.click=()=>toggle.setAttribute('aria-expanded','false');
link.closest=()=>menu;
const fields={'mobile-menu':node(),title:node()};
const c={root,body,header,menu,content,toggle,link,fields,innerWidth:390,opened:false,inertNodes:[],mobileChrome:[],mobileHeader:null,mobileSidebar:null,pageScrollBefore:null,navLinks:[link],navAnchor:link,fallback:null,menuActiveBefore:[],serial:0,HASH:'#be-energieoverzicht',location:{hash:'',pathname:'/customer/demo/',search:''},history:{state:null,pushState(){},replaceState(){}},theme(){},load(){},window:{scrollX:0,scrollY:250,scrollTo(x,y){this.scrollX=x;this.scrollY=y;}},document:{body,activeElement:toggle,querySelector(selector){if(selector.includes('aria-expanded'))return null;if(selector.includes('data-bs-target'))return toggle;if(selector==='#mobileSidebar')return menu;return null;},querySelectorAll(selector){return selector.startsWith('main,')?[main]:[];}},$:id=>fields[id]};
vm.createContext(c);vm.runInContext(source.slice(source.indexOf('    function restoreMobileNavigation(){'),source.indexOf('    function addMenu() {')),c);
c.open(false,link);
assert.equal(root.style.position,'relative');assert.equal(header.style.getPropertyValue('position'),'static');assert(content.inert);assert.equal(content.style.getPropertyValue('display'),'none');assert.equal(c.window.scrollY,0);
c.window.scrollY=500;c.layout();assert.equal(c.window.scrollY,500,'maintenance must leave document scrolling alone');assert.equal(header.style.getPropertyValue('position'),'static');
c.innerWidth=1200;c.layout();assert.equal(root.style.position,'fixed');assert.equal(header.style.getPropertyValue('position'),'relative');assert.equal(header.style.getPropertyPriority('position'),'important');assert.equal(content.style.getPropertyValue('display'),'grid');assert.equal(content.style.getPropertyPriority('display'),'important');
c.innerWidth=390;c.layout();assert.equal(root.style.position,'relative');assert.equal(content.style.getPropertyValue('display'),'none');
c.close();assert(root.hidden);assert(!content.inert);assert.equal(content.style.getPropertyValue('display'),'grid');assert.equal(content.style.getPropertyPriority('display'),'important');assert.equal(header.style.getPropertyValue('position'),'relative');assert.equal(menu.style.getPropertyValue('min-height'),'600px');assert.equal(c.window.scrollY,250);
c.open(false,link);c.close();assert(!content.inert);assert.equal(content.style.getPropertyValue('display'),'grid');
console.log('PASS Financial navigation: document scrolling, maintenance, mobile/desktop resize, original inline priorities, close/reopen and dashboard scroll restoration.');

const bid=fs.readFileSync(__dirname+'/../src/bid.js','utf8');let dark=true;
const chart={canvas:{id:'be-tarief-chart'},data:{datasets:[{label:'Import',borderWidth:2}]},options:{plugins:{}}};
const b={window:{BETheme:{isDark:()=>dark,seriesColor:direction=>direction==='bid-import'?'#ff9baa':'#80e7c1'}},directions:['import','export'],colours:{},read:()=>null,points:()=>[{x:0,y:.2},{x:1,y:.3}]};
vm.createContext(b);vm.runInContext(bid.slice(bid.indexOf('    function bidColour('),bid.indexOf('    const bids ='))+bid.slice(bid.indexOf('    const plugin ='),bid.indexOf('    function ensureUI()'))+'\nthis.plugin=plugin;',b);
b.plugin.beforeUpdate(chart);const overlays=chart.data.datasets.filter(d=>d.beBidDirection);
assert.equal(overlays.length,2);for(const d of overlays){assert.equal(d.borderWidth,1);assert.equal(d.pointHitRadius,8);assert.equal(d.data[1].y,.3);}
dark=false;b.plugin.beforeUpdate(chart);for(const d of overlays)assert.equal(d.borderWidth,1.5);
dark=true;b.plugin.beforeUpdate(chart);for(const d of overlays)assert.equal(d.borderWidth,1);
assert.equal(chart.data.datasets[0].borderWidth,2);
console.log('PASS BID: both dark overlays 1 px, light overlays 1.5 px, live theme updates, hit areas, price data and normal tariffs preserved.');
