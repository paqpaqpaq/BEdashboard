/* 6.8 — Onbalansprijzen via Tenergy (userscript/extensie-deel, met netwerktoegang).
 * De Tenergy-pagina bevat `data = {...}; serialChart.updateChart(data, ...)` met
 * ~1,5 dag minuutwaarden "Afnemen"/"Invoeden" (€/MWh). Per kwartier telt de laatste
 * minuutwaarde; die kwam op 17-11 in 7 van 8 vergeleken kwartieren exact overeen
 * met de onbalansprijs van Balans. Opslag: localStorage, gelezen door het paginadeel. */
(function () {
  'use strict';
  if (location.hostname !== 'dashboard.balansenergie.nl' || window.__beTenergy672) return;
  window.__beTenergy672 = true;
  const BRON = 'https://services.tenergy.nl/public.aspx/actualimbalanceprices';
  const OPSLAG = 'be_onbalans_tenergy_v1', STATUS = 'be_onbalans_tenergy_status_v1';
  const KWARTIER = 900000, MINUUT = 60000, BEWAAR_MS = 60 * 86400000, INTERVAL = 60000;
  let laatsteHaal = 0, bezig = false;
  function laad() {
    try { const o = JSON.parse(localStorage.getItem(OPSLAG) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
    catch (e) { return {}; }
  }
  function meld(fout) {
    try { const st = JSON.parse(localStorage.getItem(STATUS) || '{}') || {}; st.laatsteHaal = laatsteHaal; st.fout = fout || ''; localStorage.setItem(STATUS, JSON.stringify(st)); } catch (e) {}
  }
  const epoch = key => { const m = /-?\d+/.exec(String(key)); return m ? Number(m[0]) : NaN; };
  function reeks(data, id) {
    const s = (data.ChartSeries || []).find(x => x && x.Id === id);
    if (!s || !Array.isArray(s.Data)) throw Error('Tenergy-reeks ' + id + ' ontbreekt');
    const m = new Map();
    for (const p of s.Data) { const t = epoch(p.Key), v = Number(p.Value); if (Number.isFinite(t) && t % MINUUT === 0 && Number.isFinite(v)) m.set(t, v); }
    return m;
  }
  function verwerk(html, nu) {
    const m = /data\s*=\s*(\{[\s\S]*?\})\s*;\s*serialChart\.updateChart/.exec(html);
    if (!m) throw Error('Tenergy-pagina zonder grafiekdata');
    const data = JSON.parse(m[1]);
    const afnemen = reeks(data, 'PRICES_TAKE'), invoeden = reeks(data, 'PRICES_FEED');
    const nieuw = {}, kwartieren = laad();
    afnemen.forEach((v, t) => {
      if (t > nu || !invoeden.has(t)) return; // Tenergy zet een vooruitgeschoven laatste punt neer.
      const q = t - (t % KWARTIER), r = nieuw[q] || (nieuw[q] = { t: -1 });
      if (t >= r.t) { r.t = t; r.ki = v / 1000; r.ke = invoeden.get(t) / 1000; }
    });
    let aantal = 0;
    for (const k of Object.keys(nieuw)) {
      const r = nieuw[k], q = +k;
      const klaar = q + KWARTIER <= nu && r.t >= q + KWARTIER - MINUUT;
      if (kwartieren[q] && kwartieren[q].bron === 'tennet') continue; // Officieel gaat voor.
      if (kwartieren[q] && kwartieren[q].klaar && !klaar) continue; // Afgesloten waarde niet terug naar voorlopig.
      kwartieren[q] = { ki: r.ki, ke: r.ke, minuut: r.t, klaar, bron: 'tenergy' };
      aantal++;
    }
    if (!aantal) throw Error('Tenergy gaf geen bruikbare minuutwaarden');
    const grens = nu - BEWAAR_MS;
    for (const k of Object.keys(kwartieren)) if (+k < grens) delete kwartieren[k];
    localStorage.setItem(OPSLAG, JSON.stringify(kwartieren));
  }
  function haal() {
    const fn = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest :
      typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest.bind(GM) : null;
    if (!fn) { meld('Geen netwerktoegang in de userscriptmanager'); return; }
    if (bezig) return;
    bezig = true; laatsteHaal = Date.now();
    const klaar = fout => {
      bezig = false; meld(fout);
      if (fout) console.warn('[BE onbalans]', fout);
      else document.dispatchEvent(new Event('be-onbalans-tenergy-update'));
    };
    fn({ method: 'GET', url: BRON, anonymous: true, timeout: 25000,
      onload: r => { try { if (r.status !== 200) throw Error('Tenergy HTTP ' + r.status); verwerk(r.responseText, Date.now()); klaar(''); } catch (e) { klaar(e.message); } },
      onerror: () => klaar('Tenergy niet bereikbaar'), ontimeout: () => klaar('Tenergy reageert niet') });
  }
  function bijwerken() { if (!document.hidden && Date.now() - laatsteHaal >= INTERVAL) haal(); }
  haal();
  setInterval(bijwerken, 15000);
  document.addEventListener('visibilitychange', bijwerken);
})();
