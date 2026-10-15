(function () {
    if (window.__beAfrrBid01) return;
    window.__beAfrrBid01 = true;
    const QUARTER = 900000;
    const directions = ['import', 'export'];
    const colours = {import: '#c96f22', export: '#7851ae'};
    const bids = new Map();
    let library, timer, busy = false, enabled = true, error = '', unavailable = false;
    let lastSuccess = 0, ui, button, status;
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
    function ingest(payload, now) {
      if (!payload || !Array.isArray(payload.prices)) throw Error('Onbekend API-antwoord');
      unavailable = payload.afrrAvailable === false;
      if (unavailable) return;
      const start = quarter(now);
      const r = payload.prices.find(row => row.start === start && row.end === start + QUARTER);
      if (!r) return;
      const record = bids.get(start) || {start, end: start + QUARTER, states: {}};
      for (const direction of directions) {
        const state = r.afrrBidStatus?.[direction];
        const value = r.values?.['afrr_' + direction];
        record.states[direction] = state;
        if (state === 'bid_fallback' && Number.isFinite(value)) {
          record[direction] = {value, observedAt: now};
        }
        // A subsequent confirmed quote must not replace the captured bid.
      }
      bids.set(start, record);
      for (const key of bids.keys()) if (key < start - 2 * 86400000) bids.delete(key);
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
              borderColor: colours[direction], backgroundColor: colours[direction],
              borderDash: [3, 4], borderWidth: 2, pointRadius: 0,
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
        }
        const callbacks = chart.options.plugins?.tooltip?.callbacks;
        if (callbacks && !callbacks.afterBody?.beBidWrapped) {
          const original = callbacks.afterBody;
          const wrapped = function (items) {
            const regular = items.filter(i => !i.dataset.beBidDirection);
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
      ui.append(button, status); row.appendChild(ui);
    }
    function refresh() {
      ensureUI();
      const C = window.Chart;
      if (C?.register && library !== C) { C.register(plugin); library = C; }
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
        (error ? ' · ' + error : '') + (!error && lastSuccess && now - lastSuccess > 90000 ? ' · gegevens verouderd' : '');
      ui.title = 'Gestippeld: waargenomen biedprijzen, geen handelsprijzen. ' +
        'Biedprijzen worden meestal alleen de eerste twee minuten van het kwartier aangeboden. ' +
        'Laat deze pagina open om ze vast te leggen. Herladen wist de waarnemingen. ' +
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
        if (enabled && read('be-tarief-data')?.aan && document.getElementById('be-tarief-chart')) {
          const now = Date.now();
          const payload = await request('/customer/current-prices/api/?start=' + quarter(now) + '&end=' + now);
          ingest(payload, Date.now()); lastSuccess = Date.now(); error = '';
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
    document.addEventListener('be-tarief-update', refresh);
    document.addEventListener('be-actueel-allin-update', refresh);
    document.addEventListener('be-dark-change', refresh);
    document.addEventListener('visibilitychange', () => {if (!document.hidden) poll();});
    poll();
})();
