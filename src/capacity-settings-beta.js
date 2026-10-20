(function(root){
  'use strict';
  const numeric=v=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:[.,]\d+)?$/.test(v.trim())?Number(v.trim().replace(',','.')):NaN;
  function resolve(value){
    const c=value&&typeof value==='object'?value:{};
    if(c.capacityMode==='fcc'){
      const fccAh=numeric(c.fccAh),packCount=numeric(c.packCount),nominalVoltage=numeric(c.nominalVoltage);
      if(!(fccAh>0&&Number.isInteger(packCount)&&packCount>=1&&packCount<=100&&nominalVoltage>=1&&nominalVoltage<=1000))return null;
      const capacity=fccAh*packCount*nominalVoltage/1000;
      return capacity>=.01&&capacity<=1000?{mode:'fcc',capacity,fccAh,packCount,nominalVoltage}:null;
    }
    if(c.capacityMode&&c.capacityMode!=='kwh')return null;
    const capacity=numeric(c.capacityKwh??c.capacity);
    return capacity>=.01&&capacity<=1000?{mode:'kwh',capacity}:null;
  }
  function readForm(form,previous={}){
    const next={...previous,capacityMode:form.elements.capacityMode.value,
      capacityKwh:numeric(form.elements.capacity.value),fccAh:numeric(form.elements.fccAh.value),
      packCount:numeric(form.elements.packCount.value),nominalVoltage:numeric(form.elements.nominalVoltage.value)};
    const resolved=resolve(next);return resolved?{...next,capacity:resolved.capacity}:null;
  }
  root.BECapacity={numeric,resolve,readForm};
})(typeof window!=='undefined'?window:globalThis);
