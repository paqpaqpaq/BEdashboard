const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/coulomb-beta.js','utf8');
const storage=new Map(),now=Date.now();let capacity=48.2;
const box={window:{},console,Date,key:'energy-test',error:'',storageError:'',settings:()=>({capacity}),
  record:{rows:[[now,50,0]]},result:{points:[{t:now,soc:50,raw:50}],input:0,output:0,gaps:0},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
vm.createContext(box);
vm.runInContext(fs.readFileSync(__dirname+'/../src/voltage-profile.js','utf8'),box);
vm.runInContext(fs.readFileSync(__dirname+'/../src/capacity-settings-beta.js','utf8'),box);
vm.runInContext(source.slice(source.indexOf('  const number='),source.indexOf('  function textIfChanged(')),box);
for(const [soc,expected] of [[0,'0,0 kWh'],[50,'24,1 kWh'],[66.8,'32,2 kWh'],[100,'48,2 kWh']]){
  box.result.points[0].soc=soc;assert.equal(box.display().chemicalContent,expected);
}
capacity=1000;box.result.points[0].soc=12.345;
assert.equal(box.display().chemicalContent,'123,5 kWh','calculate from the unrounded SOC');
capacity=box.window.BECapacity.resolve({capacityMode:'fcc',fccAh:300,packCount:3,nominalVoltage:51.2}).capacity;
box.result.points[0].soc=50;const expectedFCC=(capacity*.5).toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh';assert.equal(box.display().chemicalContent,expectedFCC,'FCC-derived measured-profile capacity is used');
box.result=null;assert.equal(box.display().chemicalContent,expectedFCC,'last valid display keeps its matching capacity');
capacity=60;assert.equal(box.display().chemicalContent,'— kWh','changed capacity must not reuse an old cached content');
capacity=NaN;assert.equal(box.display().chemicalContent,'— kWh','unknown capacity is never shown as zero');
assert(source.includes(fs.readFileSync(__dirname+'/../src/soc-hover-beta.js','utf8')));
console.log('PASS chemical content: 0/50/100%, one decimal, unrounded SOC, kWh/FCC capacity, cached display, missing capacity and embedded tooltip source.');
