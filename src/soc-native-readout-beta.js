(function(root){
  'use strict';
  const id='be-coulomb-native-readout',own='.be-own-soc,[data-be-coulomb-readout]';
  const text=e=>(e.textContent||'').replace(/\s+/g,' ').trim();
  const percent=e=>/^\d+(?:[.,]\d+)?\s*%$/.test(text(e));
  function metric(label){
    for(let e=label,depth=0;e&&depth<4;e=e.parentElement,depth++){
      if(e.matches?.('body,main,section,aside,form')||e.querySelector?.('canvas'))break;
      const leaves=[...e.querySelectorAll('span,div,p,strong,b')].filter(n=>!n.children.length&&!n.closest(own));
      if(leaves.some(percent)&&!/\d\s*(?:kWh|kW|W|€)\b/.test(text(e)))return e;
    }
    return null;
  }
  function target(){
    const labels=[...document.querySelectorAll('span,div,p,dt,label')].filter(e=>!e.children.length&&!e.closest(own)&&/^(?:SOC|SOC\s*\(%\)|Laadtoestand(?:\s*\(SOC\))?|State of charge(?:\s*\(SOC\))?)$/i.test(text(e)));
    for(const label of labels){const row=metric(label);if(row)return row;}
    for(const selector of ['#current-soc','#battery-soc','#soc-value','[data-metric="soc"]','[data-soc-value]']){
      const value=document.querySelector(selector);
      if(value&&!value.closest(own)&&percent(value))return value.closest('.summary-compact-metric')||value.parentElement;
    }
    return null;
  }
  function render(view){
    const row=target();let el=document.getElementById(id);
    if(!row){el?.remove();return;}
    if(!el){
      el=document.createElement('div');el.id=id;el.setAttribute('data-be-coulomb-readout','');
      el.style.cssText='display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex:0 0 100%;grid-column:1 / -1;min-width:0;margin-top:5px;color:#0891b2;font:inherit;font-variant-numeric:tabular-nums';
      const label=document.createElement('span'),value=document.createElement('strong');
      label.textContent='Coulombtelling in/uit';label.style.cssText='font-size:11px;line-height:1.4';
      value.style.cssText='color:#0891b2;font-size:inherit;font-weight:650;white-space:nowrap';
      el.append(label,value);
    }
    if(el.parentElement!==row){row.style.flexWrap='wrap';row.append(el);}
    const value=el.querySelector('strong');if(value.textContent!==view.soc)value.textContent=view.soc;
    if(el.title!==view.state)el.title=view.state;
  }
  root.BESocNativeReadout={render,target};
})(window);
