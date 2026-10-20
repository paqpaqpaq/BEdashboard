(function startBEActueel(){
 if(typeof Chart==='undefined'||!Chart.getChart||!Chart.getChart('battery-chart')){setTimeout(startBEActueel,150);return;}

 if(window.__beActueelAllinBridge)return;
 window.__beActueelAllinBridge=true;
 var CANVAS='battery-chart';
 var st={rijen:[],aan:true,eb:0.11085,btw:1.21,opslag:0.02,saldeert:true};
 var ctxRef=null;
 function chart(){return (typeof Chart!=='undefined'&&Chart.getChart)?Chart.getChart(CANVAS):null;}
 function euro(v){return '\u20ac '+v.toFixed(3).replace('.',',');}
 function allin(kaal,isExport){return isExport?kaal*st.btw-st.opslag+(st.saldeert?st.eb:0):kaal*st.btw+st.opslag+st.eb;}
 function wikkel(){
  var c=chart(); if(!c||!c.ctx)return;
  if(ctxRef===c.ctx&&c.ctx.__beAllinFillText)return;
  ctxRef=c.ctx;
  var basisFill=(c.ctx.__beAllinOrigFill||c.ctx.fillText).bind(c.ctx);
  c.ctx.__beAllinOrigFill=basisFill;
  c.ctx.fillText=function(tekst,x,y,mw){
   try{
    if(st.aan&&typeof tekst==='string'&&tekst.indexOf('\u20ac')!==-1&&/(?:\u2248|Import|Inkoop|Afname|Export|Teruglever|Injectie|ISP|Nu)/i.test(tekst)){
     var explicietExport=/(?:Export|Teruglever|Injectie)/i.test(tekst);
     var explicietImport=/(?:Import|Inkoop|Afname)/i.test(tekst);
     var isExport=explicietExport;
     var t=c.scales.x?c.scales.x.getValueForPixel(x):null;
     var m=tekst.match(/\u20ac\s*([+\-\u2212]?\s*\d+(?:[.,]\d+)?)/);
     var kaal=m?parseFloat(m[1].replace(/\s/g,'').replace('\u2212','-').replace(',','.')):null;
     var rr=null;
     if(t!=null){
      for(var i=0;i<st.rijen.length;i++){
       if(st.rijen[i].start<=t&&st.rijen[i].end>t){rr=st.rijen[i];break;}
      }
     }
     if(rr&&!explicietExport&&!explicietImport&&kaal!=null&&isFinite(kaal))isExport=Math.abs(kaal-rr.ke)<Math.abs(kaal-rr.ki);
     if((kaal==null||!isFinite(kaal))&&rr)kaal=isExport?rr.ke:rr.ki;
     if(kaal!=null&&isFinite(kaal))tekst=tekst.replace(/\u20ac\s*[+\-\u2212]?\s*\d+(?:[.,]\d+)?/,euro(allin(kaal,isExport)));
    }
   }catch(e){}
   return basisFill(tekst,x,y,mw);
  };
  c.ctx.__beAllinFillText=true;
 }
 function verver(){var c=chart();if(!c)return;if(typeof c.update==='function')c.update('none');if(typeof c.draw==='function')c.draw();}
 document.addEventListener('be-actueel-allin-update',function(){
  var n=document.getElementById('be-actueel-allin-data');if(!n)return;
  try{st=Object.assign(st,JSON.parse(n.textContent||'{}'));wikkel();verver();}
  catch(e){console.error('[BE Actueel all-in bridge]',e);}
 });
 var TG_KW=900000;
 var TG={rijen:[],aan:false,allin:true};
 function tgBedrag(v){return (v<0?'\u2212 ':'+ ')+Math.abs(v).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}
 Chart.register({id:'beTariefBanden',beforeDatasetsDraw:function(c){
  if(!c.canvas||c.canvas.id!=='be-tarief-chart')return;
  var x=c.scales.x,a=c.chartArea,t=c.ctx; if(!x||!a)return;
  t.save(); t.beginPath(); t.rect(a.left,a.top,a.right-a.left,a.bottom-a.top); t.clip();
  t.fillStyle='#ffffff'; t.fillRect(a.left,a.top,a.right-a.left,a.bottom-a.top);
  t.textAlign='center';
  (c.$beKwartieren||[]).forEach(function(q){
   var p1=Math.max(a.left,x.getPixelForValue(q.start));
   var p2=Math.min(a.right,x.getPixelForValue(q.end));
   if(p2<=p1)return;
   if(Math.floor(q.start/TG_KW)%2){t.fillStyle='#f1f2f4';t.fillRect(p1,a.top,p2-p1,a.bottom-a.top);}
   var mid=(p1+p2)/2;
   var lab=q.wacht?'geen prijs':q.carried?'laatst bekend':(q.afrr?'aFRR':'onbalans');
   var live=q.start<=Date.now()&&Date.now()<q.end;
   
   t.font='600 9.5px system-ui,-apple-system,sans-serif';
   t.fillStyle=q.wacht?'#8a8f98':(q.afrr?'#6B3FA0':'#2f6f9f');
   var ruimte=p2-p1-4;
   if(ruimte>=t.measureText(lab).width){
    t.fillText(lab,mid,a.top+11);
   }else if(ruimte>=24){
    t.font='600 8px system-ui,-apple-system,sans-serif';
    t.fillText(q.wacht?'wacht':(q.afrr?'aFRR':'onb.'),mid,a.top+11);
   }else if(ruimte>=8){
    t.save();t.translate(mid,a.top+4);t.rotate(-Math.PI/2);t.textAlign='right';
    t.fillText(lab,0,3);t.restore();
   }
   if(ruimte<24)return;
   if(q.res==null||Math.abs(q.res)<0.005)return;
   var bt=tgBedrag(q.res)+(q.deel?'\u2026':'');
   t.font='700 12px system-ui,-apple-system,sans-serif';
   if(p2-p1<t.measureText(bt).width+8)return;
   t.fillStyle=q.deel?'#8a8f98':(q.res<0?'#dc3545':'#198754');
   t.fillText(bt,mid,a.top+25);
  });
  t.restore();
 }});
 var tgChart=null;
 function tgMaak(){
  if(tgChart&&tgChart.canvas&&tgChart.canvas.isConnected)return tgChart;
  var cv=document.getElementById('be-tarief-chart'); if(!cv)return null;
  var o=Chart.getChart(cv); if(o)o.destroy();
  tgChart=new Chart(cv,{type:'line',data:{datasets:[
   {label:'Afname',borderColor:'#dc3545',borderWidth:2,pointRadius:0,stepped:'before',fill:false,tension:0,segment:{borderDash:[],borderWidth:function(s){return s.p0.raw.beLive?1:2;},borderColor:function(s){return s.p0.raw.beLive?'#dc354588':'#dc3545';}}},
   {label:'Invoeding',borderColor:'#198754',borderWidth:2,pointRadius:0,stepped:'before',fill:false,tension:0,segment:{borderDash:[],borderWidth:function(s){return s.p0.raw.beLive?1:2;},borderColor:function(s){return s.p0.raw.beLive?'#19875488':'#198754';}}}]},
   options:{responsive:true,maintainAspectRatio:false,animation:false,locale:'nl-NL',
    layout:{padding:{top:6}},interaction:{mode:'index',intersect:false},
    scales:{y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{font:{size:11},callback:function(v){return v.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}}}},
    plugins:{legend:{display:true,position:'top',align:'end',labels:{boxWidth:12,boxHeight:2,padding:6,font:{size:11}}},
     tooltip:{callbacks:{title:function(i){
       if(!i.length)return '';
       var tm=i[0].parsed.x;
       var q=(i[0].chart.$beKwartieren||[]).find(function(r){return r.start<=tm&&tm<r.end;});
       return new Date(tm).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})+(q?' · afname '+q.marktImport+' / invoeding '+q.marktExport:'');
      },afterBody:function(i){
       if(!i.length)return [];
       var tm=i[0].parsed.x, q=(i[0].chart.$beKwartieren||[]).find(function(r){return r.start<=tm&&tm<r.end;});
       if(!q)return [];
       var out=[q.carried?'Laatst bekende prijs':Date.now()<q.end?'Lopend · voorlopig':q.provisional===false?'Definitief':'Voorlopig'];
       return out;
      },
      label:function(z){return z.dataset.label+': '+z.parsed.y.toLocaleString('nl-NL',{minimumFractionDigits:3,maximumFractionDigits:3})+' / kWh';}}}}}});
  return tgChart;
 }
 function tgVul(){
  var rij=document.getElementById('be-tarief-row');
  if(rij)rij.hidden=!TG.aan;
  if(!TG.aan)return;
  var ch=tgMaak(); if(!ch)return;
  var bv=chart();
  if(bv&&bv.options.scales&&bv.options.scales.x){
   var bx=bv.options.scales.x;
   ch.options.scales.x=JSON.parse(JSON.stringify({type:bx.type,time:bx.time,bounds:bx.bounds,offset:bx.offset,grid:{display:false},
    ticks:{maxRotation:bx.ticks.maxRotation,autoSkip:bx.ticks.autoSkip,source:bx.ticks.source,font:bx.ticks.font,color:bx.ticks.color,autoSkipPadding:bx.ticks.autoSkipPadding,padding:bx.ticks.padding}}));
   if(bv.scales.x){ch.options.scales.x.min=bv.scales.x.min;ch.options.scales.x.max=bv.scales.x.max;}
  }
  var mn=ch.options.scales.x.min,mx=ch.options.scales.x.max;
  var imp=[],exp=[],kw=[],gezien={}; var nu=Date.now();
  (TG.rijen||[]).forEach(function(r){
   if(mn!=null&&r.end<mn)return;
   if(mx!=null&&r.start>mx)return;
   if(gezien[r.start])return; gezien[r.start]=true;
   kw.push(r);
   if(r.wacht)return;
   var live=r.start<=nu&&nu<r.end;
   if(live){
    // Never connect a settled quarter to a later first observation: stepped
    // interpolation would falsely backdate its price to the quarter boundary.
    imp.push({x:r.start,y:null}); exp.push({x:r.start,y:null});
    var samples=(r.verloop||[]).filter(function(v){return v.t>=r.start&&v.t<=nu;});
    if(samples.length){
     samples.forEach(function(v){
      imp.push({x:v.t,y:v.pi,beLive:true});
      exp.push({x:v.t,y:v.pe,beLive:true});
     });
     var last=samples[samples.length-1];
     imp.push({x:nu,y:last.pi,beLive:true});
     exp.push({x:nu,y:last.pe,beLive:true});
    }else{
     imp.push({x:nu,y:r.pi,beLive:true});
     exp.push({x:nu,y:r.pe,beLive:true});
    }
   }else{
    imp.push({x:r.start,y:r.pi,beLive:false},{x:r.end,y:r.pi,beLive:false});
    exp.push({x:r.start,y:r.pe,beLive:false},{x:r.end,y:r.pe,beLive:false});
   }
  });
  ch.data.datasets[0].data=imp; ch.data.datasets[1].data=exp;
  // Match both plot edges in screen coordinates, including differing canvas offsets.
  if(bv&&bv.chartArea&&bv.scales.x){
   var srcRect=bv.canvas.getBoundingClientRect(),dstRect=ch.canvas.getBoundingClientRect();
   var srcRatio=srcRect.width/bv.width,dstRatio=dstRect.width/ch.width;
   if(srcRatio>0&&dstRatio>0){
    var left=(srcRect.left+bv.chartArea.left*srcRatio-dstRect.left)/dstRatio;
    var right=(srcRect.left+bv.chartArea.right*srcRatio-dstRect.left)/dstRatio;
    ch.options.layout.padding={top:6,left:0,right:Math.max(0,ch.width-right)};
    ch.options.scales.y.afterFit=function(axis){axis.width=Math.max(0,left);};
    var ticks=bv.scales.x.ticks.map(function(t){return {value:t.value};});
    ch.options.scales.x.afterBuildTicks=function(axis){axis.ticks=ticks;};
    ch.options.scales.x.ticks.autoSkip=false;
   }
  }
  ch.$beKwartieren=kw; ch.update('none');
 }
 document.addEventListener('be-tarief-update',function(){
  var n=document.getElementById('be-tarief-data'); if(!n)return;
  try{TG=Object.assign(TG,JSON.parse(n.textContent||'{}'));tgVul();}
  catch(e){console.error('[BE tariefgrafiek bridge]',e);}
 });
 var initial=document.getElementById('be-actueel-allin-data');
 try{if(initial)st=Object.assign(st,JSON.parse(initial.textContent||'{}'));}catch(e){}
 var initialTarief=document.getElementById('be-tarief-data');
 try{if(initialTarief)TG=Object.assign(TG,JSON.parse(initialTarief.textContent||'{}'));}catch(e){}
 wikkel();tgVul();
 setInterval(function(){ if(TG.aan) tgVul(); },3000);
 setInterval(wikkel,3000);
 console.log('[BE Actueel all-in bridge] actief');
})();
