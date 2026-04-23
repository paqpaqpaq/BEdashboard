// ==UserScript==
// @name         Balansenergie All-in Toggle + FPR
// @version      2.16.3
// @description  All-in toggle (incl. EB, opslag en BTW) + Financial Performance Ratio + Voorschot
// @match        *://dashboard.balansenergie.nl/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
  const EB      = 0.111;
  const OPSLAG  = 0.02;
  const BTW     = 1.21;

  let allinMode = false;
  let geen2027 = false;
  let _originals = null;
  let _chartOriginals = null;
  let _dagData = null;
  let _currentTitle = null;

  // ─── Contractdata uit localStorage ───────────────────────────────────────
  var LS_PREFIX     = 'be_allin_';
  var LS_VOORSCHOT  = 'be_cfg_voorschot';
  var LS_STARTDATUM = 'be_cfg_startdatum';
  var LS_ZOMERDEEL  = 'be_cfg_zomerdeel';

  // Lees instellingen
  var VOORSCHOT_PM = parseFloat(localStorage.getItem(LS_VOORSCHOT) || '42.98');

  
  var LEV_DAG  =  0.2184;  // vaste leveringskosten BE
  var TRA_DAG  =  1.3861;  // transportkosten (uit BS portaal per dag, netbeheer tarief is echter 1,30???)
  var VER_DAG  =  1.7232;  // vermindering energiebelasting
  var VAST_DAG = LEV_DAG + TRA_DAG - VER_DAG; // netto per dag (~-€0,119)

  var NL_MAANDEN_KORT = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  var NL_MAANDEN_LANG = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

  // Dagen in een maand op basis van label bijv. 'Jan 2026'
  function dagenInMaand(label) {
    var delen = label.split(' ');
    var mIdx = NL_MAANDEN_KORT.indexOf(delen[0]);
    var jaar = parseInt(delen[1]);
    if (mIdx === -1 || isNaN(jaar)) return 30;
    return new Date(jaar, mIdx + 1, 0).getDate();
  }

  // Dagen verstreken in een maand (voor lopende maand)
  function dagenVerstreken(label) {
    var delen = label.split(' ');
    var mIdx = NL_MAANDEN_KORT.indexOf(delen[0]);
    var jaar = parseInt(delen[1]);
    if (mIdx === -1 || isNaN(jaar)) return 30;
    var nu = new Date();
    var isMaandNu = nu.getMonth() === mIdx && nu.getFullYear() === jaar;
    return isMaandNu ? nu.getDate() : dagenInMaand(label);
  }

  function leesStartdatum() {
    var s = localStorage.getItem(LS_STARTDATUM);
    if (s) { var d = new Date(s); if (!isNaN(d)) return d; }
    return new Date('2025-11-04');
  }

  function CONTRACT_MAANDEN() {
    var start = leesStartdatum();
    var result = [];
    for (var i = 0; i < 12; i++) {
      var d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      result.push(NL_MAANDEN_KORT[d.getMonth()] + ' ' + d.getFullYear());
    }
    return result;
  }

  // Maand label uit paginatitel afleiden
  // bijv. "Overzicht resultaten voor maart 2026" → "Mrt 2026"
  var MAAND_MAP = {
    'januari':'Jan','februari':'Feb','maart':'Mrt','april':'Apr',
    'mei':'Mei','juni':'Jun','juli':'Jul','augustus':'Aug',
    'september':'Sep','oktober':'Okt','november':'Nov','december':'Dec'
  };

  function maandLabelUitTitel(titel) {
    if (!titel) return null;
    var m = titel.toLowerCase();
    for (var nl in MAAND_MAP) {
      if (m.indexOf(nl) !== -1) {
        var jaarMatch = titel.match(/\d{4}/);
        if (jaarMatch) return MAAND_MAP[nl] + ' ' + jaarMatch[0];
      }
    }
    return null;
  }

  function lsSleutel(label) {
    return LS_PREFIX + label.replace(' ', '_');
  }

  function slaAllinOp(label, totaal, expKwh) {
    try {
      localStorage.setItem(lsSleutel(label), totaal.toFixed(2));
      if (expKwh !== undefined) {
        localStorage.setItem(lsSleutel(label) + '_expkwh', expKwh.toFixed(1));
      }
    } catch(e) {}
  }

  function leesAllin(label) {
    try {
      var v = localStorage.getItem(lsSleutel(label));
      return v !== null ? parseFloat(v) : null;
    } catch(e) { return null; }
  }

  function leesExpKwh(label) {
    try {
      var v = localStorage.getItem(lsSleutel(label) + '_expkwh');
      return v !== null ? parseFloat(v) : null;
    } catch(e) { return null; }
  }

  function leesAlleMaanden() {
    return CONTRACT_MAANDEN().map(function(label) {
      var kosten = leesAllin(label);
      var expKwh = leesExpKwh(label);
      return { label: label, kosten: kosten, expKwh: expKwh };
    });
  }

  // ─── Formatters ───────────────────────────────────────────────────────────

  function parseEuro(str) {
    if (!str) return null;
    return parseFloat(str.replace(/[€\s]/g, '').replace(',', '.'));
  }

  function parseKwhPair(str) {
    var parts = str.split('kWh')
      .map(function(s) { return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')); })
      .filter(function(n) { return !isNaN(n) && n >= 0; });
    return { a: parts[0] || 0, b: parts[1] || 0 };
  }

  function fmt(val) {
    var abs = Math.abs(val).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (val < 0 ? '-' : '+') + '\u00a0\u20ac\u00a0' + abs;
  }

  function fmtV(val) {
    var abs = Math.abs(val).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (val < 0 ? '\u2212' : '+') + '\u00a0\u20ac\u00a0' + abs;
  }

  function fmtCard(val) {
    var abs = Math.abs(val).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (val < 0 ? '-' : '') + '\u20ac\u00a0' + abs;
  }

  function fmtKwh(val) {
    var abs = Math.abs(val).toLocaleString('nl-NL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return (val < 0 ? '-' : '') + '\u20ac\u00a0' + abs + ' / kWh';
  }

  function fmtNum(val, dec) {
    return val.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  // ─── All-in berekeningen ──────────────────────────────────────────────────

  function calcAllinDay(absInk, absVerk, gemInk, gemVerk) {
    var kWhImp = gemInk  !== 0 ? absInk  / Math.abs(gemInk)  : 0;
    var kWhExp = gemVerk !== 0 ? absVerk / Math.abs(gemVerk) : 0;
    var epexInk  = (gemInk  < 0 ?  absInk  : -absInk)  * BTW;
    var epexVerk = (gemVerk < 0 ? -absVerk :  absVerk) * BTW;
    var nettoImp = Math.max(0, kWhImp - kWhExp);
    var nettoExp = Math.max(0, kWhExp - kWhImp);
    var eb     = -nettoImp * EB + nettoExp * EB;
    var opslag = -(kWhImp + kWhExp) * OPSLAG;
    return { ink: epexInk, verk: epexVerk, eb: eb, opslag: opslag, tot: epexInk + epexVerk + eb + opslag };
  }

  function calcAllinMonth(kaalInkoop, kaalVerkoop, gemInkoop, gemVerkoop) {
    var absInk  = Math.abs(kaalInkoop);
    var absVerk = Math.abs(kaalVerkoop);
    var kWhImp  = gemInkoop  !== 0 ? absInk  / Math.abs(gemInkoop)  : 0;
    var kWhExp  = gemVerkoop !== 0 ? absVerk / Math.abs(gemVerkoop) : 0;
    var epexInk  = (gemInkoop  < 0 ?  absInk  : -absInk)  * BTW;
    var epexVerk = (gemVerkoop < 0 ? -absVerk :  absVerk) * BTW;
    var ebInk  = -kWhImp * EB;
    var ebVerk =  kWhExp * EB;
    var opslagInk  = -kWhImp * OPSLAG;
    var opslagVerk = -kWhExp * OPSLAG;
    var allinInk  = epexInk  + ebInk  + opslagInk;
    var allinVerk = epexVerk + ebVerk + opslagVerk;
    var btw = (epexInk - epexInk/BTW) + (epexVerk - epexVerk/BTW);
    var ebNetto = ebInk + ebVerk;
    var opslagTotaal = opslagInk + opslagVerk;
    var totaal = allinInk + allinVerk;
    var gemAllinInk  = kWhImp > 0 ? Math.abs(allinInk)  / kWhImp : 0;
    var gemAllinVerk = kWhExp > 0 ? Math.abs(allinVerk) / kWhExp : 0;
    var spread = gemAllinVerk - gemAllinInk;
    return {
      inkoop: allinInk, verkoop: allinVerk,
      eb: ebNetto, opslag: opslagTotaal, btw: btw, totaal: totaal,
      impPrijs: gemInkoop, expPrijs: gemVerkoop,
      gemAllinInk: gemAllinInk, gemAllinVerk: gemAllinVerk,
      spread: spread, kWhImp: kWhImp, kWhExp: kWhExp
    };
  }

  function calcAllinPriceImp(kaalPrijs) {
    return (kaalPrijs + EB + OPSLAG) * BTW;
  }

  function calcAllinPriceExp(kaalPrijs) {
    return (kaalPrijs + EB - OPSLAG) * BTW;
  }

  // ─── Data lezen ───────────────────────────────────────────────────────────

  function readOriginals() {
    var inkEl  = document.getElementById('summary-stroom-voordeel');
    var verkEl = document.getElementById('summary-deal-result');
    var totEl  = document.getElementById('summary-total-result');
    var buyEl  = document.getElementById('summary-buy-price');
    var sellEl = document.getElementById('summary-sell-price');
    if (!inkEl || !totEl || !buyEl) return null;
    return {
      inkoop:  parseEuro(inkEl.textContent),
      verkoop: verkEl ? parseEuro(verkEl.textContent) : null,
      totaal:  parseEuro(totEl.textContent),
      gemInk:  parseEuro(buyEl.textContent.split('/')[0]),
      gemVerk: sellEl ? parseEuro(sellEl.textContent.split('/')[0]) : null,
    };
  }

  function readDagData() {
    var tbody = document.getElementById('summary-table-body');
    if (!tbody) return null;
    var rows = tbody.querySelectorAll('tr');
    var data = [];
    rows.forEach(function(row) {
      var cells = row.querySelectorAll('td');
      if (cells.length < 5) return;
      var prijsTekst = cells[4].textContent.trim();
      var delen = prijsTekst.split(/kWh/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
      var gemInk  = delen[0] ? parseEuro(delen[0].split('/')[0]) : 0;
      var gemVerk = delen[1] ? parseEuro(delen[1].split('/')[0]) : 0;
      var impExp = cells.length > 7 ? parseKwhPair(cells[7].textContent) : { a: 0, b: 0 };
      var bat    = cells.length > 8 ? parseKwhPair(cells[8].textContent) : { a: 0, b: 0 };
      data.push({
        absInk:      Math.abs(parseEuro(cells[1].textContent) || 0),
        absVerk:     Math.abs(parseEuro(cells[2].textContent) || 0),
        gemInk:      gemInk || 0,
        gemVerk:     gemVerk || 0,
        impKwh:      impExp.a,
        expKwh:      impExp.b,
        batLaden:    bat.a,
        batOntladen: bat.b,
      });
    });
    return data.length > 0 ? data : null;
  }

  // ─── FPR berekening ───────────────────────────────────────────────────────
  // zoekende naar een methode om een score toe te kennen aan de prestatie als arbitrair systeem.
  // Momenteel zetten we elke verkochte kWh uit de accu af tegen elke in de accu geladen kWh.
  // Het directe huisverbruik tijdens arbitrage, en ook conversieverliezen, zijn waarschijnlijk niet makkelijk weg te filteren.
  function calcFpr(dagData) {
    if (!dagData || dagData.length === 0) return null;
    var gemLaden = dagData.reduce(function(a, d) { return a + d.batLaden; }, 0) / dagData.length;
    var isMaand = gemLaden > 200;
    var totLaadWaarde = 0, totOntlaadWaarde = 0, totLaadKwh = 0, totOntlaadKwh = 0;
    dagData.forEach(function(d) {
      var allinImp = calcAllinPriceImp(d.gemInk  || 0);
      var allinExp = calcAllinPriceExp(d.gemVerk || 0);
      var exportViaBat   = Math.min(d.expKwh || 0, d.batOntladen || 0);
      var verbruikViaBat = Math.max(0, (d.batOntladen || 0) - exportViaBat);
      var ontlaadWaarde = (exportViaBat * allinExp) + (verbruikViaBat * allinImp);
      var laadWaarde    = (d.batLaden || 0) * allinImp;
      totLaadKwh       += d.batLaden    || 0;
      totOntlaadKwh    += d.batOntladen || 0;
      totLaadWaarde    += laadWaarde;
      totOntlaadWaarde += ontlaadWaarde;
    });
    var gemLaadAllin    = totLaadKwh    > 0 ? totLaadWaarde    / totLaadKwh    : 0;
    var gemOntlaadAllin = totOntlaadKwh > 0 ? totOntlaadWaarde / totOntlaadKwh : 0;
    var fpr = totLaadWaarde > 0 ? totOntlaadWaarde / totLaadWaarde : null;
    return {
      fpr: fpr, gemLaadAllin: gemLaadAllin, gemOntlaadAllin: gemOntlaadAllin,
      totLaadKwh: totLaadKwh, totOntlaadKwh: totOntlaadKwh,
      nettoResultaat: totOntlaadWaarde - totLaadWaarde,
      perioden: dagData.length, isMaandWeergave: isMaand
    };
  }

  // ─── FPR widget ───────────────────────────────────────────────────────────

  function removeFprRow() {
    var el = document.getElementById('be-fpr-row');
    if (el) el.remove();
  }

  function fprKleur(fpr) {
    if (fpr === null) return '#888';
    if (fpr >= 1.8)  return '#198754';
    if (fpr >= 1.6)  return '#198754';
    if (fpr >= 1.4)  return '#6B3FA0';
    if (fpr >= 1.2)  return '#6B3FA0';
    if (fpr >= 1.05) return '#6B3FA0';
    if (fpr >= 1.0)  return '#fd7e14';
    return '#dc3545';
  }

  function fprLabel(fpr) {
    if (fpr === null) return '\u2013';
    if (fpr >= 1.8)  return 'Uitstekend';
    if (fpr >= 1.6)  return 'Zeer goed';
    if (fpr >= 1.4)  return 'Goed';
    if (fpr >= 1.2)  return 'Redelijk';
    if (fpr >= 1.05) return 'Matig';
    if (fpr >= 1.0)  return 'Break-even';
    return 'Verlies';
  }

  function addFprRow(dagData) {
    removeFprRow();
    var kaleWrapper = document.getElementById('be-kale-wrapper');
    if (!kaleWrapper) return;
    var fprData = calcFpr(dagData);
    if (!fprData) return;

    var fpr     = fprData.fpr;
    var kleur   = fprKleur(fpr);
    var label   = fprLabel(fpr);
    var fprTxt  = fpr !== null ? fmtNum(fpr, 2) : '\u2013';
    var pct     = Math.min(100, Math.max(0, ((fpr || 0) / 2) * 100));
    var periode = fprData.isMaandWeergave ? 'maanden' : 'dagen';
    var rendement = fpr !== null ? fmtNum((fpr - 1) * 100, 0) + '%' : '\u2013';
    var rendementPrefix = fpr !== null && fpr >= 1 ? '+' : '';

    var row = document.createElement('div');
    row.id = 'be-fpr-row';
    row.style.cssText = 'background:#f0edf7;border-radius:8px;padding:10px 16px 12px;margin-top:12px;margin-bottom:4px;';
    row.innerHTML =
      '<div style="font-size:10px;color:#9b7ec8;font-weight:600;letter-spacing:0.07em;margin-bottom:10px;">FINANCIAL PERFORMANCE RATIO (FPR)</div>' +
      '<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">' +
        '<div style="display:flex;align-items:center;gap:12px;min-width:160px;">' +
          '<span style="font-size:40px;font-weight:700;color:' + kleur + ';line-height:1;flex-shrink:0;">' + fprTxt + '</span>' +
          '<div style="display:flex;flex-direction:column;justify-content:center;gap:1px;">' +
            '<div style="font-size:13px;font-weight:700;color:' + kleur + ';">' + rendementPrefix + rendement + ' rendement</div>' +
            '<div style="font-size:11px;font-weight:600;color:' + kleur + ';opacity:0.85;">' + label + '</div>' +
            '<div style="font-size:10px;color:#7a7a7a;">ontladen \u00f7 laden</div>' +
          '</div>' +
        '</div>' +
        '<div style="width:1px;background:#ddd;height:40px;"></div>' +
        '<div style="display:flex;gap:24px;flex-wrap:wrap;flex:1;align-items:flex-start;">' +
          '<div style="font-size:11px;color:#7a7a7a;">' +
            '<div style="color:#7a7a7a;font-size:10px;margin-bottom:2px;">Accu laden</div>' +
            '<div style="font-weight:600;">' + fmtNum(fprData.totLaadKwh, 1) + ' kWh</div>' +
            '<div style="font-weight:700;color:#dc3545;">' + fmtNum(fprData.gemLaadAllin * 100, 1) + ' ct/kWh gem.</div>' +
          '</div>' +
          '<div style="font-size:11px;color:#7a7a7a;">' +
            '<div style="color:#7a7a7a;font-size:10px;margin-bottom:2px;">Accu ontladen</div>' +
            '<div style="font-weight:600;">' + fmtNum(fprData.totOntlaadKwh, 1) + ' kWh</div>' +
            '<div style="font-weight:700;color:#198754;">' + fmtNum(fprData.gemOntlaadAllin * 100, 1) + ' ct/kWh gem.</div>' +
          '</div>' +
          '<div style="font-size:11px;color:#7a7a7a;">' +
            '<div style="color:#7a7a7a;font-size:10px;margin-bottom:2px;">Netto resultaat</div>' +
            '<div style="font-weight:700;font-size:14px;color:' + (fprData.nettoResultaat >= 0 ? '#198754' : '#dc3545') + ';">' + fmt(fprData.nettoResultaat) + '</div>' +
            '<div style="color:#7a7a7a;font-size:10px;">' + fprData.perioden + ' ' + periode + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="min-width:180px;flex:1;">' +
          '<div style="display:flex;justify-content:space-between;font-size:9px;color:#7a7a7a;margin-bottom:3px;">' +
            '<span>0</span><span>0,5</span><span>1,0</span><span>1,5</span><span>2,0+</span>' +
          '</div>' +
          '<div style="height:8px;border-radius:4px;background:linear-gradient(to right,#dc3545,#fd7e14 25%,#6B3FA0 50%,#198754);position:relative;">' +
            '<div style="position:absolute;top:-3px;left:' + pct + '%;transform:translateX(-50%);width:14px;height:14px;border-radius:50%;background:white;border:2.5px solid ' + kleur + ';box-shadow:0 1px 4px rgba(0,0,0,0.2);"></div>' +
          '</div>' +
          '<div style="margin-top:6px;font-size:10px;color:#7a7a7a;text-align:right;">spread: ' + fmtNum((fprData.gemOntlaadAllin - fprData.gemLaadAllin) * 100, 1) + ' ct/kWh all-in</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px;font-size:10px;color:#7a7a7a;">factor x elke \u20ac1 aan laadkosten (net + PV) via export en eigen verbruik uit de accu</div>';

    kaleWrapper.after(row);
  }

  // ─── Voorschot & Verrekening widget ──────────────────────────────────────

  function removeVoorschotRow() {
    var el = document.getElementById('be-voorschot-row');
    if (el) el.remove();
  }

  function addVoorschotRow() {
    removeVoorschotRow();
    var fprRow = document.getElementById('be-fpr-row');
    if (!fprRow) return;

    var alleMaanden = leesAlleMaanden();
    VOORSCHOT_PM = parseFloat(localStorage.getItem(LS_VOORSCHOT) || '42.98');

    // EB verlies per maand bij geen saldering (kWhExp × EB × BTW)
    // Positief getal = verlies (minder ontvangst)
    function ebVerlies(m) {
      if (m.expKwh === null || m.expKwh === undefined) return 0;
      return m.expKwh * EB * BTW;
    }

    var bekendeMaanden = alleMaanden.filter(function(m) { return m.kosten !== null; });

    // Vaste kosten per bekende maand optellen (dagen x dagbedrag)
    var totaalVast = bekendeMaanden.reduce(function(a, m) {
      return a + dagenVerstreken(m.label) * VAST_DAG;
    }, 0);
    var totaalWerkelijk = bekendeMaanden.reduce(function(a, m) { return a + m.kosten; }, 0);
    // Bij geen2027: EB op export vervalt → kosten stijgen met ebVerlies per maand
    var totaalEbVerlies = geen2027
      ? bekendeMaanden.reduce(function(a, m) { return a + ebVerlies(m); }, 0)
      : 0;
    var totaalWerkelijkInclVast = totaalWerkelijk - totaalVast - totaalEbVerlies;
    var aantalBetaald   = bekendeMaanden.length;
    var totaalBetaald   = aantalBetaald * VOORSCHOT_PM;
    var openstaand      = totaalWerkelijkInclVast + totaalBetaald;
    var verstreken      = bekendeMaanden.length;
    var pct = Math.round((verstreken / 12) * 100);

    var saldoKleur     = openstaand < 0 ? '#dc3545' : '#198754';
    var werkelijkKleur = totaalWerkelijkInclVast < 0 ? '#dc3545' : '#198754';

    // Huidige maandlabel
    var huidigLabel = maandLabelUitTitel(_currentTitle);

    var cum = 0;
    var maandHtml = '';

    // Prognose: april als anker + seizoensverhoudingen uit historische export 2024/2025
    // Zodra een maand bezocht wordt met All-in aan, overschrijft localStorage de prognose
    var anker = leesAllin('Apr 2026');
    if (anker === null) anker = 90; // conservatieve schatting als april nog onbekend

    // Verhoudingen t.o.v. april gebaseerd op gem. export kWh 2024+2025
    // apr=898, mei=1200, jun=1187, jul=1055, aug=865, sep=663, okt=248
    var VERHOUDINGEN = {
      'Mei 2026': 1.34, 'Jun 2026': 1.32, 'Jul 2026': 1.18,
      'Aug 2026': 0.96, 'Sep 2026': 0.74, 'Okt 2026': 0.28
    };

    alleMaanden.forEach(function(m, i) {
      var isCurrent = m.label === huidigLabel;
      var isOnbekend = m.kosten === null;
      var progKosten;
      if (isOnbekend) {
        var verhouding = VERHOUDINGEN[m.label];
        var basisProg = verhouding !== undefined ? Math.round(anker * verhouding) : 0;
        // Bij geen2027: schat EB verlies op export als verhouding van anker export
        // Gebruik gem export als ~40% van stroomopbrengst bij zomer, minder bij overgang
        var ankerExpKwh = leesExpKwh('Apr 2026') || 0;
        var progEbVerlies = geen2027 && verhouding ? Math.round(ankerExpKwh * verhouding * EB * BTW) : 0;
        progKosten = basisProg - progEbVerlies;
      } else {
        progKosten = m.kosten;
      }

      // Positief saldo = te ontvangen, negatief = nog te betalen
      // Voorschot optellen omdat het de schuld vermindert
      cum += progKosten + VOORSCHOT_PM;

      var cumKleur = cum < 0 ? '#dc3545' : '#198754';
      var bg = isCurrent ? 'rgba(107,63,160,0.06)' : (i % 2 === 0 ? '#f7f5fc' : 'transparent');

      if (isOnbekend) {
        var kostenKleur = progKosten < 0 ? '#c8a0a0' : '#90c8a0';
        var progCumKleur = cum < 0 ? '#c8a0a0' : '#90c8a0';
        var balk = Math.min(100, Math.abs(progKosten) / 4);
        maandHtml +=
          '<div style="display:grid;grid-template-columns:90px 1fr 78px 72px 84px;gap:4px;align-items:center;padding:5px 4px;border-radius:4px;background:' + bg + ';opacity:0.55;">' +
            '<div style="font-size:11px;color:#9b7ec8;font-style:italic;">' + m.label + '</div>' +
            '<div style="height:5px;border-radius:3px;background:#eee;overflow:hidden;">' +
              '<div style="height:100%;width:' + balk + '%;background:' + kostenKleur + ';border-radius:3px;"></div>' +
            '</div>' +
            '<div style="text-align:right;font-size:11px;color:' + kostenKleur + ';font-style:italic;">~' + (progKosten < 0 ? '−' : '+') + '€' + Math.abs(progKosten).toFixed(0) + '</div>' +
            '<div style="text-align:right;font-size:11px;color:#7a7a7a;">+€' + VOORSCHOT_PM.toFixed(2) + '</div>' +
            '<div style="text-align:right;font-size:11px;font-style:italic;color:' + progCumKleur + ';">~' + (cum < 0 ? '−' : '+') + '€' + Math.abs(cum).toFixed(0) + '</div>' +
          '</div>';
      } else {
        var kostenKleur2 = m.kosten < 0 ? '#dc3545' : '#198754';
        var balk2 = Math.min(100, Math.abs(m.kosten) / 4);
        maandHtml +=
          '<div style="display:grid;grid-template-columns:90px 1fr 78px 72px 84px;gap:4px;align-items:center;padding:5px 4px;border-radius:4px;background:' + bg + ';">' +
            '<div style="font-size:11px;color:#333;font-weight:' + (isCurrent ? '600' : '400') + ';">' + m.label +
              (isCurrent ? ' <span style="font-size:9px;color:#9b7ec8;">●</span>' : '') +
            '</div>' +
            '<div style="height:5px;border-radius:3px;background:#eee;overflow:hidden;">' +
              '<div style="height:100%;width:' + balk2 + '%;background:' + kostenKleur2 + ';border-radius:3px;"></div>' +
            '</div>' +
            '<div style="text-align:right;font-size:11px;font-weight:500;color:' + kostenKleur2 + ';">' +
              (m.kosten < 0 ? '−' : '+') + '€' + Math.abs(m.kosten).toFixed(2) +
            '</div>' +
            '<div style="text-align:right;font-size:11px;color:#7a7a7a;">+€' + VOORSCHOT_PM.toFixed(2) + '</div>' +
            '<div style="text-align:right;font-size:11px;font-weight:500;color:' + cumKleur + ';">' +
              (cum < 0 ? '−' : '+') + '€' + Math.abs(cum).toFixed(0) +
            '</div>' +
          '</div>';
      }
    });

    var row = document.createElement('div');
    row.id = 'be-voorschot-row';
    row.style.cssText = 'background:#f0edf7;border-radius:8px;padding:10px 16px 12px;margin-top:12px;margin-bottom:4px;';
    row.innerHTML =
     // Hier nog even aan werken. Voorstelling situatie zonder eb bij export. Verbergt toggle.
//       '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
//         '<div style="font-size:10px;color:#9b7ec8;font-weight:600;letter-spacing:0.07em;">VOORSCHOT &amp; VERREKENING</div>' +
//         '<label id="be-2027-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:10px;color:' + (geen2027 ? '#dc3545' : '#aaa') + ';font-weight:500;">' +
//           '<span>Scenario 2027+ (geen saldering)</span>' +
//           '<div id="be-2027-track" style="position:relative;width:36px;height:18px;border-radius:9px;background:' + (geen2027 ? '#dc3545' : '#ddd') + ';transition:background 0.2s;flex-shrink:0;">' +
//             '<div id="be-2027-thumb" style="position:absolute;top:2px;left:' + (geen2027 ? '18px' : '2px') + ';width:14px;height:14px;border-radius:7px;background:white;transition:left 0.2s;"></div>' +
//           '</div>' +
//         '</label>' +
//       '</div>' +
//       '<div style="font-size:11px;color:#7a7a7a;margin-bottom:12px;">Contractjaar 4 nov 2025 \u2013 3 nov 2026 \u00b7 ' +
//         '<span style="color:#9b7ec8;">' + verstreken + ' van 12 maanden opgeslagen</span>' +
//         (geen2027 ? ' \u00b7 <span style="color:#dc3545;font-weight:600;">EB export vervalt</span>' : '') +
//       '</div>' +

      '<div style="display:flex;gap:0;margin-bottom:14px;border:0.5px solid #ddd;border-radius:8px;overflow:hidden;flex-wrap:wrap;">' +
        '<div style="flex:1;padding:10px 14px;min-width:140px;">' +
          '<div style="font-size:11px;color:#7a7a7a;margin-bottom:2px;">Betaald t/m nu</div>' +
          '<div style="font-size:20px;font-weight:700;color:#333;">+\u20ac ' + totaalBetaald.toFixed(2) + '</div>' +
          '<div style="font-size:10px;color:#7a7a7a;">' + aantalBetaald + ' \u00d7 \u20ac ' + VOORSCHOT_PM.toFixed(2) + '</div>' +
        '</div>' +
        '<div style="width:0.5px;background:#ddd;"></div>' +
        '<div style="flex:1;padding:10px 14px;min-width:140px;">' +
          '<div style="font-size:11px;color:#7a7a7a;margin-bottom:2px;">Werkelijk t/m nu</div>' +
          '<div style="font-size:20px;font-weight:700;color:' + werkelijkKleur + ';">' +
            (totaalWerkelijkInclVast < 0 ? '\u2212' : '+') + ' \u20ac ' + Math.abs(totaalWerkelijkInclVast).toFixed(2) +
          '</div>' +
          '<div style="font-size:10px;color:#7a7a7a;">stroom + netbeheer + belastingen</div>' +
        '</div>' +
        '<div style="width:0.5px;background:#ddd;"></div>' +
        '<div style="flex:1;padding:10px 14px;min-width:140px;">' +
          '<div style="font-size:11px;color:#7a7a7a;margin-bottom:2px;">Huidig saldo</div>' +
          '<div style="font-size:20px;font-weight:700;color:' + saldoKleur + ';">' + fmtV(openstaand) + '</div>' +
          '<div style="font-size:10px;color:#7a7a7a;">' + (openstaand < 0 ? 'nog te betalen' : 'te ontvangen') + '</div>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#7a7a7a;margin-bottom:3px;">' +
          '<span>4 nov 2025</span>' +
          '<span style="color:#9b7ec8;font-weight:600;">\u25cf nu (' + verstreken + ' mnd)</span>' +
          '<span>3 nov 2026</span>' +
        '</div>' +
        '<div style="height:8px;background:#e9e4f5;border-radius:4px;position:relative;">' +
          '<div style="height:100%;width:' + pct + '%;background:#6B3FA0;border-radius:4px;"></div>' +
          '<div style="position:absolute;top:-3px;left:' + pct + '%;transform:translateX(-50%);width:14px;height:14px;border-radius:50%;background:white;border:2.5px solid #6B3FA0;box-shadow:0 1px 3px rgba(0,0,0,0.15);"></div>' +
        '</div>' +
        '<div style="font-size:10px;color:#7a7a7a;margin-top:3px;">' + verstreken + ' van 12 maanden \u00b7 ' + pct + '% van contractjaar</div>' +
      '</div>' +

      '<details id="be-maand-details" style="margin-top:8px;">' +
        '<summary style="cursor:pointer;font-size:11px;color:#7a7a7a;list-style:none;">\u25b6 Maanddetails tonen</summary>' +
        '<div style="margin-top:8px;border-top:0.5px solid #ddd;padding-top:8px;">' +
          '<div style="display:grid;grid-template-columns:90px 1fr 78px 72px 84px;gap:4px;font-size:10px;color:#7a7a7a;padding:0 4px 5px;border-bottom:0.5px solid #ddd;margin-bottom:4px;">' +
            '<div>Maand</div><div></div><div style="text-align:right;">All-in</div><div style="text-align:right;">Voorschot</div><div style="text-align:right;">Cum. saldo</div>' +
          '</div>' +
          maandHtml +
          '<div style="margin-top:8px;font-size:10px;color:#7a7a7a;">Automatisch opgeslagen per bezochte maand \u00b7 werkelijk incl. Enexis nettarieven \u00b7 gedempt = prognose</div>' +
        '</div>' +
      '</details>';

    fprRow.after(row);

    // 2027 toggle click — via event delegation want innerHTML vervangt listeners
    row.addEventListener('click', function(e) {
      var lbl = e.target.closest('#be-2027-label');
      if (!lbl) return;
      e.preventDefault();
      geen2027 = !geen2027;
      addVoorschotRow();
    });

    // Toggle tekst op summary element
    var det = document.getElementById('be-maand-details');
    if (det) {
      det.addEventListener('toggle', function() {
        var sum = det.querySelector('summary');
        if (sum) sum.textContent = det.open ? '▼ Maanddetails verbergen' : '▶ Maanddetails tonen';
      });
    }
  }

  // ─── Maand toggle UI ──────────────────────────────────────────────────────

  function removeKaleWrapper() {
    var wrapper = document.getElementById('be-kale-wrapper');
    if (!wrapper) return;
    var savings = document.getElementById('summary-savings');
    if (savings) wrapper.parentElement.insertBefore(savings, wrapper);
    wrapper.remove();
  }

  function addKaleWrapper() {
    removeKaleWrapper();
    var savings = document.getElementById('summary-savings');
    if (!savings) return;
    var wrapper = document.createElement('div');
    wrapper.id = 'be-kale-wrapper';
    wrapper.style.cssText = 'background:#f0edf7;border-radius:8px;padding:6px 12px 10px;margin-top:12px;margin-bottom:4px;display:none;';
    var label = document.createElement('p');
    label.style.cssText = 'font-size:10px;color:#9b7ec8;margin:0 0 -12px;font-weight:600;letter-spacing:0.07em;';
    label.textContent = 'KALE TARIEVEN';
    wrapper.appendChild(label);
    savings.parentElement.insertBefore(wrapper, savings);
    savings.style.marginTop = '0';
    wrapper.appendChild(savings);
  }

  function removeExtraCards() {
    var el = document.getElementById('be-extra-cards');
    if (el) el.remove();
  }

  function addBreakdown(ai) {
    removeExtraCards();
    var totEl = document.getElementById('summary-total-result');
    if (!totEl) return;
    var card = totEl.closest('.border');
    if (!card) return;
    var breakdown = document.createElement('div');
    breakdown.id = 'be-extra-cards';
    breakdown.style.cssText = 'margin-top:10px;border-top:0.5px solid #ddd;padding-top:8px;font-size:12px;';
    [
      { label: 'BTW',              val: ai.btw    },
      { label: 'EB saldo (netto)', val: ai.eb     },
      { label: '2ct opslag',       val: ai.opslag },
    ].forEach(function(r) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:2px 0;color:#555;';
      row.innerHTML = '<span>' + r.label + '</span><span style="font-weight:600;color:' + (r.val >= 0 ? '#198754' : '#dc3545') + '">' + fmt(r.val) + '</span>';
      breakdown.appendChild(row);
    });
    var div = document.createElement('div');
    div.style.cssText = 'border-top:0.5px solid #ddd;margin:4px 0;';
    breakdown.appendChild(div);
    var totRow = document.createElement('div');
    totRow.style.cssText = 'display:flex;justify-content:space-between;padding:2px 0;font-weight:600;';
    totRow.innerHTML = '<span style="color:#555;">Totaal</span><span style="color:' + (ai.totaal >= 0 ? '#198754' : '#dc3545') + '">' + fmt(ai.totaal) + '</span>';
    breakdown.appendChild(totRow);
    card.appendChild(breakdown);
  }

  function addSubInfo(el, kWh, gemPrijs, kleur) {
    var existing = el.parentElement.querySelector('.be-sub-info');
    if (existing) existing.remove();
    var sub = document.createElement('div');
    sub.className = 'be-sub-info';
    sub.style.cssText = 'margin-top:6px;font-size:11px;color:#888;';
    sub.innerHTML = kWh.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) +
      ' kWh @ <span style="color:' + kleur + ';font-weight:600;">' + fmtKwh(gemPrijs) + ' all-in</span>';
    el.parentElement.appendChild(sub);
  }

  function addSpread(inkEl, spread) {
    if (!inkEl) return;
    document.querySelectorAll('.be-spread-col').forEach(function(el) { el.remove(); });
    var inkCol  = inkEl.closest('.col-12');
    var verkEl2 = document.getElementById('summary-deal-result');
    var verkCol = verkEl2 ? verkEl2.closest('.col-12') : null;
    if (!inkCol || !verkCol) return;
    var spCol = document.createElement('div');
    spCol.className = 'be-spread-col';
    spCol.style.cssText = 'flex:0 0 140px;max-width:140px;';
    var sp = document.createElement('div');
    sp.className = 'be-spread border h-100';
    sp.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:24px;border-radius:8px;background:#fff;min-height:100%;';
    sp.innerHTML =
      '<div style="font-size:10px;color:#9b7ec8;font-weight:600;letter-spacing:0.05em;">SPREAD</div>' +
      '<div style="font-size:22px;color:#6B3FA0;line-height:1.1;margin:2px 0;">\u2192</div>' +
      '<div style="font-size:11px;font-weight:700;color:#6B3FA0;white-space:nowrap;">+' + fmtKwh(spread) + '</div>';
    spCol.appendChild(sp);
    inkCol.style.flex = '1 1 0';
    verkCol.style.flex = '1 1 0';
    inkCol.after(spCol);
  }

  function setCardLabel(allin) {
    var inkEl = document.getElementById('summary-stroom-voordeel');
    if (!inkEl) return;
    var label = inkEl.closest('.border') ? inkEl.closest('.border').querySelector('.text-muted') : null;
    if (label) label.textContent = allin ? 'Netto verbruikskosten' : 'Kale stroom kosten';
  }

  function removeSubInfo() {
    document.querySelectorAll('.be-sub-info').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.be-spread-col').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.be-spread').forEach(function(el) { el.remove(); });
  }

  function isMaandTab() {
    var knoppen = Array.from(document.querySelectorAll('button, .btn, [role="button"]'));
    var maandKnop = knoppen.find(function(el) {
      return el.textContent && el.textContent.trim() === 'Maand';
    });
    if (!maandKnop) return false;
    return maandKnop.classList.contains('active') ||
           maandKnop.getAttribute('aria-pressed') === 'true' ||
           maandKnop.className.toLowerCase().indexOf('active') !== -1;
  }

  function applyCards(ai) {
    var inkEl  = document.getElementById('summary-stroom-voordeel');
    var verkEl = document.getElementById('summary-deal-result');
    var totEl  = document.getElementById('summary-total-result');
    var buyEl  = document.getElementById('summary-buy-price');
    var sellEl = document.getElementById('summary-sell-price');

    if (!allinMode) {
      removeExtraCards();
      removeKaleWrapper();
      removeSubInfo();
      removeFprRow();
      removeVoorschotRow();
      setCardLabel(false);
      if (inkEl)  { inkEl.textContent = fmtCard(_originals.inkoop); inkEl.style.color = ''; }
      if (verkEl) verkEl.textContent = fmtCard(_originals.verkoop);
      if (totEl)  { totEl.textContent = fmtCard(_originals.totaal); totEl.style.color = ''; }
      if (buyEl)  buyEl.textContent  = fmtKwh(_originals.gemInk);
      if (sellEl) sellEl.textContent = fmtKwh(_originals.gemVerk);
    } else {
      setCardLabel(true);

      // ── Sla all-in totaal op voor deze maand ──
      var maandLabel = maandLabelUitTitel(_currentTitle);
      if (maandLabel && ai && ai.totaal !== null) {
        slaAllinOp(maandLabel, ai.totaal, ai.kWhExp || 0);
      }

      var totKWhImp = _dagData ? _dagData.reduce(function(a, d) {
        return a + (d.absInk && d.gemInk ? d.absInk / Math.abs(d.gemInk) : 0);
      }, 0) : 0;
      var totKWhExp = _dagData ? _dagData.reduce(function(a, d) {
        return a + (d.absVerk && d.gemVerk ? d.absVerk / Math.abs(d.gemVerk) : 0);
      }, 0) : 0;
      var gemAllinInk  = totKWhImp > 0 ? Math.abs(ai.inkoop)  / totKWhImp : 0;
      var gemAllinVerk = totKWhExp > 0 ? Math.abs(ai.verkoop) / totKWhExp : 0;

      if (inkEl) {
        inkEl.textContent = fmtCard(ai.inkoop);
        inkEl.style.color = ai.inkoop >= 0 ? '#198754' : '#dc3545';
        addSubInfo(inkEl, totKWhImp, gemAllinInk, ai.inkoop >= 0 ? '#198754' : '#dc3545');
      }
      if (verkEl) {
        verkEl.textContent = fmtCard(ai.verkoop);
        addSubInfo(verkEl, totKWhExp, gemAllinVerk, '#198754');
      }
      if (totEl)  { totEl.textContent = fmtCard(ai.totaal); totEl.style.color = ai.totaal >= 0 ? '#198754' : '#dc3545'; }
      if (buyEl)  buyEl.textContent  = fmtKwh(ai.impPrijs);
      if (sellEl) sellEl.textContent = fmtKwh(ai.expPrijs);

      addSpread(inkEl, ai.spread);
      addBreakdown(ai);
      addKaleWrapper();
      addFprRow(_dagData);

      if (isMaandTab()) {
        addVoorschotRow();
      } else {
        removeVoorschotRow();
      }
    }
  }

  // ─── Toggle logica ────────────────────────────────────────────────────────

  function getChart() {
    var canvas = document.getElementById('summary-chart');
    if (!canvas || !window.Chart) return null;
    return Chart.getChart(canvas);
  }

  function applyChart(ai) {
    var chart = getChart();
    if (!chart) return;
    if (!_chartOriginals) {
      _chartOriginals = chart.data.datasets.map(function(ds) {
        return { label: ds.label, data: ds.data.slice(), backgroundColor: ds.backgroundColor };
      });
    }
    var orig = _chartOriginals;
    var n = chart.data.labels.length;
    chart.data.datasets = chart.data.datasets.filter(function(d) {
      return d.label !== 'EB saldo' && d.label !== '2ct opslag';
    });
    if (!allinMode) {
      chart.data.datasets.forEach(function(ds) {
        var o = orig.find(function(x) { return x.label === ds.label; });
        if (o) ds.data = o.data.slice();
      });
    } else {
      var dd = _dagData;
      if (dd && dd.length === n) {
        var res = dd.map(function(d) { return calcAllinDay(d.absInk, d.absVerk, d.gemInk, d.gemVerk); });
        chart.data.datasets.forEach(function(ds) {
          if (ds.label === 'Inkoop kosten')       ds.data = res.map(function(r) { return -r.ink; });
          if (ds.label === 'Verkoop opbrengsten') ds.data = res.map(function(r) { return r.verk; });
          if (ds.label === 'Totaal')              ds.data = res.map(function(r) { return r.tot; });
        });
        chart.data.datasets.push({ label: 'EB saldo',   data: res.map(function(r) { return r.eb; }),     backgroundColor: '#1D9E75', borderRadius: 0, order: 2 });
        chart.data.datasets.push({ label: '2ct opslag', data: res.map(function(r) { return r.opslag; }), backgroundColor: '#7F77DD', borderRadius: 0, order: 2 });
      }
    }
    chart.options.scales.y.min = undefined;
    chart.options.scales.y.max = undefined;
    chart.update('active');
  }

  function _doToggle() {
    allinMode = !allinMode;
    var ai = allinMode ? calcAllinMonth(
      _originals.inkoop, _originals.verkoop || 0,
      _originals.gemInk, _originals.gemVerk || 0) : null;
    applyCards(ai);
    applyChart(ai);
    var track  = document.getElementById('be-toggle-track');
    var thumb  = document.getElementById('be-toggle-thumb');
    var labelL = document.getElementById('be-label-kaal');
    var labelR = document.getElementById('be-label-allin');
    if (track && thumb) {
      track.style.background = allinMode ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)';
      thumb.style.transform  = allinMode ? 'translateX(44px)' : 'translateX(0)';
      if (labelL) labelL.style.opacity = allinMode ? '0.6' : '1';
      if (labelR) labelR.style.opacity = allinMode ? '1'   : '0.6';
    }
  }

  function toggle() {
    if (!_originals) {
      _originals = readOriginals();
      if (!_originals) return;
    }
    if (!_dagData) {
      var toggleBtn = document.getElementById('summary-table-toggle');
      var isCollapsed = toggleBtn && toggleBtn.classList.contains('collapsed');
      if (isCollapsed) {
        toggleBtn.click();
        setTimeout(function() { _dagData = readDagData(); _doToggle(); }, 400);
        return;
      }
      _dagData = readDagData();
    }
    _doToggle();
  }

  function injectToggle() {
    if (document.getElementById('be-toggle-track')) return;
    var header = document.querySelector('.card-header.custom-purple');
    if (!header) return;
    var chartNow = getChart();
    if (chartNow && !_chartOriginals) {
      _chartOriginals = chartNow.data.datasets.map(function(ds) {
        return { label: ds.label, data: ds.data.slice(), backgroundColor: ds.backgroundColor };
      });
    }
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:16px;cursor:pointer;user-select:none;';
    wrapper.addEventListener('click', toggle);
    var labelL = document.createElement('span');
    labelL.id = 'be-label-kaal';
    labelL.textContent = 'Kaal';
    labelL.style.cssText = 'font-size:12px;color:white;opacity:1;transition:opacity 0.2s;font-weight:500;';
    var track = document.createElement('div');
    track.id = 'be-toggle-track';
    track.style.cssText = 'position:relative;width:96px;height:26px;border-radius:13px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.4);transition:background 0.2s;flex-shrink:0;';
    var thumb = document.createElement('div');
    thumb.id = 'be-toggle-thumb';
    thumb.style.cssText = 'position:absolute;top:2px;left:3px;width:44px;height:20px;border-radius:10px;background:white;transition:transform 0.2s;';
    track.appendChild(thumb);
    var labelR = document.createElement('span');
    labelR.id = 'be-label-allin';
    labelR.textContent = 'All-in';
    labelR.style.cssText = 'font-size:12px;color:white;opacity:0.6;transition:opacity 0.2s;font-weight:500;';
    wrapper.appendChild(labelL);
    wrapper.appendChild(track);
    wrapper.appendChild(labelR);

    // ── Tandwieltje ──
    var gear = document.createElement('span');
    gear.id = 'be-gear';
    gear.textContent = '⚙';
    gear.title = 'Instellingen';
    gear.style.cssText = 'font-size:16px;color:white;cursor:pointer;opacity:0.7;margin-left:4px;user-select:none;transition:opacity 0.2s;';
    gear.addEventListener('mouseenter', function() { gear.style.opacity = '1'; });
    gear.addEventListener('mouseleave', function() { gear.style.opacity = '0.7'; });
    gear.addEventListener('click', function(e) {
      e.stopPropagation();
      var panel = document.getElementById('be-settings-panel');
      if (panel) { panel.remove(); return; }
      openSettingsPanel();
    });
    wrapper.appendChild(gear);

    var titleDiv = header.querySelector('.d-flex');
    if (titleDiv) titleDiv.appendChild(wrapper);
    else header.appendChild(wrapper);
  }

  // ─── Instellingenpaneel ───────────────────────────────────────────────────

  function openSettingsPanel() {
    var start = leesStartdatum();
    var dd = String(start.getDate()).padStart(2,'0');
    var mm = String(start.getMonth()+1).padStart(2,'0');
    var yyyy = start.getFullYear();
    var startStr = dd + '-' + mm + '-' + yyyy;

    var panel = document.createElement('div');
    panel.id = 'be-settings-panel';
    panel.style.cssText = 'position:absolute;top:60px;right:16px;z-index:9999;background:white;border:1px solid #ddd;border-radius:10px;padding:16px 20px;min-width:280px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-family:inherit;';

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="font-size:12px;font-weight:700;color:#6B3FA0;letter-spacing:0.05em;">INSTELLINGEN</div>' +
        '<span id="be-settings-close" style="cursor:pointer;font-size:18px;color:#aaa;line-height:1;">×</span>' +
      '</div>' +

      '<div style="margin-bottom:12px;">' +
        '<label style="font-size:11px;color:#555;display:block;margin-bottom:4px;">Voorschot per maand (€)</label>' +
        '<input id="be-cfg-voorschot" type="number" step="0.01" min="0" value="' + VOORSCHOT_PM.toFixed(2) + '" ' +
          'style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
      '</div>' +

      '<div style="margin-bottom:16px;">' +
        '<label style="font-size:11px;color:#555;display:block;margin-bottom:4px;">Startdatum contract (dd-mm-jjjj)</label>' +
        '<input id="be-cfg-startdatum" type="text" placeholder="04-11-2025" value="' + startStr + '" ' +
          'style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
      '</div>' +

      '<div style="display:flex;gap:8px;">' +
        '<button id="be-cfg-opslaan" style="flex:1;padding:8px;background:#6B3FA0;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Opslaan</button>' +
        '<button id="be-cfg-wis" style="padding:8px 12px;background:white;color:#dc3545;border:1px solid #dc3545;border-radius:6px;font-size:12px;cursor:pointer;" title="Wis alle opgeslagen maanddata">Wis data</button>' +
      '</div>' +

      '<div id="be-cfg-melding" style="margin-top:10px;font-size:11px;color:#198754;display:none;"></div>';

    document.body.appendChild(panel);

    document.getElementById('be-settings-close').addEventListener('click', function() { panel.remove(); });

    document.getElementById('be-cfg-opslaan').addEventListener('click', function() {
      var v = parseFloat(document.getElementById('be-cfg-voorschot').value);
      var s = document.getElementById('be-cfg-startdatum').value.trim();
      var delen = s.split('-');
      var melding = document.getElementById('be-cfg-melding');

      if (isNaN(v) || v <= 0) {
        melding.style.color = '#dc3545';
        melding.textContent = 'Ongeldig voorschotbedrag.';
        melding.style.display = 'block';
        return;
      }
      if (delen.length !== 3) {
        melding.style.color = '#dc3545';
        melding.textContent = 'Datum moet dd-mm-jjjj zijn.';
        melding.style.display = 'block';
        return;
      }
      var datum = new Date(parseInt(delen[2]), parseInt(delen[1])-1, parseInt(delen[0]));
      if (isNaN(datum.getTime())) {
        melding.style.color = '#dc3545';
        melding.textContent = 'Ongeldige datum.';
        melding.style.display = 'block';
        return;
      }

      localStorage.setItem(LS_VOORSCHOT, v.toFixed(2));
      localStorage.setItem(LS_STARTDATUM, datum.toISOString().split('T')[0]);
      VOORSCHOT_PM = v;

      melding.style.color = '#198754';
      melding.textContent = 'Opgeslagen! Pagina herladen om toe te passen.';
      melding.style.display = 'block';
    });

    document.getElementById('be-cfg-wis').addEventListener('click', function() {
      var melding = document.getElementById('be-cfg-melding');
      if (!confirm('Wis alle opgeslagen maanddata uit localStorage?')) return;
      Object.keys(localStorage).forEach(function(k) {
        if (k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
      });
      melding.style.color = '#fd7e14';
      melding.textContent = 'Maanddata gewist.';
      melding.style.display = 'block';
    });
  }

  // ─── Hoofd observer ───────────────────────────────────────────────────────

  function tryInject() {
    var titleEl = document.querySelector('.card-header.custom-purple');
    var newTitle = titleEl ? titleEl.textContent.trim() : null;
    if (newTitle && newTitle !== _currentTitle) {
      _currentTitle = newTitle;
      _originals = null;
      _chartOriginals = null;
      _dagData = null;
      allinMode = false;
      removeExtraCards();
      removeKaleWrapper();
      removeSubInfo();
      removeFprRow();
      removeVoorschotRow();
      var track = document.getElementById('be-toggle-track');
      var thumb = document.getElementById('be-toggle-thumb');
      var labelL = document.getElementById('be-label-kaal');
      var labelR = document.getElementById('be-label-allin');
      if (track) track.style.background = 'rgba(255,255,255,0.15)';
      if (thumb) thumb.style.transform = 'translateX(0)';
      if (labelL) labelL.style.opacity = '1';
      if (labelR) labelR.style.opacity = '0.6';
    }
    if (document.getElementById('summary-total-result')) injectToggle();
    if (!allinMode || !isMaandTab()) removeVoorschotRow();
  }

  var observer = new MutationObserver(tryInject);
  observer.observe(document.body, { childList: true, subtree: true });
  tryInject();
})();