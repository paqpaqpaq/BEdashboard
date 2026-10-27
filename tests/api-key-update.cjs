// Legacy GM storage migrates once; a new filename recovers the same connection.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),root=__dirname+'/../';
const old=fs.readFileSync(root+'Balansenergie-All-in-v6.3.2.user.js','utf8');
const update=fs.readFileSync(root+'Balansenergie-All-in.user.js','utf8');
assert.match(update,/^\/\/ @name\s+Balansenergie All-in$/m);
assert.match(update,/@version\s+6\.4\.2\n/);
const config='be-afrr-market-settings-v1',backup='be_tennet_connection_v1';
const filenames=['Balansenergie All-in v6.3.user.js','Balansenergie All-in v6.3.1.user.js','Balansenergie All-in v6.3.2.user.js','Balansenergie All-in v6.3.3.user.js','Balansenergie All-in v6.4.user.js','Balansenergie-All-in-v6.4-lokale-fix.user.js','existing-tampermonkey-script-id'];
function instance(source,id,modern,stores,origin){
 const sourceModule=source.slice(source.indexOf('/* Regelvermogen & biedingen'));
 const get=(key,fallback)=>structuredClone(stores.get(id+'---'+key)??fallback);
 const set=(key,value)=>stores.set(id+'---'+key,structuredClone(value));
 const box={Intl,Date,Math,console,setTimeout,clearTimeout,Event:class{constructor(type){this.type=type;}},document:{dispatchEvent(){}},localStorage:{getItem:key=>origin.get(key)??null,setItem:(key,value)=>origin.set(key,value)}};
 if(modern)box.GM={getValue:async(...a)=>get(...a),setValue:async(...a)=>set(...a)};
 else Object.assign(box,{GM_getValue:get,GM_setValue:set});
 vm.createContext(box);vm.runInContext(sourceModule.slice(sourceModule.indexOf('  const INTERVAL='),sourceModule.indexOf('  async function boot()'))+'\nglobalThis.readSavedKey=loadConfig;'+(source===update?'globalThis.writeSavedKey=saveConfig;':''),box);
 return box;
}
module.exports=(async()=>{
 for(const modern of [false,true])for(const id of filenames){
  const saved={key:'PRIVATE-TEST-KEY',scope:'existing-request-scope',enabled:true,environment:'production'},stores=new Map([[id+'---'+config,saved]]),origin=new Map();
  assert.equal((await instance(old,id,modern,stores,origin).readSavedKey()).key,saved.key);
  const upgraded=instance(update,id,modern,stores,origin);
  assert.equal((await upgraded.readSavedKey()).key,saved.key);
  assert.equal(JSON.parse(origin.get(backup)).key,saved.key);
  const renamed=instance(update,'new-filename.user.js',modern,stores,origin),recovered=await renamed.readSavedKey();
  for(const k of ['key','scope','enabled','environment'])assert.equal(recovered[k],saved[k]);
  await renamed.writeSavedKey({...recovered,enabled:false});
  const paused=await upgraded.readSavedKey();assert.equal(paused.key,saved.key);assert.equal(paused.enabled,false);
  await renamed.writeSavedKey({key:'',scope:'',enabled:false,deleted:true});
  assert.equal((await upgraded.readSavedKey()).key,'','revocation also prevents stale installations from restoring an old key');
 }
 console.log('PASS key migration: legacy and modern GM, all legacy names, new filenames, preserved planner scope, pause, reload and explicit deletion.');
})();
