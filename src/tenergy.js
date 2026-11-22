/* 6.8 — Onbalansprijzen via Tenergy (userscript/extensie-deel, met netwerktoegang).
 * 7.2: terugval zonder TenneT-sleutel. De Tenergy-reeks loopt 3 minuten achter: minuut 0-2 van
 * een kwartier hoort nog bij het vorige. Schatting = minuut 2 van het volgende kwartier, tot die er
 * is de laatste minuut. Hooguit 3 keer per kwartier ophalen. Prijzen van TenneT (bron tennet-*)
 * worden nooit overschreven.
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
  const KWARTIER = 900000, MINUUT = 60000, BEWAAR_MS = 60 * 86400000;
  // Ophaalmomenten binnen elk kwartier (ms na de kwartierstart): na minuut 2 (sluit het vorige
  // kwartier af), halverwege en aan het eind voor de live-lijn.
  const MOMENTEN = [3.5 * MINUUT, 8.5 * MINUUT, 13.5 * MINUUT];
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
  // Regeltoestand uit de activatietabel: alleen ter informatie, niet voor de prijs.
  function tabelToestand(q, act) {
    const min = [];
    for (let t = q; t < q + KWARTIER; t += MINUUT) if (act[t]) min.push(t);
    if (min.length < MIN_DEKKING) return null;
    const op = min.some(t => act[t][0] > 0 || act[t][2] > 0), af = min.some(t => act[t][1] > 0 || act[t][3] > 0);
    return op && af ? 2 : op ? 1 : af ? -1 : 0;
  }
  // Schatting per kwartier: minuut 3 t/m 14 van het kwartier en minuut 0-2 van het volgende horen
  // bij dit kwartier. Eindschatting = minuut 2 van het volgende kwartier.
  function kwartierPrijs(q, afnemen, invoeden, act, nu) {
    let laatste = null;
    for (let m = 3; m <= 17; m++) { const t = q + m * MINUUT; if (t <= nu && afnemen.has(t) && invoeden.has(t)) laatste = t; }
    if (laatste === null) return null;
    const klaar = laatste === q + 17 * MINUUT;
    return { ki: afnemen.get(laatste) / 1000, ke: invoeden.get(laatste) / 1000, minuut: laatste, klaar,
      rs: tabelToestand(q, act), regel: klaar ? 'minuut 2 volgend kwartier' : 'laatste minuut (voorlopig)' };
  }
  function verwerk(html, nu) {
    const m = /data\s*=\s*(\{[\s\S]*?\})\s*;\s*serialChart\.updateChart/.exec(html);
    if (!m) throw Error('Tenergy-pagina zonder grafiekdata');
    const data = JSON.parse(m[1]);
    const afnemen = reeks(data, 'PRICES_TAKE'), invoeden = reeks(data, 'PRICES_FEED');
    const act = leesActivatie(html, nu), kwartieren = laad();
    const qs = new Set();
    afnemen.forEach((v, t) => { if (t <= nu) { const k = t - 3 * MINUUT; qs.add(k - (k % KWARTIER)); } });
    let aantal = 0;
    for (const q of qs) {
      const r = kwartierPrijs(q, afnemen, invoeden, act, nu);
      if (!r) continue;
      const klaar = r.klaar;
      const oud = kwartieren[q];
      if (oud && /^tennet/.test(oud.bron || '')) continue; // TenneT (officieel of 12 s) gaat voor.
      if (oud && oud.klaar && !klaar) continue; // Afgesloten waarde niet terug naar voorlopig.
      // Een eerder bepaalde regeltoestand niet weggooien als de activatie inmiddels uit de tabel is.
      if (oud && oud.klaar && oud.rs != null && r.rs == null) continue;
      kwartieren[q] = { ki: r.ki, ke: r.ke, minuut: r.minuut, klaar, bron: 'tenergy', rs: r.rs, regel: r.regel };
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
      onerror: e => klaar('Tenergy niet bereikbaar' + (e && (e.error || e.statusText || e.status) ? ' (' + (e.error || e.statusText || e.status) + ')' : '')), ontimeout: () => klaar('Tenergy reageert niet') });
  }
  // Laatste ophaalmoment dat al voorbij is; ophalen als dat nog niet gebeurd is.
  function moment(nu) {
    const q = nu - (nu % KWARTIER);
    for (let i = MOMENTEN.length - 1; i >= 0; i--) if (q + MOMENTEN[i] <= nu) return q + MOMENTEN[i];
    return q - KWARTIER + MOMENTEN[MOMENTEN.length - 1];
  }
  function bijwerken() { const nu = Date.now(); if (!document.hidden && laatsteHaal < moment(nu)) haal(); }
  haal();
  setInterval(bijwerken, 15000);
  document.addEventListener('visibilitychange', bijwerken);
})();
