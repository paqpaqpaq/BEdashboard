/* BE-only energy balance. bo: W out of battery; negative means charging.
   Only BE measurements and locally stored observations are used. */
(function(root){
  'use strict';
  const defaults={capacity:48.2,chargeEfficiency:1,dischargeEfficiency:1,maxGapMs:360000,auto:true};
  const rawValid=v=>Number.isFinite(v)&&v>=0&&v<=100;
  function valid(r){return Array.isArray(r)&&Number.isFinite(r[0])&&r[0]>0&&(Number.isFinite(r[2])||r[2]===null);}
  function energy(p0,p1,ms){
    if(p0*p1<0){const f=Math.abs(p0)/(Math.abs(p0)+Math.abs(p1)),a=energy(p0,0,ms*f),b=energy(0,p1,ms*(1-f));return {input:a.input+b.input,output:a.output+b.output};}
    const e=(p0+p1)/2*ms/3600000000;return {input:Math.max(0,-e),output:Math.max(0,e)};
  }
  function calculate(rows,settings={},manual=[]){
    const c={...defaults,...settings};if(!(c.capacity>0))throw Error('Ongeldige accucapaciteit');
    rows=[...new Map(rows.filter(valid).map(r=>[r[0],r])).values()].sort((a,b)=>a[0]-b[0]);
    const anchors=new Map(manual.filter(a=>Number.isFinite(a.t)&&rawValid(a.soc)).map(a=>[a.t,a]));
    let stored=null,input=0,output=0,gaps=0,uncertain=false,lastAnchor=null,lastRaw=null,lowMode='ready',lowMinimum=null;
    const points=[],events=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i],prev=rows[i-1],raw=rawValid(r[1])?r[1]:null;let gap=false,change=null;
      if(prev){
        const dt=r[0]-prev[0];
        if(Number.isFinite(prev[2])&&Number.isFinite(r[2])){
          // Integrate EVERY available power interval, including sparse history.
          const e=energy(prev[2],r[2],dt);input+=e.input;output+=e.output;change=e.input-e.output;
          if(stored!==null)stored+=e.input-e.output;
          if(dt>c.maxGapMs){gap=true;gaps++;uncertain=true;}
        }else{gap=true;gaps++;uncertain=true;}
      }
      let anchor=anchors.get(r[0]);
      if(stored===null&&!anchor&&raw!==null)anchor={t:r[0],soc:raw,kind:'Start uit BE-SOC'};
      // Follow the low-water mark during discharge; release on net energy in.
      // Crossing 10% upwards never creates an anchor.
      const charging=change!==null?change>0:!prev&&!anchor?.lowState&&Number.isFinite(r[2])&&r[2]<0;
      if(anchor?.lowState){lowMode=anchor.lowState.mode;lowMinimum=anchor.lowState.minimum;}
      else if(anchors.has(r[0])){lowMode='released';lowMinimum=null;}
      if(lowMode==='released'&&raw!==null&&raw>10&&change!==null&&change<=0&&r[2]>=0){lowMode='ready';lowMinimum=null;}
      if(lowMode==='ready'&&raw!==null&&raw<=10){
        if(charging)lowMode='released';
        else{lowMode='tracking';lowMinimum=raw;anchor={t:r[0],soc:raw,kind:'Laagste BE-SOC · volgen'};}
      }
      if(lowMode==='tracking'){
        if(charging)lowMode='released';
        else if(raw!==null){
          const lower=lowMinimum===null||raw<lowMinimum;
          if(lower)lowMinimum=raw;
          anchor={t:r[0],soc:lowMinimum,kind:'Laagste BE-SOC · volgen',silent:!lower&&anchor?.kind!=='Laagste BE-SOC · volgen'};
        }
      }
      if(raw!==null){
        const crossedHigh=lastRaw!==null&&((lastRaw<95&&raw>95)||(lastRaw>95&&raw<95));
        if(raw===95||crossedHigh){anchor={t:r[0],soc:raw,kind:'Automatisch 95% · BE-SOC'};lowMode='ready';lowMinimum=null;}
        lastRaw=raw;
      }
      if(anchor){
        const before=stored===null?null:stored/c.capacity*100;
        stored=c.capacity*anchor.soc/100;if(!anchor.silent||raw===anchor.soc)uncertain=false;
        if(!anchor.silent){lastAnchor={...anchor,correction:before===null?null:anchor.soc-before};events.push(lastAnchor);}
      }
      points.push({t:r[0],raw,power:r[2],soc:stored===null?null:stored/c.capacity*100,input,output,gap,uncertain,anchor:anchor||null,lowState:{mode:lowMode,minimum:lowMinimum}});
    }
    return {points,input,output,gaps,lastAnchor,events,uncertain};
  }
  function at(points,t,maxGapMs=defaults.maxGapMs){
    let lo=0,hi=points.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(points[m].t<t)lo=m+1;else hi=m-1;}
    if(points[lo]?.t===t)return points[lo].soc;
    const a=points[lo-1],b=points[lo];if(!a||!b||a.soc===null||b.soc===null||b.gap||(b.anchor&&!(a.lowState?.mode==='tracking'&&b.lowState?.mode==='tracking'))||b.t-a.t>maxGapMs)return null;
    return a.soc+(b.soc-a.soc)*(t-a.t)/(b.t-a.t);
  }
  root.BEEnergySOC={defaults,valid,energy,calculate,at};
})(typeof window!=='undefined'?window:globalThis);
