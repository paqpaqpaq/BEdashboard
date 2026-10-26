// DOM and colour-cascade regression; this does not replace a browser layout review.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {Window}=await import(process.env.BE_DOM_MODULE||'happy-dom');
const root=fileURLToPath(new URL('../',import.meta.url));
const src=fs.readFileSync(root+'/src/coulomb-beta.js','utf8');
const w=new Window({url:'http://127.0.0.1/customer/demo/history/'});
w.document.write('<!doctype html><html><head></head><body><div class="history-chart-soc-row"><div class="history-chart-soc-header"><span class="history-chart-soc-label">SOC</span></div><div class="frame"><canvas id="soc-chart"></canvas></div></div></body></html>');
w.eval(fs.readFileSync(root+'/src/dark-theme.js','utf8'));
const now=Date.now(),start=now-6*3600000,canvas=w.document.getElementById('soc-chart');
canvas.getBoundingClientRect=()=>({left:0,top:0,width:600,height:250});
const chart={canvas,width:600,height:250,chartArea:{left:0,right:600,top:0,bottom:220},data:{datasets:[{label:'SOC',borderColor:'#69318d',borderWidth:2,data:Array.from({length:73},(_,i)=>({x:start+i*300000,y:82-18*i/72}))}]},config:{options:{scales:{x:{}},plugins:{legend:{labels:{}}}}},scales:{x:{type:'linear',min:start,max:now,getValueForPixel:x=>start+x/600*(now-start),getPixelForValue:x=>(x-start)/(now-start)*600,getLabelForValue:x=>x},y:{getPixelForValue:y=>220*(1-y/100)}},update(){},isDatasetVisible:()=>true,setDatasetVisibility(){},getDatasetMeta(i){const d=this.data.datasets[i];return {type:'line',yAxisID:'y',_parsed:d.data,data:d.data.map(p=>({skip:p.y===null})),dataset:{options:{borderWidth:d.borderWidth,borderColor:d.borderColor}}};},getActiveElements:()=>[],tooltip:{options:{enabled:true}}};
w.Chart={register(){},getChart:x=>x==='soc-chart'||x===canvas?chart:null};
const hook=`cfg={capacityMode:'kwh',capacityKwh:48.2};record={rows:Array.from({length:73},(_,i)=>[${start}+i*300000,82-18*i/72,1060.4]),manual:[{t:${start},soc:80,kind:'Voorbeeld'}]};register();compute();render();return;`;
w.eval(src.replace('  register();compute();render();',hook));
const chemical=w.document.querySelector('[data-chemical]');assert.equal(chemical.textContent,'32,3 kWh');
function normalize(color){const s=w.document.createElement('span');s.style.color=color;return s.style.color;}
for(const width of [320,375,1024])for(const mode of ['light','bruingrijs','grafiet']){
 w.happyDOM.setWindowSize({width,height:800});w.BETheme.apply(mode!=='light',mode==='light'?'bruingrijs':mode);
 await new Promise(r=>setTimeout(r,10));
 canvas.dispatchEvent(new w.MouseEvent('mousemove',{clientX:600,clientY:100,bubbles:true}));
 await new Promise(r=>setTimeout(r,10));
 const color=w.getComputedStyle(chemical).color;
 assert.equal(normalize(color),normalize(w.BETheme.seriesColor('coulomb')),mode+' chemical value colour');
 const tip=w.document.querySelector('[data-be-soc-tooltip]'),values=[...tip.querySelectorAll('.be-soc-tooltip-value')];
 assert(values[0].textContent.includes('64% · 30,8 kWh'));assert(values[1].textContent.includes('67% · 32,3 kWh'));
 assert.equal(normalize(w.getComputedStyle(values[1]).color),normalize(w.BETheme.seriesColor('coulomb')),mode+' tooltip Coulomb colour');
 const expectedNative=mode==='light'?'#69318d':w.BETheme.color('#69318d','text',true);
 assert.equal(normalize(w.getComputedStyle(values[0]).color),normalize(expectedNative),mode+' native tooltip colour');
 const header=chemical.closest('header');assert.equal(w.getComputedStyle(header).display,'grid');
 assert.equal(w.getComputedStyle(chemical.parentElement).alignItems,'flex-end');
 console.log('PASS DOM/style',width,mode,chemical.textContent,color,values.map(e=>e.textContent));
}
await w.happyDOM.cancelAsync();w.close();
