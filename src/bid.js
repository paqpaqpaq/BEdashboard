(async function () {
    if (window.__beAfrrBid01) return;
    const QUARTER = 900000;
    const directions = ['import', 'export'];
    const colours = {import: '#b65c72', export: '#73b9a1'};
    function bidColour(direction) {
      return window.BETheme?.seriesColor('bid-'+direction) || colours[direction];
    }
    const bids = new Map();
    let library, timer, busy = false, enabled = true, error = '', unavailable = false;
    let lastSuccess = 0, ui, button, status, recovery='', recovering=false, archiveReady=false, dbPromise, storageError='';
    let customer=(location.pathname.match(/^\/customer\/([^/]+)(?:\/|$)/)||[])[1];
    if(!customer||/^(account|current-prices|current-history|results)$/.test(customer))customer=await window.BEInstallation?.wait();
    if(!customer||window.__beAfrrBid01)return;
    window.__beAfrrBid01 = true;
    const cachePrefix=customer+':';
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
    // Only bid_fallback contains a bid. confirmed is a trade quote, never a new bid.
    function mergeRecord(old, incoming){
      const r={start:incoming.start,end:incoming.end,states:Object.assign({},old?.states,incoming.states)};
      for(const d of directions){
        const a=old?.[d],b=incoming[d];
        if(!a&&!b)continue;
        const newest=!a?b:!b?a:b.observedAt>=a.observedAt?b:a;
        const observations=[...(a?.observations|| (a?[{value:a.value,observedAt:a.observedAt}]:[])),...(b?.observations|| (b?[{value:b.value,observedAt:b.observedAt}]:[]))];
        const seen=new Map();observations.forEach(o=>{if(Number.isFinite(o.value)&&Number.isFinite(o.observedAt))seen.set(o.observedAt+':'+o.value,{value:o.value,observedAt:o.observedAt});});
        r[d]=Object.assign({},newest,{observations:[...seen.values()].sort((x,y)=>x.observedAt-y.observedAt)});
      }
      return r;
    }
    function database(){
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('balansenergie-bids-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('kwartieren',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('BID-archief geblokkeerd'));});
      return dbPromise;
    }
    async function persist(record){
      if(!directions.some(d=>record[d]))return;
      try{
        const db=await database();await new Promise((resolve,reject)=>{
          const tx=db.transaction('kwartieren','readwrite'),store=tx.objectStore('kwartieren'),id=cachePrefix+record.start,req=store.get(id);
          req.onsuccess=()=>store.put(Object.assign(mergeRecord(req.result,record),{id,customer}));
          tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('BID opslaan mislukt'));
        });storageError='';
      }catch(e){storageError='BID-cache niet opgeslagen: '+e.message;}
    }
    async function hydrate(){
      try{
        const db=await database();const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('kwartieren','readonly'),req=tx.objectStore('kwartieren').getAll(IDBKeyRange.bound(cachePrefix+(quarter(Date.now())-7*86400000),cachePrefix+'9999999999999'));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        rows.forEach(r=>{if(r.customer===customer&&Number.isFinite(r.start)&&r.end===r.start+QUARTER)bids.set(r.start,mergeRecord(r,bids.get(r.start)||r));});
      }catch(e){storageError='BID-cache niet leesbaar: '+e.message;}
      // Oude bronresponsen kunnen nog expliciet gemarkeerde biedprijzen bevatten.
      try{
        const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('balansenergie-bronnen-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('dagen');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        const saved=await new Promise((resolve,reject)=>{const req=db.transaction('dagen','readonly').objectStore('dagen').get(customer+':prijzen');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();
        if(saved?.rows)ingest({prices:saved.rows},Date.now(),true);
      }catch(_){}
      archiveReady=true;refresh();poll();
    }
    function ingest(payload, now, historical=false) {
      if (!payload || !Array.isArray(payload.prices)) throw Error('Onbekend API-antwoord');
      if(!historical)unavailable = payload.afrrAvailable === false;
      let added=0;
      for(const r of payload.prices){
      const start=r.start;
      if(!Number.isFinite(start)||start%QUARTER!==0||r.end!==start+QUARTER||start>now||r.carried)continue;
      const old=bids.get(start),record={start,end:r.end,states:{}};
      for (const direction of directions) {
        const state = r.afrrBidStatus?.[direction];
        const value = r.values?.['afrr_' + direction];
        record.states[direction] = state;
        if (state === 'bid_fallback' && Number.isFinite(value)) {
          const previous=old?.[direction];
          record[direction] = previous&&previous.value===value?previous:{value, observedAt: now,source:historical?'historische bron':'live'};
          if(!previous)added++;
        }
        // A subsequent confirmed quote must not replace the captured bid.
      }
      const merged=mergeRecord(old,record);bids.set(start,merged);
      if(JSON.stringify(old)!==JSON.stringify(merged))persist(merged);
      }
      // Alleen de werkset in geheugen begrenzen; opgeslagen BIDs worden niet verwijderd.
      for (const key of bids.keys()) if (key < quarter(now) - 7 * 86400000) bids.delete(key);
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
        const extra = {bidStart: r.start, bidEnd: r.end, observedAt: r[direction].observedAt};
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
                label: context => 'BID ' + direction + ': ' + euro(context.parsed.y) + ' / kWh',
                afterLabel: context => {
                  const r = context.raw;
                  return r?.bidStart == null ? '' : clock.format(r.bidStart) + '–' + clock.format(r.bidEnd) + ' · biedprijs';
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
            return items.some(i => i.dataset.beBidDirection)
              ? lines.concat('BID = bod; geen bevestigde handelsprijs.') : lines;
          };
          wrapped.beBidWrapped = true;
          callbacks.afterBody = wrapped;
        }
      }
    };
    function ensureUI() {
      const row = document.getElementById('be-tarief-row');
      if (!row) return;
      if (ui?.isConnected && ui.parentElement === row) return;
      ui?.remove();
      ui = document.createElement('div');
      ui.id = 'be-afrr-bid-status';
      ui.style.cssText = 'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font:12px system-ui,sans-serif;margin:6px 0;color:inherit;line-height:1.5';
      button = document.createElement('button');
      button.type = 'button';
      button.style.cssText = 'font:600 12px system-ui,sans-serif;padding:3px 8px;border:1px solid #9274bb;border-radius:7px;background:transparent;color:inherit;cursor:pointer';
      button.onclick = () => {enabled = !enabled; refresh(); if (enabled) poll();};
      status = document.createElement('span');
      status.style.cssText = 'flex:1 1 220px;min-width:0;overflow-wrap:anywhere';
      status.setAttribute('role', 'status');
      ui.append(button,status); row.appendChild(ui);
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
      button.textContent = 'aFRR BID ' + (enabled ? 'aan' : 'uit');
      button.setAttribute('aria-pressed', String(enabled));
      const now = Date.now(), start = quarter(now), record = bids.get(start);
      const tariff = read('be-tarief-data'), settings = read('be-actueel-allin-data');
      if (!enabled) {status.textContent = 'Biedlijnen uitgeschakeld.'; return;}
      const prefix = clock.format(start) + '–' + clock.format(start + QUARTER) + ' · ';
      const labels = directions.map(direction => {
        const bid = record?.[direction];
        if (bid) {
          const value = displayPrice(bid.value, direction, tariff, settings);
          return direction + ' ' + (Number.isFinite(value) ? euro(value) + '/kWh' : 'all-in instellingen ontbreken');
        }
        if (record?.states[direction] === 'missing_bid') return direction + ' geen bod';
        return direction + (now - start < 120000 ? ' wachten op bod' : ' bod niet waargenomen');
      });
      status.textContent = prefix + (unavailable ? 'aFRR niet beschikbaar' : labels.join(' · ')) +
        ' · '+[...bids.values()].filter(r=>directions.some(d=>r[d])).length+' kwartieren in cache (laatste 7 dagen)' +
        (recovery?' · '+recovery:'')+(storageError?' · '+storageError:'')+(error ? ' · ' + error : '') + (!error && lastSuccess && now - lastSuccess > 90000 ? ' · gegevens verouderd' : '');
      ui.title = 'Dunne biedlijnen: waargenomen biedprijzen, geen handelsprijzen. ' +
        'Biedprijzen worden meestal alleen de eerste twee minuten van het kwartier aangeboden. ' +
        'Waarnemingen blijven lokaal bewaard na herladen, zonder automatische verwijdering. De grafiek laadt de laatste 7 dagen. ' +
        'Beschikbare biedhistorie wordt automatisch gecontroleerd; uitsluitend expliciete BID-bronprijzen tellen mee. ' +
        (tariff?.allin ? 'All-in, volgens de instellingen van de hoofdplugin.' : 'Kale bedragen.');
    }
    function request(url) {
      return new Promise((resolve, reject) => {
        // Own same-origin read request, unaffected by the main plugin's fetch/cache wrappers.
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url); xhr.timeout = 12000;
        xhr.onload = () => {
          if (xhr.status !== 200) return reject(Error('API HTTP ' + xhr.status));
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
        // Keep collecting in hidden tabs too. Safari may still throttle or suspend timers.
        if (archiveReady&&enabled && read('be-tarief-data')?.aan && document.getElementById('be-tarief-chart')) {
          const now = Date.now();
          const payload = await request('/customer/current-prices/api/?start=' + quarter(now) + '&end=' + now);
          ingest(payload, Date.now()); lastSuccess = Date.now(); error = '';recover(false);
        }
      } catch (e) { error = e.message; }
      finally {
        busy = false;
        refresh();
        const pos = Date.now() % QUARTER;
        const delay = pos < 120000 ? 15000 - pos % 15000 : Math.min(60000, QUARTER - pos);
        timer = setTimeout(poll, Math.max(1000, delay));
      }
    }
    let lastRecovery=0;
    async function recover(manual){
      if(recovering||!archiveReady||(!manual&&Date.now()-lastRecovery<3600000))return;
      recovering=true;lastRecovery=Date.now();recovery='';refresh();
      try{const payload=await request('/customer/current-prices/api/'),count=ingest(payload,Date.now(),true);recovery=count?count+' gemiste biedrichtingen teruggevonden':'Geen extra BIDs in beschikbare prijshistorie';}
      catch(e){recovery='Terugzoeken mislukt: '+e.message;}
      finally{recovering=false;refresh();}
    }
    document.addEventListener('be-afrr-source',e=>{try{ingest(e.detail,Date.now());refresh();}catch(_){}});
    document.addEventListener('be-tarief-update', refresh);
    document.addEventListener('be-actueel-allin-update', refresh);
    document.addEventListener('be-dark-change', refresh);
    document.addEventListener('visibilitychange', () => {if (!document.hidden) poll();});
    hydrate();
})();
