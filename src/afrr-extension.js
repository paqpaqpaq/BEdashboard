/* Private extension adapter. Keys never enter MAIN-world scripts or DOM. */
(function(){
  'use strict';
  globalThis.BEAfrrExtensionManager={
    async get(key,fallback){const saved=await chrome.storage.local.get(key);return saved[key]??fallback;},
    async set(key,value){await chrome.storage.local.set({[key]:value});},
    async del(key){await chrome.storage.local.remove(key);},
    request(options){
      chrome.runtime.sendMessage({type:'be-afrr-fetch',url:options.url},response=>{
        if(chrome.runtime.lastError||!response||response.error){options.onerror?.();return;}
        options.onload?.({status:response.status,responseText:response.text||'',responseHeaders:response.headers||''});
      });
    }
  };
})();
