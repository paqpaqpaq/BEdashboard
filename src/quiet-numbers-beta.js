/* Stabiele live cijfers op Actueel, altijd actief. */
(function () {
  'use strict';

  if (window.top !== window.self) return;

  var RUSTAAGH_RUNTIME_GUARD = 'data-be-rustaagh-runtime';
  if (document.documentElement.getAttribute(RUSTAAGH_RUNTIME_GUARD) === '5.0') return;
  document.documentElement.setAttribute(RUSTAAGH_RUNTIME_GUARD, '5.0');

  var STYLE_ID = 'be-stabiele-cijfers-stijl';
  var MARKER = 'be-stabiel-getal';
  var scanGepland = false;

  function voegStijlToe() {
    if (document.getElementById(STYLE_ID)) return;

    var stijl = document.createElement('style');
    stijl.id = STYLE_ID;
    stijl.textContent =
      '.' + MARKER + '{' +
        'display:inline-block!important;' +
        'box-sizing:content-box!important;' +
        'max-width:100%!important;' +
        'white-space:nowrap!important;' +
        'font-variant-numeric:tabular-nums lining-nums!important;' +
        'font-feature-settings:"tnum" 1,"lnum" 1!important;' +
      '}' +
      '.' + MARKER + ',.' + MARKER + ' *{' +
        'font-variant-numeric:tabular-nums lining-nums!important;' +
        'font-feature-settings:"tnum" 1,"lnum" 1!important;' +
      '}' +
      '.' + MARKER + '[data-be-eenheid="w"]{width:8ch!important;}' +
      '.' + MARKER + '[data-be-eenheid="kw"]{width:7ch!important;}' +
      '.' + MARKER + '[data-be-eenheid="pct"]{width:5ch!important;}' +
      '.' + MARKER + '[data-be-eenheid="kwh"]{width:9ch!important;}' +
      '.' + MARKER + '[data-be-eenheid="eur"]{width:9ch!important;}' +
      '.' + MARKER + '[data-be-uitlijning="midden"]{text-align:center!important;}' +
      '.' + MARKER + '[data-be-uitlijning="rechts"]{text-align:right!important;}' +
      '.' + MARKER + '[data-be-uitlijning="links"]{text-align:left!important;}';

    (document.head || document.documentElement).appendChild(stijl);
  }

  function tekst(el) {
    return String(el && el.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function eenheidVan(waarde) {
    if (/^[+\-−]?\s*€\s*\d[\d\s.,]*$/i.test(waarde)) return 'eur';
    if (/^[+\-−]?\s*\d[\d\s.,]*\s*kWh$/i.test(waarde)) return 'kwh';
    if (/^[+\-−]?\s*\d[\d\s.,]*\s*kW$/i.test(waarde)) return 'kw';
    if (/^[+\-−]?\s*\d[\d\s.,]*\s*W$/i.test(waarde)) return 'w';
    if (/^[+\-−]?\s*\d[\d\s.,]*\s*%$/i.test(waarde)) return 'pct';
    return null;
  }

  function vindTitelElement(titel) {
    var alles = document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span');

    for (var i = 0; i < alles.length; i++) {
      if (tekst(alles[i]) === titel) return alles[i];
    }

    return null;
  }

  function aantalMeetwaarden(wortel) {
    if (!wortel) return 0;

    var aantal = 0;
    var alles = wortel.querySelectorAll('*');

    for (var i = 0; i < alles.length; i++) {
      var waarde = tekst(alles[i]);
      if (!eenheidVan(waarde)) continue;

      /* Tel één DOM-laag per getal, ook wanneer React dezelfde tekst nestelt. */
      var dubbelKind = false;
      for (var j = 0; j < alles[i].children.length; j++) {
        if (tekst(alles[i].children[j]) === waarde) {
          dubbelKind = true;
          break;
        }
      }
      if (!dubbelKind) aantal++;
    }

    return aantal;
  }

  function vindPaneel(titel) {
    var titelElement = vindTitelElement(titel);
    if (!titelElement) return null;

    var minimaal = titel === 'Laatste meting' ? 4 : 3;
    var paneel = titelElement;

    while (paneel.parentElement && paneel !== document.body) {
      paneel = paneel.parentElement;

      /*
       * Zoek de eerste voorouder die titel én meetwaarden bevat. Dit gebruikt
       * de DOM-inhoud in plaats van browserafhankelijke pixelafmetingen.
       */
      if (aantalMeetwaarden(paneel) >= minimaal) return paneel;
    }

    return null;
  }

  function actueelPaneelNummer(el, panelen) {
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.top < 0) return -1;

    for (var i = 0; i < panelen.length; i++) {
      if (panelen[i] && panelen[i].contains(el)) return i;
    }

    return -1;
  }

  function buitensteZelfdeWaarde(el, waarde) {
    var huidig = el;

    while (huidig.parentElement) {
      var ouder = huidig.parentElement;
      var r = ouder.getBoundingClientRect();

      if (tekst(ouder) !== waarde || r.width > 220 || r.height > 90) break;
      huidig = ouder;
    }

    return huidig;
  }

  function markeerActueleCijfers() {
    scanGepland = false;
    voegStijlToe();

    var elementen = document.body ? document.body.querySelectorAll('*') : [];
    var panelen = [vindPaneel('Live Status'), vindPaneel('Laatste meting')];

    for (var i = 0; i < elementen.length; i++) {
      var el = elementen[i];
      var waarde = tekst(el);
      var eenheid = eenheidVan(waarde);
      var paneelNummer = actueelPaneelNummer(el, panelen);

      if (!eenheid || paneelNummer < 0) continue;

      /*
       * Het SOC-bolletje ligt ín de batterijtekening. Een geforceerde
       * breedte op dat element vervormt daarom het volledige pictogram.
       * De losse SOC-regel rechts krijgt wel gewoon een vaste breedte.
       */
      if (paneelNummer === 0 && eenheid === 'pct') continue;

      var doel = buitensteZelfdeWaarde(el, waarde);
      doel.classList.add(MARKER);
      doel.setAttribute('data-be-eenheid', eenheid);
      doel.setAttribute(
        'data-be-uitlijning',
        paneelNummer === 0 ? 'midden' : 'rechts'
      );
    }
  }

  function planScan() {
    if (scanGepland) return;
    scanGepland = true;
    requestAnimationFrame(markeerActueleCijfers);
  }

  voegStijlToe();
  planScan();

  new MutationObserver(planScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.addEventListener('resize', planScan, { passive: true });
  window.addEventListener('popstate', planScan, { passive: true });
}());


