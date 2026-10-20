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
    const header=document.querySelector('#power-chart-content .energy-chart-soc-header');
    if(header?.querySelector('.energy-chart-soc-value'))return header;
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
      el.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 100%;grid-column:1 / -1;min-width:0;margin-top:0;color:#0891b2;font:inherit;font-variant-numeric:tabular-nums';
      const label=document.createElement('span'),value=document.createElement('strong');
      label.className='energy-chart-soc-label be-own-soc-label';label.textContent='Coulombtelling in/uit';label.style.color='#0891b2';
      value.className='energy-chart-soc-value';value.style.cssText='color:#0891b2;white-space:nowrap';
      el.append(label,value);
    }
    if(el.parentElement!==row){row.style.flexWrap='wrap';row.style.rowGap='4px';row.append(el);}
    if(typeof getComputedStyle==='function'){
      const label=row.querySelector('.energy-chart-soc-label'),value=row.querySelector('.energy-chart-soc-value');
      for(const [original,copy] of [[label,el.querySelector('span')],[value,el.querySelector('strong')]]){
        if(original&&original!==copy){const font=getComputedStyle(original).font;if(font&&copy.style.font!==font)copy.style.font=font;}
      }
    }
    const shown=view.compactSoc??view.soc;
    const value=el.querySelector('strong');if(value.textContent!==shown)value.textContent=shown;
    if(el.title!==view.state)el.title=view.state;
  }
  root.BESocNativeReadout={render,target};
})(window);
