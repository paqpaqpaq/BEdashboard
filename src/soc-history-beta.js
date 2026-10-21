(function(root){
  'use strict';
  const active=chart=>chart.canvas?.id==='soc-chart'&&/\/customer\/[^/]+\/history\/?$/.test(location.pathname);
  function range(chart){
    // Read the current native input, never the previous, already expanded axis
    // or parsed metadata from the period that was just replaced.
    const native=chart.data.datasets.filter(d=>!d.beOwnSOC);
    const axis=native[0]?.xAxisID||'x',scale=chart.scales?.[axis];
    const options=(chart.config?.options||chart.options)?.scales?.[axis]||{};
    function time(value){
      if(value==null||value==='')return NaN;
      if(Number.isFinite(value))return value;
      if(value instanceof Date)return +value;
      const parsed=scale?.parse?.(value);
      return Number.isFinite(parsed)?parsed:typeof value==='string'?Date.parse(value):NaN;
    }
    let min=Infinity,max=-Infinity;
    for(const d of native){
      if((d.xAxisID||'x')!==axis)continue;
      for(let i=0;i<(d.data?.length||0);i++){
        const p=d.data[i],x=time(Array.isArray(p)?p[0]:p&&typeof p==='object'?p.x:chart.data.labels?.[i]);
        if(Number.isFinite(x)){min=Math.min(min,x);max=Math.max(max,x);}
      }
    }
    const start=time(options.min),end=time(options.max);
    if(Number.isFinite(start))min=start;
    if(Number.isFinite(end))max=end;
    return Number.isFinite(min)&&Number.isFinite(max)&&min<=max?{min,max}:null;
  }
  function legend(chart,visible,toggle){
    const frame=chart.canvas.closest('.history-chart-soc-row');
    const header=frame?.querySelector('.history-chart-soc-header');
    if(!header)return;
    const label=header.querySelector('.history-chart-soc-label:not([data-be-history-coulomb])');
    let button=header.querySelector('[data-be-history-coulomb]');
    if(!button){
      button=document.createElement('button');button.type='button';
      button.dataset.beHistoryCoulomb='';button.className='history-chart-soc-label';
      button.textContent='Coulombtelling in/uit';
      button.style.cssText='border:0;background:transparent;color:inherit;padding:6px 0;min-height:44px;cursor:pointer;font:inherit;white-space:normal;text-align:left';
      header.style.display='flex';header.style.flexWrap='wrap';header.style.alignItems='center';header.style.gap='6px 24px';
      header.append(button);
    }
    const styleId='be-history-soc-legend-style';
    if(!document.getElementById(styleId)){
      const style=document.createElement('style');style.id=styleId;
      style.textContent='[data-be-history-coulomb]::before{background:#0891b2!important;box-shadow:0 0 0 3px rgba(8,145,178,.14)!important}[data-be-history-coulomb][aria-pressed="false"]{opacity:.5;text-decoration:line-through}[data-be-history-coulomb]:focus-visible{outline:2px solid #0891b2;outline-offset:3px}';
      (document.head||document.documentElement).append(style);
    }
    if(label)button.style.font=getComputedStyle(label).font;
    button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-controls',chart.canvas.id);
    button.title=visible?'Coulombtelling verbergen':'Coulombtelling tonen';
    button.onclick=toggle;
  }
  root.BESocHistory={active,range,legend};
})(window);
