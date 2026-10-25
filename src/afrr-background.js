/* The service worker independently enforces persistent TenneT budgets. */
(function(){
  'use strict';
  const CONFIG='be-afrr-market-settings-v1',BUDGET='be-afrr-background-budget-v1';
  let queue=Promise.resolve();
  function serialize(fn){const work=queue.then(fn);queue=work.catch(()=>{});return work;}
  function safeURL(raw,environment){
    const url=new URL(raw),origin=environment==='acceptance'?'https://api.acc.tennet.eu':'https://api.tennet.eu';
    if(url.origin!==origin||url.username||url.password||url.hash)throw Error('Invalid endpoint');
    if(url.pathname==='/publications/v1/balance-delta-high-res/latest'&&!url.search)return {url,channel:'live'};
    if(url.pathname!=='/publications/v1/merit-order-list')throw Error('Invalid endpoint');
    const keys=[...url.searchParams.keys()];
    if(keys.length!==2||!keys.includes('date_from')||!keys.includes('date_to'))throw Error('Invalid range');
    function date(name){const m=url.searchParams.get(name)?.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);if(!m)throw Error('Invalid range');return Date.UTC(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+m[6]);}
    const from=date('date_from'),to=date('date_to');
    if(!(to>from&&to-from<=3600000))throw Error('Invalid range');
    return {url,channel:'mol'};
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message.type!=='be-afrr-fetch')return;
    (async()=>{
      if(new URL(sender.url).origin!=='https://dashboard.balansenergie.nl')throw Error('Invalid sender');
      const settings=(await chrome.storage.local.get(CONFIG))[CONFIG];
      if(!settings?.key||!settings.enabled){reply({status:401});return;}
      const {url,channel}=safeURL(message.url,settings.environment);
      const retryAt=await serialize(async()=>{
        const now=Date.now(),saved=(await chrome.storage.local.get(BUDGET))[BUDGET]||{};
        const all=(saved.all||[]).filter(t=>t>now-60000),live=(saved.live||[]).filter(t=>t>now-60000),mol=(saved.mol||[]).filter(t=>t>now-86400000);
        const until=Math.max(saved.nextAt||0,all.length>=8?all[0]+60000:0,channel==='live'&&live.length>=5?live[0]+60000:0,channel==='mol'&&mol.length>=500?mol[0]+86400000:0);
        if(until>now)return until;
        await chrome.storage.local.set({[BUDGET]:{nextAt:now+1100,all:[...all,now],live:channel==='live'?[...live,now]:live,mol:channel==='mol'?[...mol,now]:mol}});
        return 0;
      });
      if(retryAt){reply({status:429,headers:'Retry-After: '+Math.max(1,Math.ceil((retryAt-Date.now())/1000))});return;}
      const response=await fetch(url.href,{headers:{apikey:settings.key,Accept:'application/json'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
      const retry=response.headers.get('Retry-After')||'';
      if(response.status===429){
        await serialize(async()=>{
          const saved=(await chrome.storage.local.get(BUDGET))[BUDGET]||{},now=Date.now();
          const delay=/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry)-now;
          await chrome.storage.local.set({[BUDGET]:{...saved,nextAt:Math.max(saved.nextAt||0,now+Math.max(60000,Number.isFinite(delay)?delay:0))}});
        });
      }
      // Never forward error bodies, which may contain request traces.
      const text=response.status===200?await response.text():'';
      reply({status:response.status,text,headers:retry?'Retry-After: '+retry:''});
    })().catch(()=>reply({error:true}));
    return true;
  });
})();
