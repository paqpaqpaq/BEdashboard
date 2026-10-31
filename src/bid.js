(async function () {
    if (window.__beAfrrBid01) return;
    const QUARTER = 900000, DAY = 86400000, ARCHIVE_DAYS = 7;
    const directions = ['import', 'export'];
    const colours = {import: '#b65c72', export: '#73b9a1'};
    function bidColour(direction) {
      return window.BETheme?.seriesColor('bid-'+direction) || colours[direction];
    }
    const bids = new Map();
    let library, timer, busy = false, enabled = true, error = '', unavailable = false;
    let lastSuccess = 0, lastLiveQuarter = null, ui, button, status, recovering=false, archiveReady=false, dbPromise, storageError='';
    let recoveryTimer, rateRetryUntil = 0, archiveRead, recoveryMemory={};
    try{enabled=localStorage.getItem('be_afrr_bid_enabled_v1')!=='uit';}catch(_){}
    let customer=(location.pathname.match(/^\/customer\/([^/]+)(?:\/|$)/)||[])[1];
    if(!customer||/^(account|current-prices|current-history|results)$/.test(customer))customer=await window.BEInstallation?.wait();
    if(!customer||window.__beAfrrBid01)return;
    window.__beAfrrBid01 = true;
    const cachePrefix=customer+':';
    const recoveryKey='be_bid_recovery_v1:'+customer;
    const RECOVERY_REVISION='reconstructed-bids-v1';
    const clock = new Intl.DateTimeFormat('nl-NL', {
      timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit'
    });
    const euro = n => '€ ' + n.toLocaleString('nl-NL', {minimumFractionDigits: 3, maximumFractionDigits: 3});
    function read(id) {
      try { return JSON.parse(document.getElementById(id)?.textContent || 'null'); }
      catch (_) { return null; }
    }
    function quarter(now) { return Math.floor(now / QUARTER) * QUARTER; }

    // API schema/semantics checked against RaginValdr/Balans-energie-Home-assistant-app.
    // Explicit bids have priority. Confirmed quotes may only supply a separately
    // labelled, uncertain reconstruction; never silently turn them into observations.
    function mergeRecord(old, incoming){
      const r={start:incoming.start,end:incoming.end,states:Object.assign({},old?.states,incoming.states)};
      if(old?.quote||incoming.quote)r.quote=!old?.quote?incoming.quote:!incoming.quote?old.quote:
        incoming.quote.seenAt>=old.quote.seenAt?incoming.quote:old.quote;
      const reconstruction={};
      for(const d of directions){
        const a=old?.reconstruction?.[d],b=incoming.reconstruction?.[d];
        if(a||b)reconstruction[d]=!a?b:!b?a:b.at>=a.at?b:a;
      }
      if(Object.keys(reconstruction).length)r.reconstruction=reconstruction;
      for(const d of directions){
        const verdict=reconstruction[d];
        const allowed=value=>!value?.estimated||!verdict||verdict.at<value.observedAt||
          verdict.value!==null&&Math.abs(verdict.value-value.value)<1e-8;
        const a=allowed(old?.[d])?old?.[d]:null,b=allowed(incoming[d])?incoming[d]:null;
        if(a?.estimated&&!b&&incoming.states?.[d]==='missing_bid')continue;
        if(!a&&!b)continue;
        const newest=!a?b:!b?a:!!a.estimated!==!!b.estimated?(a.estimated?b:a):b.observedAt>=a.observedAt?b:a;
        const observations=[a,b].filter(Boolean).flatMap(v=>v.observations||[{value:v.value,observedAt:v.observedAt,...(v.estimated?{estimated:true}:{})}]);
        const seen=new Map();observations.forEach(o=>{
          if(Number.isFinite(o.value)&&Number.isFinite(o.observedAt)&&!!o.estimated===!!newest.estimated)
            seen.set(o.observedAt+':'+o.value,{value:o.value,observedAt:o.observedAt,...(o.estimated?{estimated:true}:{})});
        });
        r[d]=Object.assign({},newest,{observations:[...seen.values()].sort((x,y)=>x.observedAt-y.observedAt)});
      }
      return r;
    }
    function quoteSignature(quote){
      return JSON.stringify([quote.values,quote.states,quote.discovery,quote.available]);
    }
    function reconstructionCandidate(record,direction){
      const quote=record.quote,discovery=quote?.discovery;
      if(!quote||quote.available===false||record.states?.[direction]==='missing_bid'||quote.states?.[direction]!=='confirmed'||discovery?.complete!==true||
        !Number.isFinite(discovery.observedUntil)||discovery.observedUntil<record.start+120000||
        !Array.isArray(discovery.directions)||!Array.isArray(discovery.controlDirections)||
        discovery.directions.includes(direction)||discovery.controlDirections.includes(direction))return null;
      const value=quote.values?.['afrr_'+direction],buy=quote.values?.onbalans_import,sell=quote.values?.onbalans_export;
      if(![value,buy,sell].every(Number.isFinite)||Math.abs(value*100-Math.round(value*100))>1e-7)return null;
      const outside=direction==='import'?value<Math.min(buy,sell)-1e-8:value>Math.max(buy,sell)+1e-8;
      if(!outside)return null;
      const known=record[direction];
      if(known&&!known.estimated&&Math.abs(known.value-value)>1e-8)return null;
      return value;
    }
    function reconstruct(now){
      const records=[...bids.values()],candidates={import:[],export:[]},anchors={import:[],export:[]};
      for(const record of records)for(const direction of directions){
        const known=record[direction],value=reconstructionCandidate(record,direction);
        if(known&&!known.estimated)anchors[direction].push({start:record.start,value:known.value});
        if(value!==null)candidates[direction].push({start:record.start,value});
      }
      for(const record of records){
        const incoming={start:record.start,end:record.end,states:{},reconstruction:{}};
        for(const direction of directions){
          const previous=record[direction];
          if(previous&&!previous.estimated)continue;
          const value=reconstructionCandidate(record,direction);
          // Require another independent quarter nearby, never an earlier estimate.
          const repeated=value!==null&&[...candidates[direction],...anchors[direction]].some(other=>
            other.start!==record.start&&Math.abs(other.start-record.start)<=2*3600000&&Math.abs(other.value-value)<1e-8);
          if(!repeated){
            if(previous?.estimated)incoming.reconstruction[direction]={at:now,value:null};
            continue;
          }
          incoming[direction]=previous?.estimated&&previous.value===value?previous:
            {value,observedAt:now,source:'gereconstrueerd uit API-prijsgrens',estimated:true};
          if(record.reconstruction?.[direction]?.value!==value)incoming.reconstruction[direction]={at:now,value};
        }
        if(!directions.some(d=>incoming[d])&&!Object.keys(incoming.reconstruction).length)continue;
        const merged=mergeRecord(record,incoming);
        if(JSON.stringify(record)!==JSON.stringify(merged)){bids.set(record.start,merged);persist(merged);}
      }
    }
    function database(){
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('balansenergie-bids-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('kwartieren',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('BID-archief geblokkeerd'));});
      return dbPromise;
    }
    async function persist(record){
      if(!directions.some(d=>record[d])&&!record.quote)return;
      try{
        const db=await database();await new Promise((resolve,reject)=>{
          const tx=db.transaction('kwartieren','readwrite'),store=tx.objectStore('kwartieren'),id=cachePrefix+record.start,req=store.get(id);
          req.onsuccess=()=>store.put(Object.assign(mergeRecord(req.result,record),{id,customer}));
          tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('BID opslaan mislukt'));
        });storageError='';
      }catch(e){storageError='BID-cache niet opgeslagen: '+e.message;}
    }
    function readArchive(){
      if(archiveRead)return archiveRead;
      archiveRead=(async()=>{
        const db=await database();
        const rows=await new Promise((resolve,reject)=>{
          const tx=db.transaction('kwartieren','readonly');
          const req=tx.objectStore('kwartieren').getAll(IDBKeyRange.bound(cachePrefix+(quarter(Date.now())-ARCHIVE_DAYS*DAY),cachePrefix+'9999999999999'));
          req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
        });
        rows.forEach(r=>{if(r.customer===customer&&Number.isFinite(r.start)&&r.end===r.start+QUARTER)bids.set(r.start,mergeRecord(r,bids.get(r.start)||r));});
      })().finally(()=>{archiveRead=null;});
      return archiveRead;
    }
    async function hydrate(){
      try{
        await readArchive();
      }catch(e){storageError='BID-cache niet leesbaar: '+e.message;}
      // Oude bronresponsen kunnen nog expliciet gemarkeerde biedprijzen bevatten.
      try{
        const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('balansenergie-bronnen-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('dagen');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        const saved=await new Promise((resolve,reject)=>{const req=db.transaction('dagen','readonly').objectStore('dagen').get(customer+':prijzen');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();
        if(saved?.rows)ingest({prices:saved.rows},Date.now(),true);
      }catch(_){}
      reconstruct(Date.now());archiveReady=true;refresh();poll();scheduleRecovery();
    }
    function ingest(payload, now, historical=false) {
      if (!payload || !Array.isArray(payload.prices)) throw Error('Onbekend API-antwoord');
      if(!historical)unavailable = payload.afrrAvailable === false;
      const discovery=new Map((payload.afrrDiscovery||[]).map(row=>[row.start,row]));
      let added=0;
      for(const r of payload.prices){
      const start=r.start;
      if(!Number.isFinite(start)||start%QUARTER!==0||r.end!==start+QUARTER||start>now||r.carried)continue;
      const old=bids.get(start),record={start,end:r.end,states:{}};
      const discovered=discovery.get(start);
      if(discovered){
        const seenAt=Number.isFinite(r.checkedAt)?r.checkedAt:Number.isFinite(payload.generatedAt)?payload.generatedAt:now;
        const quote={values:{...r.values},states:{...r.afrrBidStatus},available:payload.afrrAvailable,
          discovery:{complete:discovered.complete,observedUntil:discovered.observedUntil,
            directions:discovered.directions,controlDirections:discovered.controlDirections},seenAt};
        if(!old?.quote||seenAt>=old.quote.seenAt)
          record.quote=old?.quote&&quoteSignature(old.quote)===quoteSignature(quote)?old.quote:quote;
      }
      for (const direction of directions) {
        const state = r.afrrBidStatus?.[direction];
        const value = r.values?.['afrr_' + direction];
        if(typeof state==='string')record.states[direction] = state;
        if (state === 'bid_fallback' && Number.isFinite(value)) {
          const previous=old?.[direction];
          record[direction] = previous&&!previous.estimated&&previous.value===value?previous:{value, observedAt: now,source:historical?'historische bron':'live'};
          if(!previous)added++;
        }
        // A subsequent confirmed quote must not replace the captured bid.
      }
      const merged=mergeRecord(old,record);bids.set(start,merged);
      if(JSON.stringify(old)!==JSON.stringify(merged))persist(merged);
      }
      // Alleen de werkset in geheugen begrenzen; opgeslagen BIDs worden niet verwijderd.
      for (const key of bids.keys()) if (key < quarter(now) - ARCHIVE_DAYS * DAY) bids.delete(key);
      reconstruct(now);
      return added;
    }
    function displayPrice(value, direction, tariff, settings) {
      if (!tariff?.allin) return value;
      if (!settings || !['btw', 'eb', 'opslag'].every(k => Number.isFinite(settings[k])) ||
          typeof settings.saldeert !== 'boolean') return null;
      return direction === 'import'
        ? value * settings.btw + settings.opslag + settings.eb
        : value * settings.btw - settings.opslag + (settings.saldeert ? settings.eb : 0);
    }
    function points(direction, tariff, settings) {
      const out = [];
      if (!enabled || !tariff?.aan) return out;
      for (const r of [...bids.values()].sort((a,b) => a.start - b.start)) {
        if (!r[direction]) continue;
        const y = displayPrice(r[direction].value, direction, tariff, settings);
        if (!Number.isFinite(y)) continue;
        // Explicit gaps: no interpolation or carrying a bid into another quarter.
        const extra = {bidStart: r.start, bidEnd: r.end, observedAt: r[direction].observedAt,estimated:r[direction].estimated===true};
        out.push({x: r.start, y: null}, {x: r.start, y, ...extra},
          {x: r.end, y, ...extra}, {x: r.end, y: null});
      }
      return out;
    }
    // Resolve each series by time: price, BID and EPEX point counts differ.
    function tariffItems(chart, event) {
      const area = chart.chartArea, px = event.x;
      if (!area || !Number.isFinite(px) || px < area.left || px > area.right ||
          (Number.isFinite(event.y) && (event.y < area.top || event.y > area.bottom))) return [];
      const t = chart.scales.x.getValueForPixel(px);
      if (!Number.isFinite(t)) return [];
      chart.$beTariefHoverTime = t;
      const period = (chart.$beKwartieren || []).find(r => r.start <= t && t < r.end);
      const items = [];
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (!chart.isDatasetVisible(datasetIndex)) return;
        const data = dataset.data || [];
        let lo = 0, hi = data.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (data[mid].x <= t) lo = mid + 1;
          else hi = mid;
        }
        const index = lo - 1, point = data[index];
        if (!point || !Number.isFinite(point.y)) return;
        if (dataset.beBidDirection) {
          if (!(point.bidStart <= t && t < point.bidEnd)) return;
        } else if (dataset.beEpex) {
          const next = data[index + 1];
          if (!next || !Number.isFinite(next.y) || !(point.x <= t && t < next.x)) return;
        } else {
          if (!period || period.wacht || point.x < period.start || point.x >= period.end || t > data.at(-1).x) return;
        }
        const element = chart.getDatasetMeta(datasetIndex).data[index];
        if (element && !element.skip) items.push({element, datasetIndex, index});
      });
      return items;
    }
    function atHoverTime(chart, items) {
      const t = chart.$beTariefHoverTime;
      return Number.isFinite(t) ? items.map(i => ({...i, parsed: {...i.parsed, x: t}})) : items;
    }
    const plugin = {
      id: 'beAfrrBidOverlay01',
      beforeUpdate(chart) {
        if (chart.canvas?.id !== 'be-tarief-chart') return;
        const tariff = read('be-tarief-data'), settings = read('be-actueel-allin-data');
        for (const direction of directions) {
          let dataset = chart.data.datasets.find(d => d.beBidDirection === direction);
          if (!dataset) {
            dataset = {
              beBidDirection: direction,
              label: 'BID ' + direction,
              borderColor: bidColour(direction), backgroundColor: bidColour(direction),
              borderDash: [], borderWidth: 1.5, pointRadius: 0,
              pointHitRadius: 8, fill: false, tension: 0, spanGaps: false,
              stepped: false, order: -5,
              tooltip: {callbacks: {
                label: context => 'BID ' + direction + (context.raw?.estimated?' (gereconstrueerd): ~ ':': ') + euro(context.parsed.y) + ' / kWh',
                afterLabel: context => {
                  const r = context.raw;
                  return r?.bidStart == null ? '' : clock.format(r.bidStart) + '–' + clock.format(r.bidEnd) +
                    (r.estimated?' · gereconstrueerde biedgrens, onzeker':' · waargenomen biedprijs');
                }
              }}
            };
            chart.data.datasets.push(dataset);
          }
          dataset.data = points(direction, tariff, settings);
          dataset.borderWidth=window.BETheme?.isDark()?1:1.5;
          dataset.borderColor=bidColour(direction);
          dataset.backgroundColor=dataset.borderColor;
        }
        const options = chart.config.options;
        options.interaction = {...options.interaction, mode: 'beTariefTime', axis: 'x', intersect: false};
        options.plugins = options.plugins || {};
        const tooltip = options.plugins.tooltip = options.plugins.tooltip || {};
        tooltip.mode = 'beTariefTime';
        const callbacks = tooltip.callbacks = tooltip.callbacks || {};
        if (!callbacks.title?.beBidTimeWrapped) {
          const original = callbacks.title;
          const wrapped = function (items) {
            const timed = atHoverTime(chart, items);
            return original ? original.call(this, timed) : timed.length ? clock.format(timed[0].parsed.x) : '';
          };
          wrapped.beBidTimeWrapped = true;
          callbacks.title = wrapped;
        }
        if (callbacks && !callbacks.afterBody?.beBidWrapped) {
          const original = callbacks.afterBody;
          const wrapped = function (items) {
            const regular = atHoverTime(chart, items.filter(i => !i.dataset.beBidDirection));
            const result = regular.length && original ? original.call(this, regular) : [];
            const lines = Array.isArray(result) ? result : result ? [result] : [];
            if(!items.some(i=>i.dataset.beBidDirection))return lines;
            return lines.concat(items.some(i=>i.dataset.beBidDirection&&i.raw?.estimated)?
              'Gereconstrueerd = vermoedelijke biedgrens; niet rechtstreeks als bod waargenomen.':
              'BID = bod; geen bevestigde handelsprijs.');
          };
          wrapped.beBidWrapped = true;
          callbacks.afterBody = wrapped;
        }
      }
    };
    function ensureUI() {
      const row = document.getElementById('be-tarief-row');
      if (!row) return;
      if (!document.getElementById('be-afrr-bid-style')) {
        const style = document.createElement('style');
        style.id = 'be-afrr-bid-style';
        style.textContent = `
          #be-afrr-bid-status{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:nowrap;width:100%;box-sizing:border-box;font:11px/1.5 system-ui,sans-serif;margin:6px 0;color:inherit}
          #be-afrr-bid-status>[role="status"]{flex:0 1 auto;min-width:0;max-width:100%;text-align:right;overflow-wrap:anywhere}
          #be-afrr-bid-switch{appearance:none;display:inline-flex;align-items:center;gap:9px;flex:0 0 auto;border:0;padding:3px 2px;background:transparent;color:inherit;font:500 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;cursor:pointer;box-shadow:none;margin:0;min-height:24px}
          #be-afrr-bid-switch:focus-visible{outline:2px solid #429ee8;outline-offset:4px;border-radius:4px}
          #be-afrr-bid-switch .be-afrr-bid-track{position:relative;width:34px;height:18px;flex:none;border-radius:10px;background:#868892;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
          #be-afrr-bid-switch .be-afrr-bid-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0004;transition:transform .15s}
          #be-afrr-bid-switch[aria-checked="true"] .be-afrr-bid-track{background:#287dbb}
          #be-afrr-bid-switch[aria-checked="true"] .be-afrr-bid-thumb{transform:translateX(16px)}
          #be-afrr-bid-switch .be-afrr-bid-state{min-width:24px;font-size:10px;font-weight:700;letter-spacing:.02em}
          html[data-be-dark="aan"] #be-afrr-bid-switch .be-afrr-bid-track{background:#65615b!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)!important}
          html[data-be-dark="aan"] #be-afrr-bid-switch[aria-checked="true"] .be-afrr-bid-track{background:#287dbb!important}
          html[data-be-dark="aan"] #be-afrr-bid-switch .be-afrr-bid-thumb{background:#fff!important;box-shadow:0 1px 3px #0004!important}
          @media(max-width:700px){#be-afrr-bid-switch{border-left:0}}
          @media(prefers-reduced-motion:reduce){#be-afrr-bid-switch .be-afrr-bid-thumb{transition:none}}
        `;
        document.documentElement.appendChild(style);
      }
      if (ui?.isConnected && ui.parentElement === row) return;
      ui?.remove();
      ui = document.createElement('div');
      ui.id = 'be-afrr-bid-status';
      button = document.createElement('button');
      button.id = 'be-afrr-bid-switch';
      button.type = 'button';
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', 'aFRR-biedlijnen');
      button.innerHTML = '<span>aFRR BID</span><span class="be-afrr-bid-track" aria-hidden="true"><span class="be-afrr-bid-thumb"></span></span><span class="be-afrr-bid-state" aria-hidden="true"></span>';
      button.title = 'aFRR-biedlijnen tonen of verbergen. Vastgelegde biedingen blijven bewaard.';
      button.onclick = () => {
        enabled = !enabled;
        try { localStorage.setItem('be_afrr_bid_enabled_v1', enabled ? 'aan' : 'uit'); } catch (_) {}
        refresh();
      };
      status = document.createElement('span');
      status.setAttribute('role', 'status');
      ui.append(status,button); row.appendChild(ui);
    }
    function refresh() {
      ensureUI();
      const C = window.Chart;
      if (C?.register && library !== C) {
        C.Interaction.modes.beTariefTime = tariffItems;
        C.register(plugin); library = C;
      }
      const chart = C?.getChart?.('be-tarief-chart');
      if (chart) chart.update('none');
      if (!status) return;
      button.setAttribute('aria-checked', String(enabled));
      button.querySelector('.be-afrr-bid-state').textContent = enabled ? 'AAN' : 'UIT';
      const now = Date.now(), start = quarter(now), record = bids.get(start);
      const tariff = read('be-tarief-data'), settings = read('be-actueel-allin-data');
      const prefix = clock.format(start) + '–' + clock.format(start + QUARTER) + ' · ';
      const labels = directions.map(direction => {
        const bid = record?.[direction];
        if (bid) {
          const value = displayPrice(bid.value, direction, tariff, settings);
          return direction + ' ' + (Number.isFinite(value) ? (bid.estimated?'~ ':'')+euro(value) + '/kWh' : 'all-in instellingen ontbreken');
        }
        if (record?.states[direction] === 'missing_bid') return direction + ' geen bod';
        return direction + (now - start < 120000 ? ' wachten op bod' : ' bod niet waargenomen');
      });
      status.textContent = prefix + (unavailable ? 'aFRR niet beschikbaar' : labels.join(' · ')) +
        (storageError?' · '+storageError:'')+(error ? ' · ' + error : '') + (!error && lastSuccess && now - lastSuccess > 90000 ? ' · gegevens verouderd' : '');
      ui.title = 'BID = biedprijs; ~ betekent een onzekere reconstructie uit historische prijsgrenzen. Rechtstreeks waargenomen biedingen hebben voorrang. ' +
        (tariff?.allin ? 'All-in, volgens de instellingen van de hoofdplugin.' : 'Kale bedragen.');
    }
    function apiRetryUntil(){
      try{const shared=Number(localStorage.getItem('be_api_retry_until')||0);if(Number.isFinite(shared))rateRetryUntil=Math.max(rateRetryUntil,shared);}catch(_){}
      return rateRetryUntil;
    }
    function request(url) {
      return new Promise((resolve, reject) => {
        if(Date.now()<apiRetryUntil()){
          const failure=Error('API vraagt om even te wachten');failure.status=429;reject(failure);return;
        }
        // Own same-origin read request, unaffected by the main plugin's fetch/cache wrappers.
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url); xhr.timeout = 12000;
        xhr.onload = () => {
          if (xhr.status !== 200) {
            const failure=Error('API HTTP '+xhr.status);
            failure.status=xhr.status;
            if(xhr.status===429){
              const header=xhr.getResponseHeader('Retry-After'),seconds=Number(header);
              const retry=header?(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(header)):NaN;
              rateRetryUntil=Math.max(apiRetryUntil(),Number.isFinite(retry)?Math.max(Date.now()+1000,retry):Date.now()+60000);
              try{localStorage.setItem('be_api_retry_until',String(rateRetryUntil));}catch(_){}
            }
            return reject(failure);
          }
          if (!/json/i.test(xhr.getResponseHeader('content-type') || '')) return reject(Error('API niet beschikbaar; controleer login'));
          try { resolve(JSON.parse(xhr.responseText)); } catch (_) { reject(Error('Ongeldig API-antwoord')); }
        };
        xhr.onerror = () => reject(Error('API niet bereikbaar'));
        xhr.ontimeout = () => reject(Error('API time-out'));
        xhr.send();
      });
    }
    async function poll() {
      if (busy) return;
      clearTimeout(timer);
      busy = true;
      try {
        // Collection is independent of chart visibility, page and the BID switch.
        // Reuse fresh native price responses; closed/suspended browsers cannot poll.
        if (archiveReady && Date.now()>=apiRetryUntil()) {
          const now = Date.now();
          const freshFor=now-quarter(now)<120000?15000:55000;
          if(lastLiveQuarter!==quarter(now)||now-lastSuccess>=freshFor){
            const payload = await request('/customer/current-prices/api/?start=' + quarter(now) + '&end=' + now);
            ingest(payload, Date.now());
            if(payload.prices.some(r=>r.start===quarter(Date.now()))){
              const changed=lastLiveQuarter!==quarter(Date.now());
              lastSuccess=Date.now();lastLiveQuarter=quarter(lastSuccess);
              if(changed)scheduleRecovery(Math.max(4000,lastLiveQuarter+120000-Date.now()));
            }
            error = '';
          }
        }
      } catch (e) { error = e.message; }
      finally {
        busy = false;
        refresh();
        const pos = Date.now() % QUARTER;
        const delay = Math.max(apiRetryUntil()-Date.now(),pos < 120000 ? 15000 - pos % 15000 : Math.min(60000, QUARTER - pos));
        timer = setTimeout(poll, Math.max(1000, delay));
      }
    }
    function scheduleRecovery(delay=4000){
      clearTimeout(recoveryTimer);recoveryTimer=setTimeout(recover,Math.max(1000,delay));
    }
    function latestMissing(from,to){
      for(let t=quarter(to);t>=from;t-=QUARTER){
        if(t>=to)continue;
        const row=bids.get(t);
        if(directions.some(d=>(!row?.[d]||row[d].estimated)&&row?.states?.[d]!=='missing_bid'))return t;
      }
      return null;
    }
    function recoveryState(){
      try{
        const saved=JSON.parse(localStorage.getItem(recoveryKey)||'{}');
        if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [key,value] of Object.entries(saved)){
          if(value&&Number.isFinite(value.checkedAt)&&value.checkedAt>(recoveryMemory[key]?.checkedAt||0))recoveryMemory[key]=value;
        }
      }catch(_){}
      return {...recoveryMemory};
    }
    function saveRecovery(saved,now){
      for(const key of Object.keys(saved))if(Number(key)<quarter(now)-ARCHIVE_DAYS*DAY-DAY)delete saved[key];
      recoveryMemory=saved;
      try{localStorage.setItem(recoveryKey,JSON.stringify(saved));}catch(_){}
    }
    async function recover(){
      if(recovering||!archiveReady)return;
      const now=Date.now(),position=now%QUARTER;
      // Reserve the first two minutes for collecting the live bid, not backfill.
      if(position<120000||now<apiRetryUntil()){scheduleRecovery(Math.max(120000-position,apiRetryUntil()-now));return;}
      recovering=true;let delay=4000;
      try{
        const work=async()=>{
          try{await readArchive();}catch(_){} // API recovery still works if local storage is unavailable.
          const at=Date.now(),today=Math.floor(at/DAY)*DAY,horizon=quarter(at)-ARCHIVE_DAYS*DAY,saved=recoveryState();
          let range;
          for(let day=today;day+DAY>horizon;day-=DAY){
            const from=Math.max(day,horizon),to=Math.min(day+DAY,at),missing=latestMissing(from,to),previous=saved[day];
            if(missing===null||previous?.revision===RECOVERY_REVISION&&previous.nextAt>at&&previous.until>missing)continue;
            range={day,from,to};break;
          }
          if(!range){delay=3600000;return;}
          try{
            const payload=await request('/customer/current-prices/api/?start='+range.from+'&end='+range.to);
            ingest(payload,Date.now(),true);
            saved[range.day]={revision:RECOVERY_REVISION,until:range.to,checkedAt:Date.now(),nextAt:Date.now()+(range.day===today?3600000:DAY)};
          }catch(failure){
            delay=Math.max(300000,apiRetryUntil()-Date.now());
            saved[range.day]={revision:RECOVERY_REVISION,until:range.to,checkedAt:Date.now(),nextAt:Date.now()+delay};
          }
          saveRecovery(saved,Date.now());
        };
        // Tabs share recovery metadata and, where supported, the request lock.
        if(globalThis.navigator?.locks?.request)await navigator.locks.request('be-bid-recovery:'+customer,{ifAvailable:true},lock=>lock?work():undefined);
        else await work();
      }catch(_){delay=300000;}
      finally{recovering=false;refresh();scheduleRecovery(delay);}
    }
    document.addEventListener('be-afrr-source',e=>{try{
      const now=Date.now();ingest(e.detail,now);
      if(e.detail.prices.some(r=>r.start===quarter(now))){
        const changed=lastLiveQuarter!==quarter(now);
        lastSuccess=now;lastLiveQuarter=quarter(now);error='';
        if(changed)scheduleRecovery(Math.max(4000,lastLiveQuarter+120000-now));
      }
      refresh();
    }catch(_){}});
    document.addEventListener('be-tarief-update', refresh);
    document.addEventListener('be-actueel-allin-update', refresh);
    document.addEventListener('be-dark-change', refresh);
    async function resume(){
      try{await readArchive();}catch(_){}
      reconstruct(Date.now());refresh();poll();scheduleRecovery();
    }
    document.addEventListener('visibilitychange', () => {if (!document.hidden) resume();});
    window.addEventListener('pageshow',resume);
    hydrate();
})();
