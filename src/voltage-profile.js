/* Measured 16S LFP voltage profile: RS232 logs 9–12, 19 and 25 October 2026.
   Reported BMS SOC selects voltage; SOC itself is integrated from estimated Ah.
   No fixed loss factor. This is a voltage estimate, not a voltage sensor. */
(function(root){
  'use strict';
  const profile={"series_cells_per_pack":16,"reference_ah_per_pack":330.0,"models":{"charge":{"soc_percent":[0.0,2.0,5.0,8.0,10.0,15.0,20.0,30.0,40.0,50.0,60.0,70.0,80.0,85.0,90.0,95.0,98.0,100.0],"zero_current_voltage_v":[45.04873667,46.21263523,48.01104624,48.01104624,51.33626837,51.63642474,52.110589,52.93937053,52.93937053,53.05079145,53.34006213,53.50776963,53.62106119,54.04416067,54.80427031,55.01987558,55.94997012,55.94997012],"voltage_per_c_rate_v":4.19762928},"discharge":{"soc_percent":[0.0,2.0,5.0,8.0,10.0,15.0,20.0,30.0,40.0,50.0,60.0,70.0,80.0,85.0,90.0,95.0,98.0,100.0],"zero_current_voltage_v":[44.92394152,47.65484755,47.65484755,47.65484755,47.65484755,48.37198358,51.17052752,52.63147204,52.63147204,52.73339626,53.05859432,53.32539778,53.32539778,53.32539778,53.32539778,53.32539778,53.50611041,55.35587888],"voltage_per_c_rate_v":4.64643859}},"id":"rs232-16s-20261026-v1","minimumSoc":4.0024,"minimumVoltage":46.643,"maximumVoltage":56.33};
  const finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function base(direction,soc){
    const m=profile.models[direction],s=clamp(finite(soc)?soc:50,profile.minimumSoc,100),x=m.soc_percent,y=m.zero_current_voltage_v;
    let i=1;while(i<x.length-1&&x[i]<s)i++;
    return y[i-1]+(y[i]-y[i-1])*(s-x[i-1])/(x[i]-x[i-1]);
  }
  // Mean of the measured charge/discharge curves, integrated over SOC.
  // Used only for kWh/Ah capacity display; actual counting uses varying voltage.
  const referenceVoltage=(()=>{let total=0;for(let s=0;s<100;s+=.5)total+=(base('charge',s+.25)+base('discharge',s+.25))*.25;return total/100;})();
  // Ah-SOC is not an energy percentage. Integrate the same reference curve
  // over the remaining charge; this estimates energy without changing SOC.
  // Keep the existing measured range and its uncertainty at the bottom.
  const energyCurve=(()=>{const values=[0];for(let s=0;s<100;s+=.5)
    values.push(values.at(-1)+(base('charge',s+.25)+base('discharge',s+.25))*.25);
    return values.map(v=>v/values.at(-1));})();
  function energyKwh(soc,capacity){
    if(!finite(soc)||!finite(capacity)||capacity<=0)return null;
    const position=clamp(soc,0,100)*2,index=Math.floor(position);
    const fraction=index===200?1:energyCurve[index]+(energyCurve[index+1]-energyCurve[index])*(position-index);
    return capacity*fraction;
  }
  function current(powerOut,soc,capacityAh){
    if(!finite(powerOut)||!finite(capacityAh)||capacityAh<=0)return null;
    if(powerOut===0)return 0;
    const p=-powerOut,direction=p>0?'charge':'discharge',u=base(direction,soc),r=profile.models[direction].voltage_per_c_rate_v/capacityAh;
    const discriminant=u*u+4*r*p;
    let i=discriminant>0?2*p/(u+Math.sqrt(discriminant)):p/profile.minimumVoltage;
    const voltage=clamp(i?p/i:u,profile.minimumVoltage,profile.maximumVoltage);
    return p/voltage; // Positive current charges the battery.
  }
  function integrate(p0,p1,ms,s0,s1,capacityAh){
    if(p0*p1<0){const f=Math.abs(p0)/(Math.abs(p0)+Math.abs(p1)),s=s0+(s1-s0)*f;
      const a=integrate(p0,0,ms*f,s0,s,capacityAh),b=integrate(0,p1,ms*(1-f),s,s1,capacityAh);
      return {input:a.input+b.input,output:a.output+b.output};}
    const a=current(p0,s0,capacityAh),b=current(p1,s1,capacityAh);
    if(a===null||b===null)return null;
    const ah=(a+b)*.5*ms/3600000;return {input:Math.max(0,ah),output:Math.max(0,-ah)};
  }
  root.BEMeasuredVoltage={id:profile.id,profile,referenceVoltage,base,current,integrate,energyKwh};
})(typeof window!=='undefined'?window:globalThis);
