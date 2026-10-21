  function filterNativeLegend(chart){
    const native=(chart.config?.options||chart.options)?.plugins?.legend;
    if(!native)return;
    const labels=native.labels||(native.labels={});
    if(labels.filter?.beOwnSocLegendFilter)return;
    const previous=labels.filter;
    function filter(item,data){
      return !data.datasets[item.datasetIndex]?.beOwnSOC&&(!previous||previous.call(this,item,data));
    }
    filter.beOwnSocLegendFilter=true;
    labels.filter=filter;
  }
  function legend(chart){
    const canvas=chart.canvas;
    let row=document.querySelector('[data-be-soc-legend="'+canvas.id+'"]');
    if(window.BESocHistory?.active(chart)){
      document.querySelectorAll('[data-be-soc-legend="soc-chart"]').forEach(node=>node.remove());
      window.BESocHistory.legend(chart,cfg.show_kwh!==false,()=>{
        cfg.show_kwh=cfg.show_kwh===false;localStorage.setItem(key,JSON.stringify(cfg));render();
      });
      return;
    }
    // Actueel already has the full-size Coulomb readout beside the SOC value.
    if(canvas.id==='soc-chart'){
      document.querySelectorAll('[data-be-soc-legend="soc-chart"]').forEach(node=>node.remove());
      return;
    }
    if(!row){
      let host=canvas.parentElement,existing=null;
      for(let depth=0;host&&depth<3;depth++,host=host.parentElement){
        const candidate=host.querySelector('[class*="legend-soc"], [id*="soc-legend"], [aria-label="SOC reeksen"]');
        if(candidate){existing=candidate;break;}
      }
      row=document.createElement('span');row.dataset.beSocLegend=canvas.id;row.className='be-soc-legend';
      if(existing){existing.dataset.beSocCompact='';row.dataset.beSocInline='';existing.append(row);}
      else canvas.parentElement.insertAdjacentElement('beforebegin',row);
      for(const [group,label,color] of [['kwh','Coulombtelling in/uit','var(--be-coulomb-line,#0891b2)']]){
        const button=document.createElement('button');button.type='button';button.className='be-soc-series-toggle';
        button.dataset.beSocGroup=group;
        button.innerHTML='<span class="be-soc-series-swatch" aria-hidden="true" style="background:'+color+'"></span><span>'+label+'</span>';
        button.onclick=()=>{cfg['show_'+group]=cfg['show_'+group]===false;localStorage.setItem(key,JSON.stringify(cfg));render();};
        row.append(button);
      }
    }
    if(!row.hasAttribute('data-be-soc-inline')){
      const rect=canvas.getBoundingClientRect(),scale=chart.width>0?rect.width/chart.width:1;
      row.style.paddingLeft=Math.max(0,(chart.chartArea?.left||0)*scale)+'px';
    }
    for(const button of row.querySelectorAll('button')){
      const visible=cfg['show_'+button.dataset.beSocGroup]!==false;
      button.setAttribute('aria-pressed',String(visible));
    }
  }
