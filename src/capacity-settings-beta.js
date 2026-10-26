(function(root){
  'use strict';
  const numeric=v=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:[.,]\d+)?$/.test(v.trim())?Number(v.trim().replace(',','.')):NaN;
  function resolve(value){
    const c=value&&typeof value==='object'?value:{};
    if(c.capacityMode==='fcc'){
      const fccAh=Math.min(330,numeric(c.fccAh)),packCount=numeric(c.packCount);
      if(!(fccAh>0&&Number.isInteger(packCount)&&packCount>=1&&packCount<=100))return null;
      const capacityAh=fccAh*packCount,capacity=capacityAh*root.BEMeasuredVoltage.referenceVoltage/1000;
      return capacity>=.01&&capacity<=1000?{mode:'fcc',capacity,capacityAh,fccAh,packCount}:null;
    }
    if(c.capacityMode&&c.capacityMode!=='kwh')return null;
    const capacity=numeric(c.capacityKwh??c.capacity);
    return capacity>=.01&&capacity<=1000?{mode:'kwh',capacity,capacityAh:capacity*1000/root.BEMeasuredVoltage.referenceVoltage}:null;
  }
  function readForm(form,previous={}){
    const {nominalVoltage,...retained}=previous;
    const next={...retained,capacityMode:form.elements.capacityMode.value,
      capacityKwh:numeric(form.elements.capacity.value),fccAh:Math.min(330,numeric(form.elements.fccAh.value)),
      packCount:numeric(form.elements.packCount.value)};
    const resolved=resolve(next);return resolved?{...next,capacity:resolved.capacity}:null;
  }
  root.BECapacity={numeric,resolve,readForm};
})(typeof window!=='undefined'?window:globalThis);
