const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let current=null;
const native={textContent:'59%'},header={style:{},children:[],querySelector:q=>q==='.energy-chart-soc-value'?native:null,append(el){this.children.push(el);el.parentElement=this;current=el;}};
function node(tag){return {tag,style:{},textContent:'',children:[],setAttribute(){},append(...children){this.children.push(...children);},querySelector(q){return this.children.find(c=>c.tag===q);}};}
const box={window:{},document:{querySelector:q=>q==='#power-chart-content .energy-chart-soc-header'?header:null,getElementById:()=>current,createElement:node}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../src/soc-native-readout-beta.js','utf8'),box);
const api=box.window.BESocNativeReadout;
assert.equal(api.target(),header);
api.render({soc:'66,8%',compactSoc:'67%',state:'bijgewerkt'});
assert.equal(current.querySelector('strong').textContent,'67%');assert.equal(native.textContent,'59%');assert.equal(header.children.length,1);
api.render({soc:'66,7%',compactSoc:'67%',state:'bijgewerkt'});assert.equal(header.children.length,1);
api.render({soc:'66,4%',compactSoc:'66%',state:'bijgewerkt'});assert.equal(current.querySelector('strong').textContent,'66%');assert.equal(native.textContent,'59%');
console.log('PASS native SOC: exact graph header, integer compact value distinct from one-decimal details, original untouched, no duplicate row.');
