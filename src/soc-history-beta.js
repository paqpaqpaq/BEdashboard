(function(root){
  'use strict';
  const active=chart=>chart.canvas?.id==='soc-chart'&&/\/customer\/[^/]+\/history\/?$/.test(location.pathname);
  function linuxChromium(){
    const ua=root.navigator?.userAgent||'';
    return /Linux|X11/.test(ua)&&!/Android/.test(ua)&&/(?:Chrome|Chromium|Edg)\//.test(ua);
  }
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
      const data=linuxChromium()?(d._data||d.data):d.data;
      for(let i=0;i<(data?.length||0);i++){
        const p=data[i],x=time(Array.isArray(p)?p[0]:p&&typeof p==='object'?p.x:chart.data.labels?.[i]);
        if(Number.isFinite(x)){min=Math.min(min,x);max=Math.max(max,x);}
      }
    }
    const start=time(options.min),end=time(options.max);
    if(Number.isFinite(start))min=start;
    if(Number.isFinite(end))max=end;
    return Number.isFinite(min)&&Number.isFinite(max)&&min<=max?{min,max}:null;
  }
  // Chart.js' generic decimator mixes null boundaries into pixel buckets and
  // moves their timestamps. Keep each uninterrupted run separate on Linux
  // Chromium, retaining original first/min/max/last samples per screen column.
  function project(chart,points,extent){
    if(!active(chart)||!linuxChromium())return points;
    const width=Math.max(1,Math.ceil(chart.chartArea?.width||chart.width||chart.canvas?.clientWidth||1000));
    if(points.length<=width*4||!extent||!(extent.max>extent.min))return points;
    const out=[];let bucket=null,group=[];
    function flush(){
      if(!group.length)return;
      let min=0,max=0;
      for(let i=1;i<group.length;i++){if(group[i].y<group[min].y)min=i;if(group[i].y>group[max].y)max=i;}
      [...new Set([0,min,max,group.length-1])].sort((a,b)=>a-b).forEach(i=>out.push(group[i]));group=[];
    }
    for(const p of points){
      if(!Number.isFinite(p.x))continue;
      if(!Number.isFinite(p.y)){
        flush();bucket=null;
        const gap=p.y===null?p:{x:p.x,y:null};
        if(out.length&&out[out.length-1].y===null)out[out.length-1]=gap;else out.push(gap);
        continue;
      }
      const column=Math.floor((p.x-extent.min)/(extent.max-extent.min)*width);
      if(column!==bucket){flush();bucket=column;}
      group.push(p);
    }
    flush();return out;
  }
  const controllers=new WeakMap();
  const plugin={id:'beSocHistoryRendering',beforeElementsUpdate(chart){
    const protect=active(chart)&&linuxChromium();
    chart.data.datasets.forEach((d,index)=>{
      if(!d.beOwnSOC)return;
      const controller=chart.getDatasetMeta(index)?.controller;
      if(!protect){
        if(controller&&controllers.has(controller)){controller.supportsDecimation=controllers.get(controller);controllers.delete(controller);}
        return;
      }
      // The built-in decimator runs first. Restore only our own original input
      // before Chart.js builds elements; leave native SOC and its options alone.
      if(d._data&&Object.getOwnPropertyDescriptor(d,'data')?.get){
        const original=d._data;delete d._decimated;delete d._data;
        Object.defineProperty(d,'data',{configurable:true,enumerable:true,writable:true,value:original});
      }
      if(controller){if(!controllers.has(controller))controllers.set(controller,controller.supportsDecimation);controller.supportsDecimation=false;}
      d.spanGaps=false;d.stepped=false;d.tension=0;
    });
  }};
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
      style.textContent=':root :is(#be-soc-colour-priority,[data-be-history-coulomb])[aria-pressed]::before{background:var(--be-coulomb-line,#0891b2)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--be-coulomb-line,#0891b2) 14%,transparent)!important}[data-be-history-coulomb][aria-pressed="false"]{opacity:.5;text-decoration:line-through}[data-be-history-coulomb]:focus-visible{outline:2px solid var(--be-coulomb-line,#0891b2);outline-offset:3px}';
      (document.head||document.documentElement).append(style);
    }
    if(label)button.style.font=getComputedStyle(label).font;
    button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-controls',chart.canvas.id);
    button.title=visible?'Coulombtelling verbergen':'Coulombtelling tonen';
    button.onclick=toggle;
  }
  root.BESocHistory={active,range,project,plugin,legend};
})(window);
