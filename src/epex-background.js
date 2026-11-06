chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='be-epex-fetch')return;
  try{
    const url=new URL(message.url);
    if(new URL(sender.url).origin!=='https://dashboard.balansenergie.nl' ||
       url.origin!=='https://dataportal-api.nordpoolgroup.com' ||
       url.pathname!=='/api/DayAheadPrices' ||
       !/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date')||'') ||
       url.searchParams.get('market')!=='DayAhead' ||
       url.searchParams.get('deliveryArea')!=='NL' ||
       url.searchParams.get('currency')!=='EUR')throw Error('Invalid request');
    fetch(url.href,{credentials:'omit',signal:AbortSignal.timeout(20000)})
      .then(async r=>reply({status:r.status,text:await r.text()})).catch(()=>reply({error:true}));
    return true;
  }catch(_){reply({error:true});}
});

importScripts('afrr-background.js');
