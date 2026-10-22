const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',full=fs.readFileSync(root+'Balansenergie-All-in.user.js','utf8');
new vm.Script(full);
assert.equal(full,fs.readFileSync(root+'Balansenergie-All-in-v6.2.user.js','utf8'));
assert.equal(full,fs.readFileSync(root+'Balansenergie-All-in-v6.2.txt','utf8'));
const meta=fs.readFileSync(root+'Balansenergie-All-in.meta.js','utf8');
assert.equal(meta,full.slice(0,full.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length)+'\n');
assert.match(meta,/@namespace\s+paq\.balansenergie\n/);
assert.match(meta,/@version\s+6\.2\n/);
assert(!/BETA|v6\.0-beta/.test(meta));
assert.match(meta,/@updateURL\s+https:\/\/raw\.githubusercontent\.com\/paqpaqpaq\/BEdashboard\/main\/Balansenergie-All-in\.meta\.js/);
const bid=fs.readFileSync(root+'src/bid.js','utf8'),soc=fs.readFileSync(root+'src/coulomb-beta.js','utf8');
assert(full.includes(bid));assert(full.includes(soc));
const guard=fs.readFileSync(root+'src/soc-display-guard.js','utf8');
assert(full.includes(guard));
assert(full.indexOf(guard)<full.indexOf('function dashboardCode()'));
assert(!/192\.168\.|paqha\.duckdns|eyJhbGci/.test(full));

const resolver=full.slice(full.indexOf('  var klantMatch ='),full.indexOf('  var beNativeFetch ='));
function box(path,resources=[],links=[]){
 const storage=new Map();
 const c={window:{},location:{pathname:path,origin:'https://dashboard.balansenergie.nl'},URL,performance:{getEntriesByType:()=>resources.map(name=>({name}))},document:{querySelectorAll:()=>links.map(href=>({href}))},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout};
 vm.createContext(c);vm.runInContext(resolver,c);return c;
}
assert.equal(box('/customer/installation-a/').window.BEInstallation.resolve(),'installation-a');
assert.equal(box('/customer/',['https://dashboard.balansenergie.nl/customer/current-history/api/?installation=installation-b']).window.BEInstallation.resolve(),'installation-b');
assert.equal(box('/customer/',[],['https://dashboard.balansenergie.nl/customer/installation-c/account/']).window.BEInstallation.resolve(),'installation-c');
assert.equal(box('/customer/account/').window.BEInstallation.resolve(),null);

module.exports=(async()=>{
 for(const [source,flag,variable,cut] of [
  [bid,'__beAfrrBid01','customer','    const cachePrefix='],
  [soc.slice(soc.indexOf('(async function () {')),'__beCoulombInOut6','id','  const ext=']
 ]){
  let release;const promise=new Promise(done=>{release=done;});
  const c={window:{BEInstallation:{wait:()=>promise}},location:{pathname:'/customer/'}};
  vm.createContext(c);
  const prefix=source.slice(0,source.indexOf(cut))+`window.resolved=${variable};})();`;
  const initialized=vm.runInContext(prefix,c);assert(!c.window[flag]);
  release('installation-root');await initialized;
  assert.equal(c.window.resolved,'installation-root');assert(c.window[flag]);
 }
 console.log('PASS stable release: synchronized JS/TXT/metadata, stable update channel, no private endpoints, canonical and root installation routes, delayed BID/SOC initialization.');
})();
