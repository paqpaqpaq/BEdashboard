/* BE-only energy balance. Positive bo is battery output in W. */
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
    let stored=null,input=0,output=0,gaps=0,uncertain=false,lastAnchor=null,lowMode='ready',lowMinimum=null,highMode='ready',highMaximum=null,lastRaw=null;
    const points=[],events=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i],prev=rows[i-1],raw=rawValid(r[1])?r[1]:null;let gap=false,change=null;
      if(prev){
        const dt=r[0]-prev[0];
        if(Number.isFinite(prev[2])&&Number.isFinite(r[2])){
          const e=energy(prev[2],r[2],dt);input+=e.input;output+=e.output;change=e.input-e.output;
          if(stored!==null)stored+=change;
          if(dt>c.maxGapMs){gap=true;gaps++;uncertain=true;}
        }else{gap=true;gaps++;uncertain=true;}
      }
      const explicit=anchors.get(r[0]),checkpoint=!!(explicit?.lowState||explicit?.highState||explicit?.boundaryState);
      let anchor=explicit;
      if(stored===null&&!anchor&&raw!==null)anchor={t:r[0],soc:raw,kind:'Start uit BE-SOC'};
      const charging=change!==null?change>0:!prev&&!checkpoint&&Number.isFinite(r[2])&&r[2]<0;
      const discharging=change!==null?change<0:!prev&&!checkpoint&&Number.isFinite(r[2])&&r[2]>0;
      if(checkpoint){
        if(explicit.lowState){lowMode=explicit.lowState.mode;lowMinimum=explicit.lowState.minimum;}
        if(explicit.highState){highMode=explicit.highState.mode;highMaximum=explicit.highState.maximum;}
        if(explicit.boundaryState)lastRaw=explicit.boundaryState.lastRaw;
      }else if(explicit){lowMode=highMode='released';lowMinimum=highMaximum=null;}
      else{
        if(lowMode==='released'&&raw!==null&&raw>10&&change!==null&&change<=0&&r[2]>=0){lowMode='ready';lowMinimum=null;}
        if(highMode==='released'&&raw!==null&&raw<95&&change!==null&&change>=0&&r[2]<=0){highMode='ready';highMaximum=null;}
        if(lowMode==='ready'&&raw!==null&&raw<=10){
          if(charging)lowMode='released';
          else{lowMode='tracking';lowMinimum=raw;anchor={t:r[0],soc:raw,kind:'Laagste BE-SOC · volgen'};}
        }
        if(lowMode==='tracking'){
          if(charging)lowMode='released';
          else if(raw!==null){
            const lower=lowMinimum===null||raw<lowMinimum;if(lower)lowMinimum=raw;
            anchor={t:r[0],soc:lowMinimum,kind:'Laagste BE-SOC · volgen',silent:!lower&&anchor?.kind!=='Laagste BE-SOC · volgen'};
            highMode='ready';highMaximum=null;
          }
        }
        if(highMode==='ready'&&raw!==null&&raw>=95){
          if(discharging)highMode='released';
          else{highMode='tracking';highMaximum=raw;anchor={t:r[0],soc:raw,kind:'Hoogste BE-SOC · volgen'};}
        }
        if(highMode==='tracking'){
          if(discharging)highMode='released';
          else if(raw!==null){
            const higher=highMaximum===null||raw>highMaximum;if(higher)highMaximum=raw;
            anchor={t:r[0],soc:highMaximum,kind:'Hoogste BE-SOC · volgen',silent:!higher&&anchor?.kind!=='Hoogste BE-SOC · volgen'};
            lowMode='ready';lowMinimum=null;
          }
        }
      }
      // A real arrival at 5% or 100% is an independent calibration, even
      // when a prior energy reversal released the broad 10%/95% tracker.
      // A plateau must not pin the counter after charging/discharging reverses.
      if(!explicit&&(raw===5||raw===100)&&raw!==lastRaw){
        anchor={t:r[0],soc:raw,kind:'BE-SOC '+raw+'% · ijking'};
        if(raw===5){lowMode=charging?'released':'tracking';lowMinimum=5;highMode='ready';highMaximum=null;}
        else{highMode=discharging?'released':'tracking';highMaximum=100;lowMode='ready';lowMinimum=null;}
      }
      if(raw!==null)lastRaw=raw;
      if(anchor){
        const before=stored===null?null:stored/c.capacity*100;
        stored=c.capacity*anchor.soc/100;if(!anchor.silent||raw===anchor.soc)uncertain=false;
        if(anchor.statsReference){
          const saved=anchor.statsReference;
          lastAnchor={...saved.reference,input:input-saved.input,output:output-saved.output};
        }else{
          lastAnchor={...anchor,correction:before===null?null:anchor.soc-before,input,output};
          if(!anchor.silent)events.push(lastAnchor);
        }
      }
      points.push({t:r[0],raw,power:r[2],soc:stored===null?null:stored/c.capacity*100,input,output,gap,uncertain,anchor:anchor||null,
        lowState:{mode:lowMode,minimum:lowMinimum},highState:{mode:highMode,maximum:highMaximum},boundaryState:{lastRaw},reference:lastAnchor,
        sinceInput:lastAnchor?Math.max(0,input-lastAnchor.input):0,sinceOutput:lastAnchor?Math.max(0,output-lastAnchor.output):0});
    }
    return {points,input,output,gaps,lastAnchor,events,uncertain};
  }
  function at(points,t,maxGapMs=defaults.maxGapMs){
    let lo=0,hi=points.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(points[m].t<t)lo=m+1;else hi=m-1;}
    if(points[lo]?.t===t)return points[lo].soc;
    const a=points[lo-1],b=points[lo];
    const tracking=a&&b&&((a.lowState?.mode==='tracking'&&b.lowState?.mode==='tracking')||(a.highState?.mode==='tracking'&&b.highState?.mode==='tracking'));
    if(!a||!b||a.soc===null||b.soc===null||b.gap||(b.anchor&&!tracking)||b.t-a.t>maxGapMs)return null;
    return a.soc+(b.soc-a.soc)*(t-a.t)/(b.t-a.t);
  }
  root.BEEnergySOC={defaults,valid,energy,calculate,at};
})(typeof window!=='undefined'?window:globalThis);
