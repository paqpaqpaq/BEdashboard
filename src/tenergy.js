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
  const ACTIVATIE = 'be_onbalans_tenergy_act_v1', MIN_DEKKING = 10;
  // Minuutactivatie uit de tabel (laatste 30 min): [opregelen, afregelen, nood op, nood af] in MW.
  function leesActivatie(html, nu) {
    let act;
    try { act = JSON.parse(localStorage.getItem(ACTIVATIE) || '{}') || {}; } catch (e) { act = {}; }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const getal = t => { const n = Number(String(t).trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
    const dag = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Amsterdam'}).format(new Date(nu));
    for (const tr of doc.querySelectorAll('table.imbalanceprices tr')) {
      const c = [...tr.cells].map(td => td.textContent.trim());
      if (c.length < 9 || !/^\d{1,2}:\d{2}$/.test(c[2])) continue;
      const vals = c.slice(3, 7).map(getal);
      if (vals.some(v => v === null)) continue;
      // Tabeltijd is Nederlandse tijd; tijdstip na nu hoort bij gisteren (rond middernacht).
      let t = Date.parse(dag + 'T' + c[2].padStart(5, '0') + ':00' + offset(nu));
      if (t > nu + MINUUT) t -= 86400000;
      if (Number.isFinite(t)) act[t] = vals;
    }
    const grens = nu - 2 * 86400000;
    for (const k of Object.keys(act)) if (+k < grens) delete act[k];
    try { localStorage.setItem(ACTIVATIE, JSON.stringify(act)); } catch (e) {}
    return act;
  }
  function offset(t) {
    const p = new Intl.DateTimeFormat('en-US', {timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset'}).formatToParts(new Date(t));
    const o = (p.find(x => x.type === 'timeZoneName')?.value || 'GMT+01:00').replace('GMT', '');
    return o === '' ? '+00:00' : o;
  }
  // Kwartierprijs volgens de regeltoestand (TenneT-systematiek, benadering):
  // alleen afregelen (−1): laagste prijs; alleen opregelen (+1): hoogste prijs;
  // beide (2): afnemen hoogste, invoeden laagste; geen (0) of te weinig activatiedata: laatste minuut.
  function kwartierPrijs(q, afnemen, invoeden, act, nu) {
    const minuten = [];
    for (let t = q; t < q + KWARTIER && t <= nu; t += MINUUT) if (afnemen.has(t) && invoeden.has(t)) minuten.push(t);
    if (!minuten.length) return null;
    const laatste = minuten[minuten.length - 1];
    const res = { ki: afnemen.get(laatste) / 1000, ke: invoeden.get(laatste) / 1000, minuut: laatste, rs: null, regel: 'laatste minuut' };
    const metAct = minuten.filter(t => act[t]);
    if (metAct.length < MIN_DEKKING) return res;
    const op = metAct.filter(t => act[t][0] > 0 || act[t][2] > 0), af = metAct.filter(t => act[t][1] > 0 || act[t][3] > 0);
    const prijzen = (lijst, kaart) => lijst.map(t => kaart.get(t));
    if (op.length && af.length) {
      res.rs = 2; res.regel = 'regeltoestand 2';
      res.ki = Math.max(...prijzen(minuten, afnemen)) / 1000; res.ke = Math.min(...prijzen(minuten, invoeden)) / 1000;
    } else if (af.length) {
      res.rs = -1; res.regel = 'alleen afregelen';
      const p = Math.min(...prijzen(af, afnemen), ...prijzen(af, invoeden)) / 1000; res.ki = res.ke = p;
    } else if (op.length) {
      res.rs = 1; res.regel = 'alleen opregelen';
      const p = Math.max(...prijzen(op, afnemen), ...prijzen(op, invoeden)) / 1000; res.ki = res.ke = p;
    } else { res.rs = 0; res.regel = 'geen activatie'; }
    res.dekking = metAct.length;
    return res;
  }
  function verwerk(html, nu) {
    const m = /data\s*=\s*(\{[\s\S]*?\})\s*;\s*serialChart\.updateChart/.exec(html);
    if (!m) throw Error('Tenergy-pagina zonder grafiekdata');
    const data = JSON.parse(m[1]);
    const afnemen = reeks(data, 'PRICES_TAKE'), invoeden = reeks(data, 'PRICES_FEED');
    const act = leesActivatie(html, nu), kwartieren = laad();
    const qs = new Set();
    afnemen.forEach((v, t) => { if (t <= nu) qs.add(t - (t % KWARTIER)); });
    let aantal = 0;
    for (const q of qs) {
      const r = kwartierPrijs(q, afnemen, invoeden, act, nu);
      if (!r) continue;
      const klaar = q + KWARTIER <= nu && r.minuut >= q + KWARTIER - MINUUT;
      const oud = kwartieren[q];
      if (oud && oud.bron === 'tennet') continue; // Officieel gaat voor.
      if (oud && oud.klaar && !klaar) continue; // Afgesloten waarde niet terug naar voorlopig.
      // Een eerder bepaalde regeltoestand niet weggooien als de activatie inmiddels uit de tabel is.
      if (oud && oud.klaar && oud.rs != null && r.rs == null) continue;
      kwartieren[q] = { ki: r.ki, ke: r.ke, minuut: r.minuut, klaar, bron: 'tenergy', rs: r.rs, regel: r.regel, ...(r.dekking ? { dekking: r.dekking } : {}) };
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
    fn({ method: 'GET', url: BRON, anonymous: false, timeout: 25000,
      onload: r => { try { if (r.status !== 200) throw Error('Tenergy HTTP ' + r.status); verwerk(r.responseText, Date.now()); klaar(''); } catch (e) { klaar(e.message); } },
      onerror: e => klaar('Tenergy niet bereikbaar' + (e && (e.error || e.statusText || e.status) ? ' (' + (e.error || e.statusText || e.status) + ')' : '')), ontimeout: () => klaar('Tenergy reageert niet') });
  }
  function bijwerken() { if (!document.hidden && Date.now() - laatsteHaal >= INTERVAL) haal(); }
  haal();
  setInterval(bijwerken, 15000);
  document.addEventListener('visibilitychange', bijwerken);
})();
