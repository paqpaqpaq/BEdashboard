// Safari Userscripts stores GM values under filename---key. Its updater writes
// into the existing file URL. Tampermonkey likewise retains the installed ID.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),root=__dirname+'/../';
const old=fs.readFileSync(root+'Balansenergie-All-in-v6.3.2.user.js','utf8');
const update=fs.readFileSync(root+'Balansenergie-All-in.user.js','utf8');
const identity=s=>['name','namespace'].map(k=>s.match(new RegExp('^// @'+k+'\\s+(.+)$','m'))[1]).join('|');
assert.equal(identity(update),identity(old),'manual updates retain published identity');
assert.match(update,/@version\s+6\.4\n/);
const stores=new Map(),config='be-afrr-market-settings-v1';let writes=0,deletes=0;
const filenames=['Balansenergie All-in v6.3.user.js','Balansenergie All-in v6.3.1.user.js','Balansenergie All-in v6.3.2.user.js','Balansenergie All-in v6.3.3.user.js','existing-tampermonkey-script-id'];
filenames.forEach((id,i)=>stores.set(id+'---'+config,{key:'PRIVATE-TEST-KEY-'+i,scope:'saved-'+i,enabled:true,environment:'production'}));
function load(s,id,modern){
 const source=s.slice(s.indexOf('/* Regelvermogen & biedingen'));
 const get=(key,fallback)=>structuredClone(stores.get(id+'---'+key)??fallback);
 const set=(key,value)=>{writes++;stores.set(id+'---'+key,structuredClone(value));};
 const del=key=>{deletes++;stores.delete(id+'---'+key);};
 const box={Intl,Date,Math,console,setTimeout,clearTimeout};
 if(modern)box.GM={getValue:async(...a)=>get(...a),setValue:async(...a)=>set(...a),deleteValue:async(...a)=>del(...a)};
 else Object.assign(box,{GM_getValue:get,GM_setValue:set,GM_deleteValue:del});
 vm.createContext(box);vm.runInContext(source.slice(source.indexOf('  const INTERVAL='),source.indexOf('  async function boot()'))+'\nglobalThis.readSavedKey=loadConfig;',box);
 return box.readSavedKey();
}
module.exports=(async()=>{
 for(const modern of [false,true])for(const [i,id] of filenames.entries()){
  assert.equal((await load(old,id,modern)).key,'PRIVATE-TEST-KEY-'+i);
  assert.equal((await load(update,id,modern)).key,'PRIVATE-TEST-KEY-'+i,'existing 6.3/6.3.1/6.3.2/test key survives an in-place update');
 }
 assert.equal(writes,0);assert.equal(deletes,0);
 console.log('PASS API-key upgrades: existing 6.3/6.3.1/6.3.2/6.3.3-test storage, modern and legacy GM, unchanged published identity; no writes/deletes on load.');
})();
