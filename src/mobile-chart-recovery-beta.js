(function(){
  'use strict';
  if(window.__beChartVisibility606)return;window.__beChartVisibility606=true;
  const ids=['battery-chart','be-tarief-chart','soc-chart','soc-forecast-chart'],seen=new WeakMap(),watched=new WeakSet();
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;repair();});}
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  const intersect=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))schedule();}):null;
  function repair(){
    if(document.hidden)return;
    const C=window.Chart;if(!C?.getChart)return;
    for(const id of ids){
      const canvas=document.getElementById(id);if(!canvas?.isConnected)continue;
      const parent=canvas.parentElement;if(!parent)continue;
      if(!watched.has(parent)){resize?.observe(parent);intersect?.observe(parent);watched.add(parent);}
      const box=parent.getBoundingClientRect(),chart=C.getChart(canvas),before=seen.get(canvas);
      if(!chart||!(box.width>0&&box.height>0)||canvas.getClientRects().length===0){seen.delete(canvas);continue;}
      const changed=!before||before.chart!==chart||Math.abs(before.w-box.width)>1||Math.abs(before.h-box.height)>1;
      if(changed||!(chart.width>0&&chart.height>0)){
        // Remember first: resize/update may synchronously notify other extensions.
        seen.set(canvas,{chart,w:box.width,h:box.height});
        try{chart.resize();chart.update('none');}catch(e){seen.delete(canvas);console.warn('[BE grafiekherstel]',id,e);}
      }
    }
  }
  new MutationObserver(records=>{
    const added=records.flatMap(r=>Array.from(r.addedNodes));
    if(added.some(n=>n.nodeType===1&&(n.matches?.('canvas')||n.querySelector?.('canvas'))))schedule();
  }).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('pageshow',schedule);
  window.addEventListener('resize',schedule);
  window.addEventListener('orientationchange',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  setInterval(schedule,2000);schedule();
})();
