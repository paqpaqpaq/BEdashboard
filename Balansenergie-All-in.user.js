// ==UserScript==
// @name         Balansenergie All-in v4.5.4
// @namespace    paq.balansenergie
// @version      4.5.4
// @description  All-in Resultaten-dashboard met voorlopige dagen, schakelbare all-in kwartierprijzen op Actueel en Absurd Units in het Balans-resultaat bij All-in AAN.
// @homepageURL  https://github.com/paqpaqpaq/BEdashboard
// @supportURL   https://github.com/paqpaqpaq/BEdashboard/issues
// @updateURL    https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.meta.js
// @downloadURL  https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js
// @match        *://dashboard.balansenergie.nl/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /*
   * Safari Userscripts kan dezelfde userscriptbron zowel in de paginawereld
   * als via zijn content-fallback starten. Beide werelden delen de DOM.
   * Laat daarom precies één instantie de Resultaten-UI en zijn periodecache
   * beheren; anders kan een tweede instantie de gekozen jaarstand weer met
   * zijn eigen beginstand overschrijven.
   */
  var BE_RUNTIME_GUARD =
    'data-be-allin-runtime';

  if (
    document.documentElement.hasAttribute(
      BE_RUNTIME_GUARD
    )
  ) {
    return;
  }

  document.documentElement.setAttribute(
    BE_RUNTIME_GUARD,
    '4.5.4'
  );

  var EB_BASIS = 0.09161;
  var BTW      = 1.21;
  var EB       = 0.11085;
  var OPSLAG   = 0.02;

  var LEV_DAG = 0.2184;
  var TRA_DAG = 1.3861;
  var VER_DAG = 628.96 / 365;
  var VAST_DAG = VER_DAG - LEV_DAG - TRA_DAG;

  var LS = {
    voorschot:    'be_cfg_voorschot',
    startdatum:   'be_cfg_startdatum',
    saldering:    'be_cfg_saldering',
    balansBlok:      'be_cfg_balansblok',
    allin:           'be_cfg_allin_aan',
    actueelAllin:    'be_cfg_actueel_allin',
    voorlopigeDagen: 'be_provisional_days_v43',
    voorlopigeAudit: 'be_provisional_audit_v1'
  };

  var MND_KORT = [
    'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'
  ];

  var MND_LANG = [
    'januari', 'februari', 'maart', 'april',
    'mei', 'juni', 'juli', 'augustus',
    'september', 'oktober', 'november', 'december'
  ];

  var D = {
    rand:       '#e8e2f0',
    label:      '#8c6fb5',
    paars:      '#6B3FA0',
    paarsLicht: '#9b7ec8',
    rood:       '#dc3545',
    groen:      '#198754',
    oranje:     '#e07b00',
    grijs:      '#6c757d',
    inkt:       '#2b2733',
    roodZacht:  '#c8a0a0',
    groenZacht: '#90c8a0'
  };

  var cfg = {
    voorschot: parseFloat(
      localStorage.getItem(LS.voorschot) || '42.98'
    ),

    start: (function () {
      var s = localStorage.getItem(LS.startdatum);

      if (s) {
        var d = new Date(s);
        if (!isNaN(d)) return d;
      }

      return new Date('2025-11-04');
    })(),

    saldering:
      localStorage.getItem(LS.saldering) !== 'uit',

    balansBlok:
      localStorage.getItem(LS.balansBlok) !== 'uit',

    // Resultaten begint bij iedere paginalaad met de originele Balans-data.
    allin: false
  };

  var salderingPrognose = false;

  function n2(v) {
    return String(v).padStart(2, '0');
  }

  function iso(d) {
    return (
      d.getFullYear() +
      '-' +
      n2(d.getMonth() + 1) +
      '-' +
      n2(d.getDate())
    );
  }

  // Alleen in deze pagina opnieuw gevalideerde resultaten mogen worden gebruikt.
  var voorlopigeSessie = String(Date.now()) + ':' + Math.random();

  function voorlopigeDagGrenzen(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null;
    var start = new Date(key + 'T00:00:00');
    if (!Number.isFinite(start.getTime()) || iso(start) !== key) return null;
    var eind = new Date(start.getTime());
    eind.setDate(eind.getDate() + 1);
    return { start: start.getTime(), eind: eind.getTime() };
  }

  function voorlopigeBerekeningGeldig(key, res, vanaf, tot) {
    var g = voorlopigeDagGrenzen(key);
    if (!g || !res || !(res.stukken > 0) || res.ongeldig) return false;
    if (vanaf !== g.start || tot <= vanaf || tot > g.eind || tot > Date.now()) return false;
    if (res.bronVanaf !== vanaf || res.bronTot !== tot) return false;
    if (!['importKwh', 'exportKwh', 'inkoopEur', 'verkoopEur', 'gedekt'].every(function (k) {
      return Number.isFinite(res[k]);
    }) || res.importKwh < 0 || res.exportKwh < 0) return false;
    // Datumzekerheid staat los van dekking: een aantoonbaar deelresultaat is geldig.
    return res.gedekt > 0 && res.gedekt <= tot - vanaf;

  }

  // Duurzaam bronarchief; geen automatische verwijdering van eerdere dagen.
  var beArchiefDb = null;
  var beArchiefFout = '';
  var beArchiefWachtrij = Promise.resolve();
  function beOpenArchief() {
    if (!beArchiefDb) beArchiefDb = new Promise(function (resolve, reject) {
      var req = indexedDB.open('balansenergie-bronnen-v1', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('dagen'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('Archief geblokkeerd')); };
    });
    return beArchiefDb;
  }
  async function beLeesBron(key) {
    var db = await beOpenArchief();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('dagen', 'readonly');
      var req = tx.objectStore('dagen').get(KLANT + ':' + key);
      req.onsuccess = function () { resolve(req.result || {}); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function beSchrijfBron(key, value) {
    var db = await beOpenArchief();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('dagen', 'readwrite');
      tx.objectStore('dagen').put(value, KLANT + ':' + key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Opslaan mislukt')); };
    });
  }
  function beVoegMetingenSamen(oud, nieuw) {
    var map = new Map((oud || []).map(function (r) { return [r.t, r]; }));
    (nieuw || []).forEach(function (r) {
      if (r && Number.isFinite(r.t) && Number.isFinite(r.po)) map.set(r.t, { t: r.t, po: r.po });
    });
    return Array.from(map.values()).sort(function (a,b) { return a.t-b.t; });
  }
  function beVoegPrijzenSamen(oud, nieuw, events) {
    var map = new Map((oud || []).map(function (p) { return [p.start, p]; }));
    (nieuw || []).forEach(function (p) {
      if (!p || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.end <= p.start) return;
      var vorig = map.get(p.start);
      if (vorig && vorig.end !== p.end) return;
      var values = Object.assign({}, vorig ? vorig.values : {});
      Object.keys(p.values || {}).forEach(function (k) {
        if (Number.isFinite(p.values[k])) values[k] = p.values[k];
      });
      if (!Object.keys(values).length) return;
      map.set(p.start, { start:p.start, end:p.end, values:values,
        afrr: !!(vorig && vorig.afrr) || (events || []).indexOf(p.start) !== -1 });
    });
    return Array.from(map.values()).sort(function (a,b) { return a.start-b.start; });
  }
  async function beVerwerkBron(u, j) {
    var prijs = u.pathname.indexOf('current-prices') !== -1;
    if (prijs) {
      var oud = await beLeesBron('prijzen');
      var rows = beVoegPrijzenSamen(oud.rows, j && j.prices, j && j.afrrEventIsps);
      if (j && Array.isArray(j.prices)) await beSchrijfBron('prijzen', { rows: rows });
      return { prices: rows, afrrEventIsps: rows.filter(function (p) { return p.afrr; }).map(function (p) { return p.start; }) };
    }
    var vanaf = Number(u.searchParams.get('start')), tot = Number(u.searchParams.get('end'));
    if (!Number.isFinite(vanaf) || !Number.isFinite(tot) || tot <= vanaf) throw new Error('Ongeldig archiefbereik');
    var nieuwPerDag = {};
    (j && Array.isArray(j.rows) ? j.rows : []).forEach(function (r) {
      if (!r || !Number.isFinite(r.t) || !Number.isFinite(r.po) || r.t < vanaf || r.t > tot) return;
      var key = iso(new Date(r.t));
      (nieuwPerDag[key] || (nieuwPerDag[key] = [])).push(r);
    });
    var dagen = await beLeesBron('index');
    var keys = dagen.keys || [];
    for (var key of Object.keys(nieuwPerDag)) {
      var oud = await beLeesBron(key);
      await beSchrijfBron(key, { rows: beVoegMetingenSamen(oud.rows, nieuwPerDag[key]) });
      if (keys.indexOf(key) === -1) keys.push(key);
    }
    await beSchrijfBron('index', { keys: keys.sort() });
    var samen = [];
    for (var key of keys) {
      var g = voorlopigeDagGrenzen(key);
      if (!g || g.eind < vanaf || g.start > tot) continue;
      var dag = await beLeesBron(key);
      samen = samen.concat((dag.rows || []).filter(function (r) { return r.t >= vanaf && r.t <= tot; }));
    }
    return { rows: samen.sort(function (a,b) { return a.t-b.t; }) };
  }
  async function beHaalBron(input, init) {
    var u = new URL(typeof input === 'string' ? input : input.href || input.url, location.origin);
    if (!/\/customer\/current-(history|prices)\/api\/$/.test(u.pathname)) return origFetch(input, init);
    var j = null;
    try {
      var resp = await origFetch(u.href, init);
      if (resp.ok) j = await resp.json();
    } catch (e) { /* Bij netwerkuitval blijft het archief leesbaar. */ }
    var werk = beArchiefWachtrij.then(function () { return beVerwerkBron(u, j); });
    beArchiefWachtrij = werk.catch(function () {});
    try {
      var data = await werk;
      beArchiefFout = '';
      return { ok: true, json: function () { return Promise.resolve(data); } };
    } catch (e) {
      beArchiefFout = 'Lokale opslag mislukt: ' + e.message;
      console.error('[BE archief]', beArchiefFout);
      return { ok: !!j, json: function () { return Promise.resolve(j); } };
    }
  }
  var beArchiefBezig = false;
  var beArchiefImportKlaar = false;
  async function beArchiefOnderhoud() {
    if (!KLANT || KLANT === 'account' || beArchiefBezig) return;
    beArchiefBezig = true;
    try {
      if (!beArchiefImportKlaar) {
        var migratie = await beLeesBron('console-import');
        var oudRapport = localStorage.getItem('be_brononderzoek_v1:' + KLANT);
        if (oudRapport && !migratie.klaar) {
          var importData = JSON.parse(oudRapport);
          var prijsUrl = new URL('/customer/current-prices/api/', location.origin);
          var taak = beArchiefWachtrij.then(function () {
            return beVerwerkBron(prijsUrl, { prices: Object.values(importData.prijzen || {}), afrrEventIsps: importData.afrrEventIsps || [] });
          });
          beArchiefWachtrij = taak.catch(function () {});
          await taak;
          await beSchrijfBron('console-import', { klaar: true });
        }
        beArchiefImportKlaar = true;
      }
      var nu = Date.now();
      var u = new URL('/customer/current-history/api/', location.origin);
      u.searchParams.set('installation', KLANT);
      u.searchParams.set('start', String(nu - 26 * 3600000));
      u.searchParams.set('end', String(nu));
      var res = await Promise.all([
        beHaalBron(u.href, { credentials:'same-origin', cache:'no-store' }),
        beHaalBron(location.origin + '/customer/current-prices/api/', { credentials:'same-origin', cache:'no-store' })
      ]);
      var prijzen = await res[1].json();
      if (!prijzen) return;
      var rijPrijzen = prijzen.prices.map(function (p) {
        var afrr = prijzen.afrrEventIsps.indexOf(p.start) !== -1;
        return { start:p.start,end:p.end,ki:p.values[afrr?'afrr_import':'onbalans_import'],ke:p.values[afrr?'afrr_export':'onbalans_export'] };
      });
      var index = await beLeesBron('index');
      for (var key of index.keys || []) {
        var g = voorlopigeDagGrenzen(key), dag = await beLeesBron(key);
        var tot = Math.min(nu, g.eind);
        if (tot <= g.start) continue;
        var berekend = actueelProjectieBereken((dag.rows || []).map(function (r) { return {x:r.t,y:r.po}; }), rijPrijzen, g.start, tot, nu);
        bewaarVoorlopigeDag(key, berekend, g.start, tot);
      }
      if (laatste) plan();
    } catch (e) {
      beArchiefFout = 'Lokale opslag niet beschikbaar: ' + e.message;
      console.error('[BE archief]', beArchiefFout);
    } finally { beArchiefBezig = false; }
    var melding = document.getElementById('be-archief-status');
    if (beArchiefFout && !melding && document.body) {
      melding = document.createElement('div'); melding.id='be-archief-status';
      melding.style.cssText='padding:10px;background:#fff0d6;color:#743900';
      document.body.prepend(melding);
    }
    if (melding) { melding.textContent=beArchiefFout; melding.hidden=!beArchiefFout; }
  }

  function leesVoorlopigeDagen() {
    try {
      var o =
        JSON.parse(
          localStorage.getItem(
            LS.voorlopigeDagen + ':' + KLANT
          ) || '{}'
        );

      if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
      Object.keys(o).forEach(function (k) {
        var r = o[k];
        if (!r || r.key !== k || r.archiefVersie !== 1 || r.klant !== KLANT) delete o[k];
      });
      return o;

    } catch (e) {
      return {};
    }
  }

  function schrijfVoorlopigeDagen(o) {
    try {
      localStorage.setItem(
        LS.voorlopigeDagen + ':' + KLANT,
        JSON.stringify(o || {})
      );
    } catch (e) {}
  }

  /*
   * Bewaar de laatste voorlopige berekening wanneer Balans dezelfde dag
   * definitief publiceert. Zo blijft een verschil achteraf controleerbaar;
   * de actieve voorlopige cache zelf kan daarna gewoon worden opgeruimd.
   */
  function bewaarVoorlopigeAudit(dagKey, voorlopig, definitief) {
    if (!voorlopig || !/^\d{4}-\d{2}-\d{2}$/.test(String(dagKey || ''))) {
      return;
    }

    try {
      var sleutel =
        LS.voorlopigeAudit + ':' + KLANT;

      var audit = JSON.parse(
        localStorage.getItem(sleutel) || '{}'
      );

      if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
        audit = {};
      }

      audit[dagKey] = {
        klant: KLANT,
        key: dagKey,
        voorlopig: voorlopig,
        definitief: definitief || null,
        vervangenOp: Date.now()
      };

      localStorage.setItem(
        sleutel,
        JSON.stringify(audit)
      );
    } catch (e) {}
  }

  function bewaarVoorlopigeDag(
    dagKey,
    res,
    vanaf,
    tot
  ) {
    var opslag = leesVoorlopigeDagen();
    if (!voorlopigeBerekeningGeldig(dagKey, res, vanaf, tot)) {
      // Minder beschikbare bronnen wissen nooit een eerder bewezen resultaat.
      return false;
    }
    var eerder = opslag[dagKey];
    if (eerder && Number.isFinite(eerder.gedektMs) && res.gedekt < eerder.gedektMs) return false;
    var nu = Date.now();
    var grenzen = voorlopigeDagGrenzen(dagKey);
    var volleDag = grenzen.eind - grenzen.start;

    opslag[dagKey] = {
      validatie: voorlopigeSessie,
      archiefVersie: 1,
      klant: KLANT,
      key:
        dagKey,

      voorlopig:
        true,

      deelresultaat: res.gedekt < volleDag * 0.995,

      imp:
        res.importKwh,

      exp:
        res.exportKwh,

      inkoop:
        res.inkoopEur,

      verkoop:
        res.verkoopEur,

      laden:
        0,

      ontladen:
        0,

      pv:
        0,

      afrrImp:
        0,

      afrrExp:
        0,

      afrrVergoeding:
        0,

      dealsAantal:
        0,

      gedektMs:
        res.gedekt,

      volledigheid:
        Math.min(
          100,
          Math.max(
            0,
            100 *
            res.gedekt /
            volleDag
          )
        ),

      gemetenVanaf:
        vanaf,

      gemetenTot:
        tot,

      bijgewerkt:
        nu
    };

    schrijfVoorlopigeDagen(
      opslag
    );
  }

  function voorlopigeDagenVoorMaand(
    mk,
    echteRijen
  ) {
    if (
      !/^\d{4}-\d{2}$/.test(
        String(mk || '')
      )
    ) {
      return [];
    }

    var opslag =
      leesVoorlopigeDagen();

    var echt = {};
    var gewijzigd = false;

    (echteRijen || [])
      .forEach(
        function (r) {
          if (
            r && r.bronAanwezig !== false &&
            /^\d{4}-\d{2}-\d{2}$/.test(
              String(r.key || '')
            )
          ) {
            echt[r.key] = r;

          }
        }
      );

    /*
     * Zodra Balans een datum zelf levert, wint die altijd.
     * De lokale voorlopige kopie kan dan meteen weg.
     */
    Object.keys(opslag)
      .forEach(
        function (k) {
          if (echt[k]) {
            bewaarVoorlopigeAudit(
              k,
              opslag[k],
              echt[k]
            );

            delete opslag[k];
            gewijzigd = true;
          }
        }
      );

    if (gewijzigd) {
      schrijfVoorlopigeDagen(
        opslag
      );
    }

    var vandaag =
      iso(new Date());

    return Object.keys(opslag)
      .filter(
        function (k) {
          var r =
            opslag[k];

          return (
            k.indexOf(
              mk + '-'
            ) === 0 &&
            k <= vandaag &&
            !echt[k] &&
            r &&
            r.voorlopig &&
            Number.isFinite(
              r.inkoop
            ) &&
            Number.isFinite(
              r.verkoop
            )
          );
        }
      )
      .sort()
      .map(
        function (k) {
          return opslag[k];
        }
      );
  }

  function voorlopigDagLabel(key) {
    var p =
      String(key || '')
        .split('-');

    if (p.length !== 3) {
      return '~';
    }

    var maand =
      MND_KORT[
        parseInt(p[1], 10) - 1
      ] || '';

    return (
      '~' +
      parseInt(p[2], 10) +
      ' ' +
      maand.toLowerCase()
    );
  }

  function voorlopigeDagenTekst(
    rijen,
    mk
  ) {
    var dagen = {};

    (rijen || [])
      .forEach(
        function (r) {
          if (
            !r ||
            !r.voorlopig ||
            String(r.key || '')
              .indexOf(
                mk + '-'
              ) !== 0
          ) {
            return;
          }

          var d =
            parseInt(
              String(r.key)
                .slice(8, 10),
              10
            );

          if (d > 0) {
            dagen[d] = true;
          }
        }
      );

    var lijst =
      Object.keys(dagen)
        .map(
          function (d) {
            return parseInt(
              d,
              10
            );
          }
        )
        .sort(
          function (a, b) {
            return a - b;
          }
        );

    if (!lijst.length) {
      return '';
    }

    if (lijst.length === 1) {
      return (
        lijst[0] +
        ' voorlopig'
      );
    }

    if (lijst.length === 2) {
      return (
        lijst[0] +
        ' en ' +
        lijst[1] +
        ' voorlopig'
      );
    }

    return (
      lijst
        .slice(0, -1)
        .join(', ') +
      ' en ' +
      lijst[
        lijst.length - 1
      ] +
      ' voorlopig'
    );
  }

  function getal(v) {
    return (
      typeof v === 'number' &&
      isFinite(v)
    )
      ? v
      : 0;
  }

  function eur(v, dec) {
    if (dec === undefined) dec = 2;

    return (
      '\u20ac\u00a0' +
      Math.abs(v).toLocaleString(
        'nl-NL',
        {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec
        }
      )
    );
  }

  function eurT(v, dec) {
    if (dec === undefined) dec = 2;

    return (
      (v < 0 ? '\u2212' : '+') +
      '\u00a0\u20ac\u00a0' +
      Math.abs(v).toLocaleString(
        'nl-NL',
        {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec
        }
      )
    );
  }

  function eurCent(v) {
    return (
      (v < 0 ? '\u2212' : '+') +
      '\u20ac' +
      Math.abs(v).toLocaleString(
        'nl-NL',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      )
    );
  }

  function eurKort(v) {
    return (
      (v < 0 ? '\u2212' : '+') +
      '\u20ac' +
      Math.round(
        Math.abs(v)
      ).toLocaleString('nl-NL')
    );
  }

  function num(v, dec) {
    return getal(v).toLocaleString(
      'nl-NL',
      {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec
      }
    );
  }

  function kwh(v) {
    return num(v, 0) + ' kWh';
  }

  function ct(v) {
    return num(v * 100, 1) + ' ct';
  }

  function prijs(v) {
    return eur(v, 3) + ' / kWh';
  }

  function kleur(v) {
    return v < 0
      ? D.rood
      : D.groen;
  }

  function kleurZacht(v) {
    return v < 0
      ? D.roodZacht
      : D.groenZacht;
  }

  function maandLabel(mk) {
    var p = String(mk).split('-');

    return (
      MND_KORT[
        parseInt(p[1], 10) - 1
      ] +
      ' ' +
      p[0]
    );
  }

  function maandNaam(mk) {
    return MND_LANG[
      parseInt(
        String(mk).split('-')[1],
        10
      ) - 1
    ];
  }

  function dagenInMaand(mk) {
    var p = String(mk).split('-');

    return new Date(
      parseInt(p[0], 10),
      parseInt(p[1], 10),
      0
    ).getDate();
  }

  var dagenLopend = null;

  function haalLopendeDagen() {
    if (dagenLopend !== null) {
      return Promise.resolve(
        dagenLopend
      );
    }

    var mk =
      iso(new Date()).slice(0, 7);

    var u =
      new URL(
        location.origin +
        '/customer/' +
        KLANT +
        '/results-v2-api/'
      );

    u.searchParams.set(
      'interval',
      'month'
    );

    u.searchParams.set(
      'period',
      mk
    );

    u.searchParams.set(
      'include_vat',
      '1'
    );

    u.searchParams.set(
      'include_delivery_cost',
      '1'
    );

    return origFetch(
      u,
      {
        credentials: 'same-origin'
      }
    )

      .then(function (r) {
        return r.ok
          ? r.json()
          : null;
      })

      .then(function (j) {
        dagenLopend =
          (
            j &&
            Array.isArray(j.series)
          )
            ? j.series.length
            : 0;

        return dagenLopend;
      })

      .catch(function () {
        dagenLopend = 0;
        return 0;
      });
  }

  var cacheMaandDagen = {};

  function haalMaandDagen(mk) {
    if (cacheMaandDagen[mk]) {
      return Promise.resolve(
        cacheMaandDagen[mk]
      );
    }

    var u =
      new URL(
        location.origin +
        '/customer/' +
        KLANT +
        '/results-v2-api/'
      );

    u.searchParams.set(
      'interval',
      'month'
    );

    u.searchParams.set(
      'period',
      mk
    );

    u.searchParams.set(
      'include_vat',
      '1'
    );

    u.searchParams.set(
      'include_delivery_cost',
      '1'
    );

    return origFetch(
      u,
      {
        credentials: 'same-origin'
      }
    )

      .then(function (r) {
        return r.ok
          ? r.json()
          : null;
      })

      .then(function (j) {
        var pv =
          (j && j.pricing) || {};

        var rijen =
          (
            j &&
            Array.isArray(j.series)
          )
            ? j.series.map(
                function (s) {
                  return naarIncl(
                    s,
                    pv
                  );
                }
              )
            : [];

        cacheMaandDagen[mk] =
          rijen;

        return rijen;
      })

      .catch(function () {
        cacheMaandDagen[mk] = [];
        return [];
      });
  }

  function dagenVerstreken(mk) {
    var nu = new Date();

    var lopend =
      iso(nu).slice(0, 7);

    if (mk === lopend) {
      return dagenLopend !== null
        ? dagenLopend
        : nu.getDate();
    }

    if (mk > lopend) {
      return 0;
    }

    return dagenInMaand(mk);
  }

  function voorschotVoor(
    mk,
    dagen,
    geschat
  ) {
    if (
      geschat ||
      !mk ||
      !/^\d{4}-\d{2}$/.test(
        String(mk)
      )
    ) {
      return cfg.voorschot;
    }

    var totaal =
      dagenInMaand(mk);

    if (
      !(dagen > 0) ||
      dagen >= totaal
    ) {
      return cfg.voorschot;
    }

    return (
      cfg.voorschot *
      dagen /
      totaal
    );
  }

  function isLopendeMaand(mk) {
    return (
      mk ===
      iso(
        new Date()
      ).slice(0, 7)
    );
  }

  function naSaldering(mk) {
    return (
      parseInt(
        String(mk).slice(0, 4),
        10
      ) >= 2027
    );
  }

  function contractMaanden() {
    var uit = [];

    for (
      var i = 0;
      i < 12;
      i++
    ) {
      var d =
        new Date(
          cfg.start.getFullYear(),
          cfg.start.getMonth() + i,
          1
        );

      uit.push(
        d.getFullYear() +
        '-' +
        n2(
          d.getMonth() + 1
        )
      );
    }

    return uit;
  }

  function el(
    tag,
    css,
    html
  ) {
    var e =
      document.createElement(tag);

    if (css) {
      e.style.cssText = css;
    }

    if (html !== undefined) {
      e.innerHTML = html;
    }

    return e;
  }

  function kaart(
    id,
    titel,
    rechts
  ) {
    var c =
      el(
        'div',
        'background:#fff;' +
        'border:1px solid ' +
        D.rand +
        ';border-radius:10px;' +
        'padding:15px 18px 17px;' +
        'margin-top:14px;' +
        'box-shadow:0 1px 4px rgba(107,63,160,.06);'
      );

    c.id = id;

    if (titel) {
      c.appendChild(
        el(
          'div',
          'display:flex;' +
          'align-items:center;' +
          'justify-content:space-between;' +
          'gap:12px;' +
          'margin-bottom:13px;',
          '<span style="' +
          'font-size:10px;' +
          'font-weight:700;' +
          'letter-spacing:.08em;' +
          'text-transform:uppercase;' +
          'color:' +
          D.label +
          ';">' +
          titel +
          '</span>' +
          (rechts || '')
        )
      );
    }

    return c;
  }

  function sectie(
    id,
    titel,
    rechts
  ) {
    var c =
      el(
        'div',
        'margin-top:20px;' +
        'padding-top:17px;' +
        'border-top:1px solid ' +
        D.rand +
        ';'
      );

    c.id = id;

    if (titel) {
      c.appendChild(
        el(
          'div',
          'display:flex;' +
          'align-items:center;' +
          'justify-content:space-between;' +
          'gap:12px;' +
          'margin-bottom:13px;',
          '<span style="' +
          'font-size:10px;' +
          'font-weight:700;' +
          'letter-spacing:.08em;' +
          'text-transform:uppercase;' +
          'color:' +
          D.label +
          ';">' +
          titel +
          '</span>' +
          (rechts || '')
        )
      );
    }

    return c;
  }

  var klantMatch =
    location.pathname.match(
      /^\/customer\/([^/]+)(?:\/|$)/
    );

  var KLANT =
    klantMatch
      ? klantMatch[1]
      : localStorage.getItem(
          'be_laatste_installatie'
        );

  function geldigeKlant(id) {
    return (
      !!id &&
      !/^(?:account|results|current-history|current-prices|undefined|null)$/i.test(
        id
      )
    );
  }

  function onthoudKlant(id) {
    if (!geldigeKlant(id)) {
      return false;
    }

    var gewijzigd =
      KLANT !== id;

    KLANT = id;

    try {
      localStorage.setItem(
        'be_laatste_installatie',
        id
      );
    } catch (e) {}

    return gewijzigd;
  }

  function klantUitUrl(waarde) {
    try {
      var u =
        new URL(
          waarde,
          location.origin
        );

      var installatie =
        u.searchParams.get(
          'installation'
        );

      if (
        geldigeKlant(
          installatie
        )
      ) {
        return installatie;
      }

      var m =
        u.pathname.match(
          /^\/customer\/([^/]+)\/(?:results|account)(?:\/|$)/
        );

      return (
        m &&
        geldigeKlant(m[1])
      )
        ? m[1]
        : null;

    } catch (e) {
      return null;
    }
  }

  function verversKlantUitPad() {
    var m = location.pathname.match(
      /^\/customer\/([^/]+)(?:\/|$)/
    );

    if (
      m &&
      geldigeKlant(m[1])
    ) {
      onthoudKlant(m[1]);

      return KLANT;
    }

    /*
     * Op de nieuwe Actueel-route staat het installatie-id niet meer in
     * location.pathname. De eigen history-aanvraag van het dashboard bevat
     * het id nog wel. Resource Timing werkt ook in Safari voor deze
     * same-origin-aanvraag en verandert niets aan de netwerklaag van Balans.
     */
    try {
      var bronnen =
        performance.getEntriesByType(
          'resource'
        );

      for (
        var i = bronnen.length - 1;
        i >= 0;
        i--
      ) {
        if (
          String(bronnen[i].name).indexOf(
            '/customer/current-history/api/'
          ) === -1
        ) {
          continue;
        }

        var uitBron =
          klantUitUrl(
            bronnen[i].name
          );

        if (uitBron) {
          onthoudKlant(
            uitBron
          );

          return KLANT;
        }
      }
    } catch (e) {}

    /*
     * Vang ook de situatie af waarin Safari Resource Timing opschoont:
     * de navigatielinks naar Resultaten/Account dragen hetzelfde id.
     */
    var links =
      document.querySelectorAll(
        'a[href*="/customer/"]'
      );

    for (
      var j = 0;
      j < links.length;
      j++
    ) {
      var uitLink =
        klantUitUrl(
          links[j].href
        );

      if (uitLink) {
        onthoudKlant(
          uitLink
        );

        break;
      }
    }

    return KLANT;
  }

  var origFetch =
    window.fetch.bind(window);


  /*
   * ============================================================
   * ACTUEEL
   * ============================================================
   */

  var ACTUEEL_SALDEERT =
    true;

  var actueelAan =
    localStorage.getItem(
      LS.actueelAllin
    ) !== 'uit';

  var actueelRijen = [];
  var actueelDagPunten = [];
  var actueelLaatstGeschreven = null;
  var actueelGestart = false;
  var actueelWasPagina = false;
  var actueelLaatsteKlant = null;
  var actueelHaalTimer = null;
  var actueelOnderhoudTimer = null;
  var actueelVoetnootTimer = null;
  
  function isActueelPagina() {
    return (
      /^\/customer\/?$/.test(
        location.pathname
      ) ||
      /^\/customer\/(?!account(?:\/|$)|results(?:\/|$))[^/]+\/?$/.test(
        location.pathname
      )
    );
  }

  function actueelEuro(v) {
    return (
      '\u20ac ' +
      v
        .toFixed(3)
        .replace(
          '.',
          ','
        )
    );
  }

  function actueelAllin(
    kaal,
    isExport
  ) {
    return isExport
      ? (
          kaal * BTW -
          OPSLAG +
          (
            ACTUEEL_SALDEERT
              ? EB
              : 0
          )
        )
      : (
          kaal * BTW +
          OPSLAG +
          EB
        );
  }

  var ACTUEEL_BRIDGE_CODE =
    "(function(){\n" +
    " if(window.__beActueelAllinBridge)return;\n" +
    " window.__beActueelAllinBridge=true;\n" +
    " var CANVAS='battery-chart';\n" +
    " var st={rijen:[],aan:true,eb:0.11085,btw:1.21,opslag:0.02,saldeert:true};\n" +
    " var ctxRef=null;\n" +
    " function chart(){return (typeof Chart!=='undefined'&&Chart.getChart)?Chart.getChart(CANVAS):null;}\n" +
    " function euro(v){return '\\u20ac '+v.toFixed(3).replace('.',',');}\n" +
    " function allin(kaal,isExport){return isExport?kaal*st.btw-st.opslag+(st.saldeert?st.eb:0):kaal*st.btw+st.opslag+st.eb;}\n" +
    " function wikkel(){\n" +
    "  var c=chart(); if(!c||!c.ctx)return;\n" +
    "  if(ctxRef===c.ctx&&c.ctx.__beAllinFillText)return;\n" +
    "  ctxRef=c.ctx;\n" +
    "  var basisFill=(c.ctx.__beAllinOrigFill||c.ctx.fillText).bind(c.ctx);\n" +
    "  c.ctx.__beAllinOrigFill=basisFill;\n" +
    "  c.ctx.fillText=function(tekst,x,y,mw){\n" +
    "   try{\n" +
    "    if(st.aan&&typeof tekst==='string'&&tekst.indexOf('\\u20ac')!==-1&&/(?:\\u2248|Import|Inkoop|Afname|Export|Teruglever|Injectie|ISP|Nu)/i.test(tekst)){\n" +
    "     var explicietExport=/(?:Export|Teruglever|Injectie)/i.test(tekst);\n" +
    "     var explicietImport=/(?:Import|Inkoop|Afname)/i.test(tekst);\n" +
    "     var isExport=explicietExport;\n" +
    "     var t=c.scales.x?c.scales.x.getValueForPixel(x):null;\n" +
    "     var m=tekst.match(/\\u20ac\\s*([+\\-\\u2212]?\\s*\\d+(?:[.,]\\d+)?)/);\n" +
    "     var kaal=m?parseFloat(m[1].replace(/\\s/g,'').replace('\\u2212','-').replace(',','.')):null;\n" +
    "     var rr=null;\n" +
    "     if(t!=null){\n" +
    "      for(var i=0;i<st.rijen.length;i++){\n" +
    "       if(st.rijen[i].start<=t&&st.rijen[i].end>t){rr=st.rijen[i];break;}\n" +
    "      }\n" +
    "     }\n" +
    "     if(rr&&!explicietExport&&!explicietImport&&kaal!=null&&isFinite(kaal))isExport=Math.abs(kaal-rr.ke)<Math.abs(kaal-rr.ki);\n" +
    "     if((kaal==null||!isFinite(kaal))&&rr)kaal=isExport?rr.ke:rr.ki;\n" +
    "     if(kaal!=null&&isFinite(kaal))tekst=tekst.replace(/\\u20ac\\s*[+\\-\\u2212]?\\s*\\d+(?:[.,]\\d+)?/,euro(allin(kaal,isExport)));\n" +
    "    }\n" +
    "   }catch(e){}\n" +
    "   return basisFill(tekst,x,y,mw);\n" +
    "  };\n" +
    "  c.ctx.__beAllinFillText=true;\n" +
    " }\n" +
    " function verver(){var c=chart();if(!c)return;if(typeof c.update==='function')c.update('none');if(typeof c.draw==='function')c.draw();}\n" +
    " document.addEventListener('be-actueel-allin-update',function(){\n" +
    "  var n=document.getElementById('be-actueel-allin-data');if(!n)return;\n" +
    "  try{st=Object.assign(st,JSON.parse(n.textContent||'{}'));wikkel();verver();}\n" +
    "  catch(e){console.error('[BE Actueel all-in bridge]',e);}\n" +
    " });\n" +
    " setInterval(wikkel,3000);\n" +
    " console.log('[BE Actueel all-in bridge] actief');\n" +
    "})();\n";

  function actueelInstalleerBridge() {
    if (!isActueelPagina()) {
      return;
    }

    /*
     * De bridge hoeft maar één keer geïnstalleerd te worden.
     * Belangrijk: hier NIET opnieuw actueelStuur() aanroepen,
     * anders wordt de Chart.js-grafiek iedere onderhoudsronde
     * opnieuw gerenderd.
     */
    if (
      document.getElementById(
        'be-actueel-allin-data'
      )
    ) {
      return;
    }

    var s =
      document.createElement(
        'script'
      );

    s.id =
      'be-actueel-allin-bridge';

    s.textContent =
      ACTUEEL_BRIDGE_CODE;

    (
      document.head ||
      document.documentElement
    ).appendChild(s);

    s.remove();
  }

  function actueelStuur() {
    if (!isActueelPagina()) {
      return;
    }

    var n =
      document.getElementById(
        'be-actueel-allin-data'
      );

    if (!n) {
      n =
        document.createElement(
          'script'
        );

      n.type =
        'application/json';

      n.id =
        'be-actueel-allin-data';

      document.documentElement
        .appendChild(n);
    }

    n.textContent =
      JSON.stringify({
        rijen:
          actueelRijen,

        aan:
          actueelAan,

        eb:
          EB,

        btw:
          BTW,

        opslag:
          OPSLAG,

        saldeert:
          ACTUEEL_SALDEERT
      });

    document.dispatchEvent(
      new Event(
        'be-actueel-allin-update'
      )
    );
  }

  function actueelHaal() {
    if (
      !isActueelPagina()
    ) {
      return Promise.resolve();
    }

    return beHaalBron(
      location.origin +
      '/customer/current-prices/api/',
      {
        credentials:
          'same-origin',

        cache:
          'no-store'
      }
    )

      .then(function (r) {
        return r.ok
          ? r.json()
          : null;
      })

      .then(function (j) {
        if (
          !j ||
          !Array.isArray(
            j.prices
          )
        ) {
          return;
        }

        var evts = {};

        (
          j.afrrEventIsps || []
        ).forEach(
          function (t) {
            evts[t] = true;
          }
        );

        actueelRijen =
          j.prices
            .map(
              function (p) {
                var v =
                  p.values || {};

                var a =
                  !!evts[
                    p.start
                  ];

                var ki =
                  a
                    ? v.afrr_import
                    : v.onbalans_import;

                var ke =
                  a
                    ? v.afrr_export
                    : v.onbalans_export;

                if (
                  typeof ki !==
                    'number' ||
                  !isFinite(ki)
                ) {
                  return null;
                }

                return {
                  start:
                    p.start,

                  end:
                    p.end,

                  ki:
                    ki,

                  ke:
                    ke
                };
              }
            )
            .filter(Boolean);

        actueelStuur();

        actueelWerkSchemaBij();
        actueelProjectieToon();

        console.log(
          '[BE Actueel all-in]',
          actueelRijen.length,
          'kwartieren, schakelaar',
          actueelAan
            ? 'aan'
            : 'uit'
        );
      })

      .catch(
        function (e) {
          console.warn(
            '[BE Actueel all-in] ophalen mislukt:',
            e.message
          );
        }
      );
  }

  function actueelHaalDagPunten() {
    if (
      !isActueelPagina() ||
      !KLANT
    ) {
      return Promise.resolve();
    }

    var beginVandaag =
      new Date();

    beginVandaag.setHours(
      0,
      0,
      0,
      0
    );

    var u =
      new URL(
        location.origin +
        '/customer/current-history/api/'
      );

    u.searchParams.set(
      'installation',
      KLANT
    );

    u.searchParams.set(
      'start',
      String(
        beginVandaag.getTime()
      )
    );

    u.searchParams.set(
      'end',
      String(
        Date.now()
      )
    );

    return beHaalBron(
      u,
      {
        credentials:
          'same-origin',

        cache:
          'no-store'
      }
    )

      .then(function (r) {
        return r.ok
          ? r.json()
          : null;
      })

      .then(function (j) {
        if (
          !j ||
          !Array.isArray(
            j.rows
          )
        ) {
          return;
        }

        actueelDagPunten =
          j.rows
            .filter(
              function (r) {
                return (
                  r &&
                  Number.isFinite(r.t) &&
                  Number.isFinite(r.po)
                );
              }
            )
            .map(
              function (r) {
                return {
                  x:
                    r.t,

                  y:
                    r.po
                };
              }
            )
            .sort(
              function (a, b) {
                return a.x - b.x;
              }
            );

        actueelProjectieToon();
      })

      .catch(
        function (e) {
          console.warn(
            '[BE Actueel] daghistorie ophalen mislukt:',
            e.message
          );
        }
      );
  }
    
  function actueelHuidigeRij() {
    var nu =
      Date.now();

    for (
      var i = 0;
      i < actueelRijen.length;
      i++
    ) {
      if (
        actueelRijen[i].start <= nu &&
        actueelRijen[i].end > nu
      ) {
        return actueelRijen[i];
      }
    }

    return null;
  }

  function actueelWerkSchemaBij() {
    if (!isActueelPagina()) {
      return;
    }

    var e =
      document.getElementById(
        'flow-grid-price'
      );

    if (!e) {
      return;
    }

    var t =
      e.textContent || '';

    if (!actueelAan) {
      var orig =
        e.getAttribute(
          'data-be-actueel-orig'
        );

      if (
        orig &&
        t ===
          actueelLaatstGeschreven
      ) {
        e.textContent =
          orig;
      }

      actueelLaatstGeschreven =
        null;

      e.removeAttribute(
        'data-be-actueel-orig'
      );

      return;
    }

    if (
      t.indexOf('\u2248') === -1 ||
      t.indexOf('\u20ac') === -1
    ) {
      return;
    }

    if (
      t ===
      actueelLaatstGeschreven
    ) {
      return;
    }

    var isExport =
      /(?:Export|Teruglever|Injectie)/i.test(t);

    /*
     * Reken primair vanuit de kale prijs die Balans werkelijk toont.
     * Een ISP-label kan kortstondig bij een andere prijsregel horen dan
     * Date.now(); de zichtbare bronwaarde voorkomt dan een afwijking.
     */
    var m =
      t.match(
        /\u20ac\s*([+\-\u2212]?\s*\d+(?:[.,]\d+)?)/
      );

    var kaal =
      m
        ? parseFloat(
            m[1]
              .replace(/\s/g, '')
              .replace('\u2212', '-')
              .replace(',', '.')
          )
        : null;

    if (
      kaal == null ||
      !isFinite(kaal)
    ) {
      var r =
        actueelHuidigeRij();

      kaal =
        r
          ? (
              isExport
                ? r.ke
                : r.ki
            )
          : null;
    }

    if (
      kaal == null ||
      !isFinite(kaal)
    ) {
      return;
    }

    e.setAttribute(
      'data-be-actueel-orig',
      t
    );

    var nieuw =
      t.replace(
        /\u20ac\s*[+\-\u2212]?\s*\d+(?:[.,]\d+)?/,
        actueelEuro(
          actueelAllin(
            kaal,
            isExport
          )
        )
      );

    if (nieuw === t) {
      return;
    }

    e.textContent =
      nieuw;

    actueelLaatstGeschreven =
      nieuw;
  }

  function actueelVolgSchema() {
    if (!isActueelPagina()) {
      return;
    }

    var e =
      document.getElementById(
        'flow-grid-price'
      );

    if (
      !e ||
      e.getAttribute(
        'data-be-actueel-volgt'
      ) === '1'
    ) {
      return;
    }

    e.setAttribute(
      'data-be-actueel-volgt',
      '1'
    );

    new MutationObserver(
      function () {
        actueelWerkSchemaBij();
      }
    ).observe(
      e,
      {
        childList: true,
        characterData: true,
        subtree: true
      }
    );
  }

  function actueelLegenda() {
    if (!isActueelPagina()) {
      return null;
    }

    var legenda =
      document.querySelector(
        '.energy-chart-legend'
      );

    var fallback =
      document.getElementById(
        'be-actueel-bedieningshost'
      );

    if (legenda) {
      if (
        fallback &&
        !fallback.children.length
      ) {
        fallback.remove();
      }

      return legenda;
    }

    /*
     * Bij een verse landing ontbreekt de Balans-legenda in mobiele Safari
     * soms geheel. Maak dan direct een neutrale host buiten de grafiek.
     * Zodra Balans zijn eigen legenda toevoegt, verhuist de rij daarheen.
     */
    var canvas =
      document.getElementById(
        'battery-chart'
      );

    if (!canvas || !canvas.parentElement) {
      return null;
    }

    if (!fallback) {
      fallback =
        document.createElement(
          'div'
        );

      fallback.id =
        'be-actueel-bedieningshost';

      fallback.style.cssText =
        'display:block;' +
        'width:100%;' +
        'box-sizing:border-box;';

      var grafiekHost =
        canvas.parentElement;

      if (grafiekHost.parentElement) {
        grafiekHost.parentElement.insertBefore(
          fallback,
          grafiekHost.nextSibling
        );

      } else {
        grafiekHost.appendChild(
          fallback
        );
      }
    }

    return fallback;
  }

  function actueelVoegMobieleStijlToe() {
    if (
      document.getElementById(
        'be-actueel-mobiel-css'
      )
    ) {
      return;
    }

    var stijl =
      document.createElement(
        'style'
      );

    stijl.id =
      'be-actueel-mobiel-css';

    stijl.textContent =
      '@media (max-width: 700px) and (orientation: portrait){' +
        '#be-actueel-bedieningsrij{' +
          'display:flex!important;' +
          'flex-wrap:wrap!important;' +
          'align-items:stretch!important;' +
          'gap:8px!important;' +
        '}' +
        '#be-actueel-resultaat{' +
          'display:flex!important;' +
          'flex:1 1 100%!important;' +
          'width:100%!important;' +
          'min-width:0!important;' +
          'white-space:normal!important;' +
          'flex-wrap:wrap!important;' +
          'gap:6px 10px!important;' +
        '}' +
        '#be-actueel-resultaat>span:last-child{' +
          'flex:1 1 100%!important;' +
        '}' +
        '.be-actueel-toggle{' +
          'width:100%!important;' +
          'margin-left:0!important;' +
          'padding:9px 2px 1px!important;' +
          'border-left:0!important;' +
          'border-top:1px solid ' + D.rand + '!important;' +
          'justify-content:flex-end!important;' +
        '}' +
      '}';

    (
      document.head ||
      document.documentElement
    ).appendChild(
      stijl
    );
  }

    function actueelZorgBedieningsRij() {
      if (!isActueelPagina()) {
        return null;
      }

      var legenda =
        actueelLegenda();

      if (!legenda) {
        return null;
      }

      var rij =
        document.getElementById(
          'be-actueel-bedieningsrij'
        );

      if (!rij) {
        rij =
          document.createElement(
            'div'
          );

        rij.id =
          'be-actueel-bedieningsrij';
      }

      rij.style.cssText =
        'display:flex;' +
        'align-items:center;' +
        'width:100%;' +
        'box-sizing:border-box;' +
        'gap:16px;' +
        'margin-top:10px;' +
        'padding:9px 12px;' +
        'min-height:42px;' +
        'border:1px solid ' +
        D.rand +
        ';border-radius:10px;' +
        'background:#fff;' +
        'box-shadow:0 1px 4px rgba(107,63,160,.05);' +
        'font-size:12px;' +
        'line-height:1.2;' +
        'color:' +
        D.inkt +
        ';flex:0 0 100%;' +
        'grid-column:1 / -1;';

      /*
       * Gebruik het BESTAANDE resultaat als dat er al is.
       * Zo ontstaan geen twee elementen met hetzelfde ID.
       */
      var resultaten =
        document.querySelectorAll(
          '#be-actueel-resultaat'
        );

      var info =
        resultaten.length
          ? resultaten[0]
          : null;

      /*
       * Eventuele dubbele oude resultaat-elementen opruimen.
       */
      for (
        var i = 1;
        i < resultaten.length;
        i++
      ) {
        resultaten[i].remove();
      }

      if (!info) {
        info =
          document.createElement(
            'div'
          );

        info.id =
          'be-actueel-resultaat';

        info.setAttribute(
          'data-be-vandaag-info',
          '1'
        );
      }

      info.style.cssText =
        'display:flex;' +
        'align-items:center;' +
        'gap:11px;' +
        'white-space:nowrap;' +
        'min-width:0;' +
        'flex:1 1 auto;' +
        'font-variant-numeric:tabular-nums;';

      /*
       * Resultaat MOET links IN onze balk staan.
       */
      if (
        info.parentElement !==
        rij
      ) {
        rij.insertBefore(
          info,
          rij.firstChild
        );
      }

      /*
       * Balk MOET als volledige regel IN de Balans-legenda staan.
       */
      if (
        rij.parentElement !==
        legenda
      ) {
        legenda.appendChild(
          rij
        );
      }

      return rij;
    }
    
  function actueelTekenSchakelaar(b) {
    b =
      b ||
      document.querySelector(
        '[data-be-actueel-allin]'
      );

    if (!b) {
      return;
    }

    b.setAttribute(
      'aria-pressed',
      actueelAan
        ? 'true'
        : 'false'
    );

    b.title =
      actueelAan
        ? 'All-in prijzen uitschakelen'
        : 'All-in prijzen inschakelen';

    var track =
      b.querySelector(
        '[data-be-track]'
      );

    var thumb =
      b.querySelector(
        '[data-be-thumb]'
      );

    var status =
      b.querySelector(
        '[data-be-status]'
      );

    if (track) {
      track.style.background =
        actueelAan
          ? D.paars
          : '#9ca3af';
    }

    if (thumb) {
      thumb.style.transform =
        actueelAan
          ? 'translateX(16px)'
          : 'translateX(0)';
    }

    if (status) {
      status.textContent =
        actueelAan
          ? 'AAN'
          : 'UIT';
    }
  }

  function actueelZetAan(
    nieuweStand,
    b
  ) {
    actueelAan =
      !!nieuweStand;

    localStorage.setItem(
      LS.actueelAllin,
      actueelAan
        ? 'aan'
        : 'uit'
    );

    actueelTekenSchakelaar(
      b
    );

    actueelStuur();

    actueelWerkSchemaBij();

    actueelZetVoetnoot();
    actueelProjectieToon();

    if (actueelAan) {
      actueelHaal();
    }

    console.log(
      '[BE Actueel all-in] plugin',
      actueelAan
        ? 'aan'
        : 'uit'
    );
  }

    function actueelBouwSchakelaar() {
      var rij =
        actueelZorgBedieningsRij();

      if (!rij) {
        return;
      }

      var b =
        document.querySelector(
          '[data-be-actueel-allin]'
        );

      if (!b) {
        b =
          document.createElement(
            'button'
          );

        b.type =
          'button';

        b.dataset.beActueelAllin =
          '1';

        b.className =
          'be-actueel-toggle';

        b.innerHTML =
          '<span>All-in prijzen</span>' +

          '<span data-be-track style="' +
            'position:relative;' +
            'display:inline-block;' +
            'width:34px;' +
            'height:18px;' +
            'border-radius:999px;' +
            'flex-shrink:0;' +
            'transition:background .18s ease;' +
          '">' +

            '<span data-be-thumb style="' +
              'position:absolute;' +
              'left:2px;' +
              'top:2px;' +
              'width:14px;' +
              'height:14px;' +
              'border-radius:50%;' +
              'background:#fff;' +
              'box-shadow:0 1px 3px rgba(0,0,0,.35);' +
              'transition:transform .18s ease;' +
            '">' +
            '</span>' +

          '</span>' +

          '<span data-be-status style="' +
            'min-width:24px;' +
            'font-size:10px;' +
            'font-weight:700;' +
            'line-height:1;' +
          '">' +
          '</span>';

        b.addEventListener(
          'click',
          function () {
            actueelZetAan(
              !actueelAan,
              b
            );
          }
        );
      }

      b.className =
        'be-actueel-toggle';

      b.style.cssText =
        'appearance:none;' +
        '-webkit-appearance:none;' +
        'display:flex;' +
        'align-items:center;' +
        'gap:8px;' +
        'width:auto;' +
        'height:auto;' +
        'cursor:pointer;' +
        'border:0;' +
        'border-left:1px solid ' +
        D.rand +
        ';background:transparent;' +
        'padding:3px 2px 3px 14px;' +
        'margin-left:auto;' +
        'flex:0 0 auto;' +
        'white-space:nowrap;' +
        'color:' +
        D.inkt +
        ';font:inherit;' +
        'box-shadow:none;';

      /*
       * Toggle hoort ALTIJD rechts in onze eigen rij.
       *
       * Normaal gebeurt hier niets.
       * Alleen een foutief geplaatste/oude toggle wordt één keer
       * naar de juiste plek verplaatst.
       */
      if (
        b.parentElement !==
        rij
      ) {
        rij.appendChild(
          b
        );
      }

      actueelTekenSchakelaar(
        b
      );
    }

  var ACTUEEL_NOOT_ALLIN =
    'All-in prijzen per kWh: ' +
    'kale prijs × 1,21, ' +
    'plus € 0,02 leverkosten en ' +
    '€ 0,11085 energiebelasting incl. btw. ' +
    'Lopende kwartieren (ISP) zijn een schatting ' +
    'en worden ongeveer twee minuten na afloop vastgesteld.';

  var ACTUEEL_NOOT_KAAL =
    'Kale prijzen per kWh: ' +
    'actuele onbalans-/aFRR-prijs zonder btw, ' +
    'leverkosten en energiebelasting. ' +
    'Lopende kwartieren (ISP) zijn een schatting ' +
    'en worden ongeveer twee minuten na afloop vastgesteld.';

  function actueelZetVoetnoot() {
    if (!isActueelPagina()) {
      return;
    }

    var n =
      document.querySelector(
        'p.current-price-note'
      );

    if (!n) {
      return;
    }

    var tekst =
      actueelAan
        ? ACTUEEL_NOOT_ALLIN
        : ACTUEEL_NOOT_KAAL;

    if (
      n.textContent !==
      tekst
    ) {
      n.textContent =
        tekst;
    }

    n.style.color =
      actueelAan
        ? D.paars
        : D.grijs;
  }

  function actueelVolgVoetnoot() {
    if (actueelVoetnootTimer) {
      return;
    }

    /*
     * Geen MutationObserver op document.body:
     * Balans en de plugin kunnen anders elkaars tekstwijzigingen
     * direct blijven terugschrijven en zo de pagina blokkeren.
     * Een rustige timer houdt de voetnoot wel netjes actueel.
     */
    actueelVoetnootTimer =
      setInterval(
        function () {
          if (isActueelPagina()) {
            actueelZetVoetnoot();
          }
        },
        500
      );
  }

        
  /* Actueel: voorlopig variabel stroomresultaat over de grafiekperiode.
   * Netaansluiting is gemeten in W; positief = import, negatief = export.
   * Integreer lineair tussen metingen, gesplitst op prijsgrenzen en nul.
   * Geen extrapolatie voorbij de laatste meting; hiaten blijven zichtbaar.
   */
  function actueelProjectieBereken(punten, prijzen, vanaf, tot, nu) {
    var uit = { bedrag: 0, importKwh: 0, exportKwh: 0, gedekt: 0,
      inkoopEur: 0, verkoopEur: 0,
      ouder: 0, recent: 0, huidig: 0, stukken: 0,
      bronVanaf: vanaf, bronTot: tot, gaten: 0, ongeldig: false };
    var kwartier = 15 * 60 * 1000;
    var huidigStart = Math.floor(nu / kwartier) * kwartier;
    var reeks = punten.filter(function (p) {
      return p && Number.isFinite(p.x) && Number.isFinite(p.y);
    }).slice().sort(function (a, b) { return a.x - b.x; });
    var ps = prijzen.filter(function (p) {
      return Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start;
    }).slice().sort(function (a, b) { return a.start - b.start; });
    for (var z = 1; z < ps.length; z++) {
      if (ps[z].start < ps[z - 1].end && ps[z].start < tot && ps[z - 1].end > vanaf) {
        uit.ongeldig = true;
        return uit;
      }
    }
    var gedektTot = null;
    var pi = 0;
    for (var i = 1; i < reeks.length; i++) {
      var a = reeks[i - 1], b = reeks[i];
      var duur = b.x - a.x;
      if (duur === 0 && a.y !== b.y && a.x >= vanaf && a.x < tot) uit.ongeldig = true;
      if (duur <= 0 || duur > 5 * 60 * 1000) continue;
      var links = Math.max(a.x, vanaf), rechts = Math.min(b.x, tot, nu);
      if (rechts <= links) continue;
      while (pi < ps.length && ps[pi].end <= links) pi++;
      for (var j = pi; j < ps.length && ps[j].start < rechts; j++) {
        var prijsRij = ps[j];
        var l = Math.max(links, prijsRij.start), r = Math.min(rechts, prijsRij.end);
        if (r <= l) continue;
        var grenzen = [l, r];
        if (a.y * b.y < 0) {
          var nul = a.x + duur * (-a.y) / (b.y - a.y);
          if (nul > l && nul < r) grenzen.push(nul);
        }
        for (var q = (Math.floor(l / kwartier) + 1) * kwartier; q < r; q += kwartier) {
          grenzen.push(q);
        }
        grenzen.sort(function (x, y) { return x - y; });
        for (var k = 1; k < grenzen.length; k++) {
          var x = grenzen[k - 1], y = grenzen[k];
          var w1 = a.y + (b.y - a.y) * (x - a.x) / duur;
          var w2 = a.y + (b.y - a.y) * (y - a.x) / duur;
          var energie = ((w1 + w2) / 2) * (y - x) / 3600000000;
          var exp = energie < 0;
          var kaal = exp ? prijsRij.ke : prijsRij.ki;
          if (!Number.isFinite(kaal)) continue;
          var balansPrijs =
            exp
              ? (
                  kaal * BTW -
                  OPSLAG
                )
              : (
                  kaal * BTW +
                  OPSLAG
                );

          if (exp) {
            uit.verkoopEur +=
              -energie *
              balansPrijs;

          } else {
            uit.inkoopEur +=
              energie *
              balansPrijs;
          }

          var prijsVoorResultaat =
            actueelAan
              ? actueelAllin(
                  kaal,
                  exp
                )
              : kaal;

          var bedrag =
            -energie *
            prijsVoorResultaat;
          var slot = Math.floor(x / kwartier) * kwartier;
          var groep = slot >= huidigStart ? 'huidig'
            : slot + kwartier <= nu - 20 * 60 * 1000 ? 'ouder' : 'recent';
          uit[groep] += bedrag;
          uit.bedrag += bedrag;
          uit.importKwh += Math.max(0, energie);
          uit.exportKwh += Math.max(0, -energie);
          if (gedektTot !== null && x > gedektTot) uit.gaten++;
          gedektTot = y;
          uit.gedekt += y - x;
          uit.stukken++;
        }
      }
    }
    return uit;
  }

    function actueelProjectieToon() {
      if (!isActueelPagina()) {
        return;
      }

      var bestaand =
        actueelZorgBedieningsRij();

      if (!bestaand) {
        return;
      }

      var info =
        document.getElementById(
          'be-actueel-resultaat'
        );

      if (!info) {
        return;
      }

      /*
       * Het dagresultaat blijft altijd zichtbaar.
       * Toggle AAN = all-in resultaat.
       * Toggle UIT = kaal resultaat.
       */
      info.hidden = false;


    var nu =
      Date.now();

    var punten =
      actueelDagPunten
        .filter(
          function (p) {
            return (
              p &&
              Number.isFinite(p.x) &&
              Number.isFinite(p.y)
            );
          }
        );
      if (punten.length < 2) {
        info.textContent =
          actueelAan
            ? 'Voorlopig all-in resultaat — wachten op meetgegevens.'
            : 'Voorlopig kaal resultaat — wachten op meetgegevens.';

        return;
      }
    var beginVandaag =
      new Date();

    beginVandaag.setHours(
      0,
      0,
      0,
      0
    );

    var vanaf =
      beginVandaag.getTime();

    var tot =
      Math.min(
        nu,
        punten[
          punten.length - 1
        ].x
      );

    var res = actueelProjectieBereken(
      punten,
      actueelRijen,
      vanaf,
      tot,
      nu
    );
    bewaarVoorlopigeDag(
      iso(beginVandaag),
      res,
      vanaf,
      tot
    );

    if (!voorlopigeBerekeningGeldig(iso(beginVandaag), res, vanaf, tot)) {
      info.textContent = 'Resultaat vandaag — nog geen passende metingen en prijzen';
      return;
    }

    var tijd = function (t) { return new Date(t).toLocaleString('nl-NL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }); };

    var geld = function (n) {
      return (
        (n < 0 ? '− ' : '+ ') +
        '€ ' +
        Math.abs(n).toLocaleString(
          'nl-NL',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }
        )
      );
    };

    var tekst =
      '<span style="' +
        'font-size:10px;' +
        'font-weight:700;' +
        'letter-spacing:.08em;' +
        'text-transform:uppercase;' +
        'color:' +
        D.label +
        ';background:rgba(107,63,160,.06);' +
        'border-radius:6px;' +
        'padding:4px 7px;' +
      '">' +
        'Resultaat vandaag' +
      '</span>' +

      '<span style="' +
        'font-size:16px;' +
        'font-weight:700;' +
        'font-variant-numeric:tabular-nums;' +
        'color:' +
        (
          res.bedrag < 0
            ? '#dc3545'
            : '#198754'
        ) +
      '">' +
        (
          res.stukken
            ? geld(res.bedrag)
            : '—'
        ) +
      '</span>' +

      '<span style="' +
        'font-size:11px;' +
        'color:' +
        D.grijs +
        ';' +
      '">' +
        res.importKwh
          .toFixed(1)
          .replace('.', ',') +
        ' kWh import' +
        ' · ' +
        res.exportKwh
          .toFixed(1)
          .replace('.', ',') +
        ' kWh export' +
        (
          actueelAan
            ? ''
            : ' · kaal'
        ) +

      '</span>';



    if (
      info.innerHTML !== tekst
    ) {
      info.innerHTML = tekst;
    }
  }

  function actueelOnderhoud() {
    verversKlantUitPad();

    var nieuweKlant =
      !!KLANT &&
      KLANT !==
        actueelLaatsteKlant;

    var nuActueel =
      isActueelPagina();

    if (!nuActueel) {
      actueelWasPagina =
        false;

      if (actueelVoetnootTimer) {
        clearInterval(
          actueelVoetnootTimer
        );

        actueelVoetnootTimer =
          null;
      }

      return;
    }

    actueelInstalleerBridge();

    actueelBouwSchakelaar();

    actueelProjectieToon();

    actueelZetVoetnoot();

    actueelVolgVoetnoot();

    actueelVolgSchema();

    actueelWerkSchemaBij();

    if (
      !actueelWasPagina ||
      nieuweKlant
    ) {
      actueelWasPagina =
        true;

      actueelLaatsteKlant =
        KLANT;

      actueelStuur();

      if (!actueelRijen.length) {
        actueelHaal();
      }

      actueelHaalDagPunten();
    }
  }

  function startActueelAllin() {
    if (actueelGestart) {
      return;
    }

    actueelGestart =
      true;

    actueelVoegMobieleStijlToe();

    actueelOnderhoud();

    actueelOnderhoudTimer =
      setInterval(
        function () {
          actueelOnderhoud();
        },
        3000
      );

    actueelHaalTimer =
      setInterval(
        function () {
          if (
            isActueelPagina()
          ) {
            actueelHaal();

            actueelHaalDagPunten();
          }
        },
        30000
      );

    if (isActueelPagina()) {
      actueelInstalleerBridge();

      actueelStuur();

      var pogingen = 0;

      var wacht =
        setInterval(
          function () {
            pogingen++;

            actueelOnderhoud();

            if (
              actueelLegenda() &&
              document.getElementById(
                'battery-chart'
              )
            ) {
              clearInterval(
                wacht
              );

              actueelHaal();
              actueelHaalDagPunten();

            } else if (
              pogingen > 120 ||
              !isActueelPagina()
            ) {
              clearInterval(
                wacht
              );
            }
          },
          500
        );
    }
  }


  var voorlopigResultatenBezig = false;
  var voorlopigResultatenLaatst = 0;

  function resultatenHaalVoorlopigeDagen() {
    if (
      location.pathname.indexOf(
        '/results'
      ) === -1 ||
      !KLANT
    ) {
      return Promise.resolve(
        false
      );
    }

    var nu =
      Date.now();

    if (
      voorlopigResultatenBezig ||
      nu -
        voorlopigResultatenLaatst <
        30000
    ) {
      return Promise.resolve(
        false
      );
    }

    voorlopigResultatenBezig =
      true;

    voorlopigResultatenLaatst =
      nu;

    /*
     * Vandaag plus de laatste vier kalenderdagen controleren.
     *
     * Belangrijk:
     * - Echte maanddata wint altijd.
     * - Ook opgeslagen voorlopige dagen worden opnieuw gecontroleerd.
     * - Vandaag mag wel blijven verversen zolang hij nog provisional is.
     * - Ontbrekende dagen worden uitsluitend uit gedateerde historie en prijzen gereconstrueerd.
     */
    var beginBereik =
      new Date();

    beginBereik.setHours(
      0,
      0,
      0,
      0
    );

    beginBereik.setDate(
      beginBereik.getDate() - 4
    );

    var dagKeys = [];
    var maanden = {};

    var cursor =
      new Date(
        beginBereik.getTime()
      );

    var vandaag =
      new Date();

    vandaag.setHours(
      0,
      0,
      0,
      0
    );

    var vandaagKey =
      iso(vandaag);

    while (
      cursor.getTime() <=
      vandaag.getTime()
    ) {
      var key =
        iso(cursor);

      dagKeys.push(
        key
      );

      maanden[
        key.slice(0, 7)
      ] = true;

      cursor.setDate(
        cursor.getDate() + 1
      );
    }

    var maandControles =
      Promise.all(
        Object.keys(maanden)
          .map(
            function (mk) {
              var m =
                new URL(
                  location.origin +
                    '/customer/' +
                    KLANT +
                    '/results-v2-api/'
                );

              m.searchParams.set(
                'interval',
                'month'
              );

              m.searchParams.set(
                'period',
                mk
              );

              m.searchParams.set(
                'include_vat',
                '1'
              );

              m.searchParams.set(
                'include_delivery_cost',
                '1'
              );

              return beHaalBron(
                m,
                {
                  credentials:
                    'same-origin',

                  cache:
                    'no-store'
                }
              )
                .then(
                  function (r) {
                    return r.ok
                      ? r.json()
                      : null;
                  }
                )
                .then(
                  function (j) {
                    return {
                      key:
                        mk,

                      data:
                        j
                    };
                  }
                )
                .catch(
                  function () {
                    return {
                      key:
                        mk,

                      data:
                        null
                    };
                  }
                );
            }
          )
      );

    return maandControles
      .then(
        function (maandSets) {
          var opslag =
            leesVoorlopigeDagen();

          var echt = {};
          var gewijzigd = false;

          (maandSets || [])
            .forEach(
              function (set) {
                var j =
                  set &&
                  set.data;

                if (
                  !j || j.interval !== 'month' || j.period !== set.key ||
                  !Array.isArray(
                    j.series
                  )
                ) {
                  return;
                }

                j.series.forEach(
                  function (r) {
                    var k =
                      r &&
                      (
                        r.date ||
                        r.day
                      );

                    if (
                      k && String(k).slice(0, 7) === set.key &&
                      ['import_kwh', 'export_kwh', 'total_buy_eur', 'total_sell_eur'].every(function (f) { return Number.isFinite(r[f]); }) &&
                      /^\d{4}-\d{2}-\d{2}$/.test(
                        String(k)
                      )
                    ) {
                      echt[
                        String(k)
                      ] = r;
                    }
                  }
                );
              }
            );

          /*
           * Zodra de echte datum in results-v2-api staat,
           * de lokale provisional meteen opruimen.
           */
          Object.keys(opslag)
            .forEach(
              function (k) {
                if (echt[k]) {
                  bewaarVoorlopigeAudit(
                    k,
                    opslag[k],
                    echt[k]
                  );

                  delete opslag[k];
                  gewijzigd = true;
                }
              }
            );

          if (gewijzigd) {
            schrijfVoorlopigeDagen(
              opslag
            );
          }

          var kandidaten =
            dagKeys.filter(
              function (k) {
                if (echt[k]) {
                  return false;
                }

                return true;
              }
            );

          if (!kandidaten.length) {
            return gewijzigd;
          }

          // Bestaande, bewezen snapshots blijven tijdens opnieuw ophalen behouden.
          schrijfVoorlopigeDagen(opslag);
          // Geef verwijderde resultaten direct door, ook wanneer herladen mislukt.
          gewijzigd = true;
          if (laatste) plan();

          var dagApi = Promise.resolve(kandidaten.map(function (key) {
            return { key: key, data: null };
          }));

          return dagApi
            .then(
              function (dagResultaten) {
                var fallbackKeys = [];
                var veranderd =
                  gewijzigd;

                (dagResultaten || [])
                  .forEach(
                    function (item) {
                      var j =
                        item &&
                        item.data;

                      var dagKey =
                        item &&
                        item.key;

                      var bruikbaar =
                        false;

                      // Dagtotalen alleen zijn geen reproduceerbare kwartierbron.
                      // Gebruik uitsluitend historie + prijzen met exacte tijdstippen.
                      if (
                        dagKey &&
                        !bruikbaar
                      ) {
                        fallbackKeys.push(
                          dagKey
                        );
                      }
                    }
                  );

                if (!fallbackKeys.length) {
                  return veranderd;
                }

                var eerste =
                  new Date(
                    fallbackKeys[0] +
                      'T00:00:00'
                  );

                fallbackKeys.forEach(
                  function (k) {
                    var d =
                      new Date(
                        k +
                          'T00:00:00'
                      );

                    if (
                      d.getTime() <
                      eerste.getTime()
                    ) {
                      eerste = d;
                    }
                  }
                );

                var u =
                  new URL(
                    location.origin +
                      '/customer/current-history/api/'
                  );

                u.searchParams.set(
                  'installation',
                  KLANT
                );

                u.searchParams.set(
                  'start',
                  String(
                    eerste.getTime()
                  )
                );

                u.searchParams.set(
                  'end',
                  String(nu)
                );

                var prijzen =
                  beHaalBron(
                    location.origin +
                      '/customer/current-prices/api/',
                    {
                      credentials:
                        'same-origin',

                      cache:
                        'no-store'
                    }
                  ).then(
                    function (r) {
                      return r.ok
                        ? r.json()
                        : null;
                    }
                  );

                // Vraag iedere dag apart op: een groot bereik kan door de API
                // worden begrensd, waardoor de recente dagen ontbreken.
                var historie = Promise.all(fallbackKeys.map(function (key) {
                  var grenzen = voorlopigeDagGrenzen(key);
                  var dagUrl = new URL('/customer/current-history/api/', location.origin);
                  dagUrl.searchParams.set('installation', KLANT);
                  dagUrl.searchParams.set('start', String(grenzen.start));
                  dagUrl.searchParams.set('end', String(Math.min(nu, grenzen.eind)));
                  return beHaalBron(dagUrl.href, { credentials: 'same-origin', cache: 'no-store' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (j) {
                      return j && Array.isArray(j.rows) ? j.rows.filter(function (r) {
                        return r && Number.isFinite(r.t) && r.t >= grenzen.start &&
                          r.t <= Math.min(nu, grenzen.eind) && Number.isFinite(r.po);
                      }) : [];
                    }).catch(function () { return []; });
                })).then(function (dagen) {
                  var perTijd = new Map();
                  dagen.forEach(function (rijen) { rijen.forEach(function (r) { perTijd.set(r.t, r); }); });
                  return { rows: Array.from(perTijd.values()) };
                });

                return Promise.all([
                  prijzen,
                  historie
                ]).then(
                  function (res) {
                    var jp =
                      res[0];

                    var jh =
                      res[1];

                    if (
                      !jp ||
                      !Array.isArray(
                        jp.prices
                      ) ||
                      !jh ||
                      !Array.isArray(
                        jh.rows
                      )
                    ) {
                      return veranderd;
                    }

                    var evts = {};

                    (
                      jp.afrrEventIsps || []
                    ).forEach(
                      function (t) {
                        evts[t] = true;
                      }
                    );

                    var prijsRijen =
                      jp.prices
                        .map(
                          function (p) {
                            var v =
                              p.values || {};

                            var a =
                              !!evts[p.start];

                            var ki =
                              a
                                ? v.afrr_import
                                : v.onbalans_import;

                            var ke =
                              a
                                ? v.afrr_export
                                : v.onbalans_export;

                            if (
                              typeof ki !==
                                'number' ||
                              !isFinite(ki)
                            ) {
                              return null;
                            }

                            return {
                              start:
                                p.start,

                              end:
                                p.end,

                              ki:
                                ki,

                              ke:
                                ke
                            };
                          }
                        )
                        .filter(Boolean);

                    var punten =
                      jh.rows
                        .filter(
                          function (r) {
                            return (
                              r &&
                              Number.isFinite(r.t) &&
                              Number.isFinite(r.po)
                            );
                          }
                        )
                        .map(
                          function (r) {
                            return {
                              x:
                                r.t,

                              y:
                                r.po
                            };
                          }
                        )
                        .sort(
                          function (a, b) {
                            return a.x - b.x;
                          }
                        );

                    if (
                      punten.length < 2 ||
                      !prijsRijen.length
                    ) {
                      return veranderd;
                    }

                    fallbackKeys.forEach(
                      function (dagKey) {
                        var dag =
                          new Date(
                            dagKey +
                              'T00:00:00'
                          );

                        var volgende =
                          new Date(
                            dag.getTime()
                          );

                        volgende.setDate(
                          volgende.getDate() + 1
                        );

                        var vanaf =
                          dag.getTime();

                        var tot =
                          Math.min(
                            nu,
                            volgende.getTime()
                          );

                        var berekend =
                          actueelProjectieBereken(
                            punten,
                            prijsRijen,
                            vanaf,
                            tot,
                            nu
                          );

                        if (
                          berekend.stukken > 0
                        ) {
                          bewaarVoorlopigeDag(
                            dagKey,
                            berekend,
                            vanaf,
                            tot
                          );

                          veranderd =
                            true;
                        }
                      }
                    );

                    return veranderd;
                  }
                );
              }
            );
        }
      )
      .catch(
        function (e) {
          console.warn(
            '[BE Resultaten voorlopig] ophalen mislukt:',
            e.message
          );

          return false;
        }
      )
      .then(
        function (ok) {
          voorlopigResultatenBezig =
            false;

          return ok;
        }
      );
  }


  /*
   * ============================================================
   * RESULTATEN — datalaag
   * ============================================================
   */

  function naarIncl(
    rij,
    pv
  ) {
    var imp =
      getal(
        rij.import_kwh
      );

    var exp =
      getal(
        rij.export_kwh
      );

    var buy =
      getal(
        rij.total_buy_eur
      );

    var sell =
      getal(
        rij.total_sell_eur
      );

    if (!pv.include_vat) {
      buy *= BTW;
      sell *= BTW;
    }

    if (
      !pv.include_delivery_cost
    ) {
      buy +=
        imp * OPSLAG;

      sell -=
        exp * OPSLAG;
    }

    return {
      bronAanwezig: ['import_kwh', 'export_kwh', 'total_buy_eur', 'total_sell_eur'].every(function (k) {
        return Number.isFinite(rij[k]);
      }),
      key:
        rij.month ||
        rij.date ||
        rij.day ||
        null,

      status:
        rij.status ||
        null,

      imp:
        imp,

      exp:
        exp,

      inkoop:
        buy,

      verkoop:
        sell,

      afrrImp:
        getal(
          rij.afrr_import_kwh
        ),

      afrrExp:
        getal(
          rij.afrr_export_kwh
        ),

      laden:
        getal(
          rij.battery_charged_kwh
        ),

      ontladen:
        getal(
          rij.battery_discharged_kwh
        ),

      pv:
        getal(
          rij.pv_estimated_kwh
        ),

      afrrVergoeding:
        getal(
          rij.balance_energie_eur
        ) +
        getal(
          rij.deal_customer_share_eur
        ),

      dealsAantal:
        getal(
          rij.deals_count
        ),

      ruwInkoop:
        getal(
          rij.total_buy_eur
        ),

      ruwVerkoop:
        getal(
          rij.total_sell_eur
        ),

      ruwPrijsInk:
        rij.avg_buy_price_eur_per_kwh,

      ruwPrijsVerk:
        rij.avg_sell_price_eur_per_kwh
    };
  }

  var cacheJaar = {};

  function haalJaar(jaar) {
    if (cacheJaar[jaar]) {
      return Promise.resolve(
        cacheJaar[jaar]
      );
    }

    var u =
      new URL(
        location.origin +
        '/customer/' +
        KLANT +
        '/results-v2-api/'
      );

    u.searchParams.set(
      'interval',
      'year'
    );

    u.searchParams.set(
      'period',
      String(jaar)
    );

    u.searchParams.set(
      'include_vat',
      '1'
    );

    u.searchParams.set(
      'include_delivery_cost',
      '1'
    );

    return origFetch(
      u,
      {
        credentials:
          'same-origin'
      }
    )

      .then(
        function (r) {
          return r.ok
            ? r.json()
            : null;
        }
      )

      .then(
        function (j) {
          var rijen =
            (
              j &&
              Array.isArray(
                j.series
              )
            )
              ? j.series.map(
                  function (s) {
                    return naarIncl(
                      s,
                      j.pricing || {}
                    );
                  }
                )
              : [];

          cacheJaar[jaar] =
            rijen;

          return rijen;
        }
      )

      .catch(
        function () {
          cacheJaar[jaar] = [];
          return [];
        }
      );
  }

  var contractCache = null;

  function haalContractjaar() {
    if (contractCache) {
      return Promise.resolve(
        contractCache
      );
    }

    var jaren = {};

    contractMaanden()
      .forEach(
        function (mk) {
          jaren[
            mk.slice(0, 4)
          ] = true;
        }
      );

    return Promise.all(
      Object.keys(jaren)
        .map(haalJaar)
    ).then(
      function (sets) {
        var op = {};

        sets.forEach(
          function (rijen) {
            rijen.forEach(
              function (r) {
                if (r.key) {
                  op[r.key] =
                    r;
                }
              }
            );
          }
        );

        contractCache =
          contractMaanden()
            .map(
              function (mk) {
                return (
                  op[mk] ||
                  {
                    key: mk,
                    leeg: true,
                    imp: 0,
                    exp: 0,
                    inkoop: 0,
                    verkoop: 0,
                    laden: 0,
                    ontladen: 0,
                    pv: 0,
                    afrrImp: 0,
                    afrrExp: 0,
                    afrrVergoeding: 0,
                    dealsAantal: 0
                  }
                );
              }
            );

        return contractCache;
      }
    );
  }

  function grenzen() {
    try {
      var e =
        document.getElementById(
          'results-bounds-data'
        );

      return e
        ? JSON.parse(
            e.textContent
          )
        : null;

    } catch (e) {
      return null;
    }
  }

  var IMP_FACTOR = {
    Jan: 1.00,
    Feb: 0.62,
    Mrt: 0.25,
    Apr: 0.09,
    Mei: 0.02,
    Jun: 0.01,
    Jul: 0.02,
    Aug: 0.03,
    Sep: 0.10,
    Okt: 0.32,
    Nov: 0.57,
    Dec: 0.87
  };

  var EXP_FACTOR = {
    Jan: 0.10,
    Feb: 0.18,
    Mrt: 0.45,
    Apr: 1.00,
    Mei: 1.30,
    Jun: 1.32,
    Jul: 1.18,
    Aug: 0.96,
    Sep: 0.74,
    Okt: 0.28,
    Nov: 0.12,
    Dec: 0.08
  };

  var PROFIEL = {
    Jan: {
      w: 1.00,
      z: 0.00
    },

    Feb: {
      w: 0.72,
      z: 0.00
    },

    Mrt: {
      w: 0.28,
      z: 0.10
    },

    Apr: {
      w: 0.08,
      z: 0.28
    },

    Mei: {
      w: 0.00,
      z: 0.62
    },

    Jun: {
      w: 0.00,
      z: 1.00
    },

    Jul: {
      w: 0.00,
      z: 0.86
    },

    Aug: {
      w: 0.04,
      z: 0.52
    },

    Sep: {
      w: 0.14,
      z: 0.24
    },

    Okt: {
      w: 0.26,
      z: 0.08
    },

    Nov: {
      w: 0.64,
      z: 0.00
    },

    Dec: {
      w: 0.90,
      z: 0.00
    }
  };

  function mk3(mk) {
    return MND_KORT[
      parseInt(
        String(mk)
          .split('-')[1],
        10
      ) - 1
    ];
  }

  function schatKwh(
    mk,
    bekend,
    factoren,
    terugval
  ) {
    var doelF =
      factoren[
        mk3(mk)
      ] || 0.5;

    if (!bekend.length) {
      return (
        terugval *
        doelF
      );
    }

    var gew = 0;
    var som = 0;

    bekend.forEach(
      function (b) {
        var ankerF =
          factoren[
            mk3(b.key)
          ] || 0.1;

        if (
          ankerF < 0.05
        ) {
          return;
        }

        var vergelijkbaar =
          Math.min(
            ankerF,
            doelF
          ) /
          Math.max(
            ankerF,
            doelF
          );

        var g =
          0.3 +
          vergelijkbaar *
          0.7;

        gew += g;

        som +=
          b.waarde *
          (
            doelF /
            ankerF
          ) *
          g;
      }
    );

    return gew > 0
      ? som / gew
      : 0;
  }

  function ankers(
    bedragPerMaand
  ) {
    var bekend =
      Object.keys(
        bedragPerMaand
      ).map(
        function (k) {
          return {
            m:
              mk3(k),

            v:
              bedragPerMaand[k]
          };
        }
      );

    function kies(namen) {
      return bekend.filter(
        function (b) {
          return (
            namen.indexOf(
              b.m
            ) !== -1
          );
        }
      );
    }

    var winterSet =
      kies([
        'Nov',
        'Dec',
        'Jan',
        'Feb'
      ]);

    var zomerSet =
      kies([
        'Mei',
        'Jun',
        'Jul',
        'Aug'
      ]);

    var tussenSet =
      kies([
        'Mrt',
        'Apr',
        'Sep',
        'Okt'
      ]);

    var winter =
      winterSet.length
        ? Math.min.apply(
            null,
            winterSet.map(
              function (b) {
                return b.v;
              }
            )
          )
        : -260;

    var zomer =
      zomerSet.length
        ? Math.max.apply(
            null,
            zomerSet.map(
              function (b) {
                return b.v;
              }
            )
          )
        : 110;

    var tussen =
      tussenSet.length
        ? (
            tussenSet.reduce(
              function (
                a,
                b
              ) {
                return (
                  a +
                  b.v
                );
              },
              0
            ) /
            tussenSet.length
          )
        : 25;

    if (
      tussen < winter
    ) {
      tussen =
        winter + 40;
    }

    if (
      zomer < tussen
    ) {
      zomer =
        tussen + 40;
    }

    return {
      winter:
        winter,

      tussen:
        tussen,

      zomer:
        zomer
    };
  }

  function prognoseBedrag(
    mk,
    a
  ) {
    var p =
      PROFIEL[
        mk3(mk)
      ] || {
        w: 0.25,
        z: 0.20
      };

    return (
      a.tussen -
      (
        a.tussen -
        a.winter
      ) *
      p.w +
      (
        a.zomer -
        a.tussen
      ) *
      p.z
    );
  }

  function salderingReeks(
    rijen,
    metPrognose
  ) {
    var bekendImp = [];
    var bekendExp = [];

    rijen.forEach(
      function (r) {
        if (r.leeg) {
          return;
        }

        if (r.imp > 0) {
          bekendImp.push({
            key:
              r.key,

            waarde:
              r.imp
          });
        }

        if (r.exp > 0) {
          bekendExp.push({
            key:
              r.key,

            waarde:
              r.exp
          });
        }
      }
    );

    var cumImp = 0;
    var cumExp = 0;

    var reeks =
      rijen.map(
        function (r) {
          var geschat =
            !!r.leeg;

          var imp =
            r.imp;

          var exp =
            r.exp;

          if (geschat) {
            if (metPrognose) {
              imp =
                schatKwh(
                  r.key,
                  bekendImp,
                  IMP_FACTOR,
                  150
                );

              exp =
                schatKwh(
                  r.key,
                  bekendExp,
                  EXP_FACTOR,
                  0
                );

            } else {
              imp = 0;
              exp = 0;
            }
          }

          cumImp += imp;
          cumExp += exp;

          return {
            key:
              r.key,

            imp:
              imp,

            exp:
              exp,

            cumImp:
              cumImp,

            cumExp:
              cumExp,

            ongesaldeerd:
              0,

            gesaldeerd:
              exp,

            geschat:
              geschat,

            overgeslagen:
              geschat &&
              !metPrognose,

            naSaldering:
              naSaldering(
                r.key
              )
          };
        }
      );

    var saldImp = 0;
    var saldExp = 0;

    reeks.forEach(
      function (s) {
        if (
          !s.naSaldering
        ) {
          saldImp +=
            s.imp;

          saldExp +=
            s.exp;
        }
      }
    );

    var over =
      Math.max(
        0,
        saldExp -
        saldImp
      );

    for (
      var i =
        reeks.length - 1;

      i >= 0;

      i--
    ) {
      var s =
        reeks[i];

      if (s.naSaldering) {
        s.ongesaldeerd =
          s.exp;

      } else {
        s.ongesaldeerd =
          Math.min(
            s.exp,
            over
          );

        over -=
          s.ongesaldeerd;
      }

      s.gesaldeerd =
        s.exp -
        s.ongesaldeerd;
    }

    return reeks;
  }

  function bereken(
    r,
    expOngesaldeerd,
    dagen
  ) {
    var imp = r.imp;
    var exp = r.exp;

    var onges =
      Math.min(
        getal(
          expOngesaldeerd
        ),
        exp
      );

    var ges =
      Math.max(
        0,
        exp -
        onges
      );

    var balansInk =
      -r.inkoop;

    var balansVerk =
      r.verkoop;

    var balansNetto =
      balansInk +
      balansVerk;

    var ebInk =
      -imp * EB;

    var ebVerk =
      ges * EB;

    var eb =
      ebInk +
      ebVerk;

    var stroom =
      balansNetto +
      eb;

    var vast =
      getal(dagen) *
      VAST_DAG;

    var allinInk =
      balansInk +
      ebInk;

    var allinVerk =
      balansVerk +
      ebVerk;

    return {
      key:
        r.key,

      imp:
        imp,

      exp:
        exp,

      balansInk:
        balansInk,

      balansVerk:
        balansVerk,

      balansNetto:
        balansNetto,

      eb:
        eb,

      ebInk:
        ebInk,

      ebVerk:
        ebVerk,

      ongesaldeerd:
        onges,

      gesaldeerd:
        ges,

      allinInk:
        allinInk,

      allinVerk:
        allinVerk,

      stroom:
        stroom,

      vast:
        vast,

      voorschot:
        voorschotVoor(
          r.key,
          getal(dagen),
          false
        ),

      totaal:
        stroom +
        vast,

      saldo:
        stroom +
        vast +
        voorschotVoor(
          r.key,
          getal(dagen),
          false
        ),

      dagen:
        getal(dagen),

      prijsInk:
        imp > 0
          ? Math.abs(
              allinInk
            ) / imp
          : 0,

      prijsVerk:
        exp > 0
          ? allinVerk / exp
          : 0,

      prijsInkBalans:
        imp > 0
          ? r.inkoop / imp
          : 0,

      prijsVerkBalans:
        exp > 0
          ? r.verkoop / exp
          : 0,

      laden:
        r.laden,

      ontladen:
        r.ontladen,

      pv:
        r.pv,

      afrrImp:
        r.afrrImp,

      afrrExp:
        r.afrrExp,

      afrrVergoeding:
        r.afrrVergoeding,

      dealsAantal:
        r.dealsAantal,

      geschat:
        !!r.leeg
    };
  }

  function fpr(rijen) {
    if (
      !rijen ||
      !rijen.length
    ) {
      return null;
    }

    var laad = 0;
    var ont = 0;
    var laadKwh = 0;
    var ontKwh = 0;
    var meegeteld = 0;

    rijen.forEach(
      function (a) {
        if (
          !a.laden &&
          !a.ontladen
        ) {
          return;
        }

        if (
          !a.prijsInk &&
          !a.prijsVerk
        ) {
          return;
        }

        var viaNet =
          Math.min(
            a.exp,
            a.ontladen
          );

        var viaHuis =
          Math.max(
            0,
            a.ontladen -
            viaNet
          );

        laad +=
          a.laden *
          a.prijsInk;

        ont +=
          viaNet *
          a.prijsVerk +
          viaHuis *
          a.prijsInk;

        laadKwh +=
          a.laden;

        ontKwh +=
          a.ontladen;

        meegeteld++;
      }
    );

    if (laad <= 0) {
      return null;
    }

    return {
      ratio:
        ont / laad,

      laadKwh:
        laadKwh,

      ontlaadKwh:
        ontKwh,

      gemLaad:
        laadKwh > 0
          ? laad / laadKwh
          : 0,

      gemOntlaad:
        ontKwh > 0
          ? ont / ontKwh
          : 0,

      netto:
        ont - laad,

      retour:
        laadKwh > 0
          ? ontKwh / laadKwh
          : 0,

      perioden:
        meegeteld
    };
  }

  function regel(
    label,
    waarde,
    o
  ) {
    o = o || {};

    var kl =
      o.neutraal
        ? D.inkt
        : kleur(
            waarde
          );

    var fs =
      o.groot
        ? '15.5px'
        : '12.5px';

    var streep =
      o.streep
        ? (
            'border-top:1px solid ' +
            D.rand +
            ';margin-top:8px;' +
            'padding-top:9px;'
          )
        : '';

    var sub =
      o.sub
        ? (
            '<div style="' +
            'font-size:10.5px;' +
            'color:' +
            D.grijs +
            ';margin-top:2px;' +
            'line-height:1.4;' +
            '">' +
            o.sub +
            '</div>'
          )
        : '';

    return (
      '<div style="' +
      'display:flex;' +
      'justify-content:space-between;' +
      'align-items:baseline;' +
      'gap:16px;' +
      'padding:4px 0;' +
      streep +
      '">' +

        '<div style="' +
        'font-size:' +
        fs +
        ';font-weight:' +
        (
          o.dik
            ? '600'
            : '400'
        ) +
        ';color:' +
        (
          o.dik
            ? D.inkt
            : '#4a4453'
        ) +
        ';">' +
        label +
        sub +
        '</div>' +

        '<div style="' +
        'font-size:' +
        fs +
        ';font-weight:' +
        (
          o.dik
            ? '700'
            : '500'
        ) +
        ';color:' +
        kl +
        ';white-space:nowrap;' +
        'font-variant-numeric:tabular-nums;' +
        '">' +
        eurT(waarde) +
        '</div>' +

      '</div>'
    );
  }

  function vakje(
    kop,
    groot,
    klein,
    kl
  ) {
    return (
      '<div style="' +
      'padding:10px 12px;' +
      'border:1px solid ' +
      D.rand +
      ';border-radius:8px;' +
      '">' +

        '<div style="' +
        'font-size:10px;' +
        'text-transform:uppercase;' +
        'letter-spacing:.06em;' +
        'color:' +
        D.grijs +
        ';">' +
        kop +
        '</div>' +

        '<div style="' +
        'font-size:17px;' +
        'font-weight:700;' +
        'margin-top:2px;' +
        'color:' +
        (kl || D.inkt) +
        ';font-variant-numeric:tabular-nums;' +
        '">' +
        groot +
        '</div>' +

        '<div style="' +
        'font-size:10.5px;' +
        'color:' +
        D.grijs +
        ';margin-top:2px;' +
        '">' +
        klein +
        '</div>' +

      '</div>'
    );
  }

  function bouwHoofdkaart(
    a,
    ctx
  ) {
    var c =
      kaart(
        'be-hoofd',
        null
      );

    var perMaand =
      ctx.interval ===
      'month';

    var contractPeriode =
      ctx.interval ===
        'rolling_year' &&
      Number.isFinite(
        ctx.contractSaldo
      );

    var volDagen =
      perMaand &&
      a.key
        ? dagenInMaand(
            a.key
          )
        : 0;

    var deelPeriode =
      perMaand &&
      volDagen > 0 &&
      a.dagen > 0 &&
      a.dagen < volDagen;

    function rij(
      label,
      detail,
      bedrag,
      o
    ) {
      o = o || {};

      var streep =
        o.streep
          ? (
              'border-top:1px solid ' +
              D.rand +
              ';'
            )
          : '';

      var gew =
        o.dik
          ? '600'
          : '400';

      return (
        '<tr>' +

          '<td style="' +
          'padding:8px 0;' +
          streep +
          'font-size:13.5px;' +
          'font-weight:' +
          gew +
          ';color:' +
          D.inkt +
          ';">' +
          label +
          '</td>' +

          '<td style="' +
          'padding:8px 0;' +
          streep +
          'font-size:12px;' +
          'color:' +
          D.grijs +
          ';white-space:nowrap;' +
          '">' +
          (detail || '') +
          '</td>' +

          '<td style="' +
          'padding:8px 0;' +
          streep +
          'text-align:right;' +
          'font-size:13.5px;' +
          'font-weight:' +
          (
            o.dik
              ? '700'
              : '500'
          ) +
          ';white-space:nowrap;' +
          'font-variant-numeric:tabular-nums;' +
          'color:' +
          (
            o.neutraal
              ? D.inkt
              : kleur(
                  bedrag
                )
          ) +
          ';">' +
          eurT(bedrag) +
          '</td>' +

        '</tr>'
      );
    }

    var tabel =
      '<table style="' +
      'width:100%;' +
      'border-collapse:collapse;' +
      'table-layout:fixed;' +
      '">' +

        '<colgroup>' +
          '<col style="width:40%">' +
          '<col style="width:30%">' +
          '<col style="width:30%">' +
        '</colgroup>' +

        rij(
          'Afname van het net',
          kwh(a.imp) +
          ' \u00e0 ' +
          eur(
            a.prijsInk,
            3
          ),
          a.allinInk
        ) +

        rij(
          'Teruglevering',
          kwh(a.exp) +
          ' \u00e0 ' +
          eur(
            a.prijsVerk,
            3
          ),
          a.allinVerk
        ) +

        rij(
          'Netbeheer',
          num(
            a.dagen,
            0
          ) +
          ' dagen',
          a.vast,
          {
            streep: true
          }
        ) +

        (
          perMaand
            ? rij(
                'Voorschot',
                deelPeriode
                  ? (
                      a.dagen +
                      ' van ' +
                      volDagen +
                      ' dagen'
                    )
                  : '',
                a.voorschot,
                {
                  neutraal:
                    true
                }
              )
            : ''
        ) +

        (
          contractPeriode &&
          Math.abs(
            ctx.contractWerkelijk -
            a.totaal
          ) > 0.005
            ? rij(
                'Voorlopige aanvulling',
                'nog niet definitief bij Balans',
                ctx.contractWerkelijk -
                  a.totaal
              )
            : ''
        ) +

        (
          contractPeriode
            ? rij(
                'Betaald voorschot',
                ctx.contractMaanden +
                  ' × ' +
                  eur(
                    cfg.voorschot
                  ),
                ctx.contractBetaald,
                {
                  neutraal:
                    true
                }
              )
            : ''
        ) +

        rij(
          perMaand
            ? 'Saldo'
            : (
                contractPeriode
                  ? 'Huidig contractsaldo'
                  : 'Totaal'
              ),
          '',
          perMaand
            ? a.saldo
            : (
                contractPeriode
                  ? ctx.contractSaldo
                  : a.totaal
              ),
          {
            dik: true,
            streep: true
          }
        ) +

      '</table>';

    var eindbedrag =
      perMaand
        ? a.saldo
        : (
            contractPeriode
              ? ctx.contractSaldo
              : a.totaal
          );

    var kop =
      '<div style="' +
      'display:flex;' +
      'justify-content:space-between;' +
      'align-items:baseline;' +
      'gap:16px;' +
      'flex-wrap:wrap;' +
      'margin-bottom:14px;' +
      '">' +

        '<div>' +

          '<div style="' +
          'font-size:17px;' +
          'font-weight:600;' +
          'color:' +
          D.inkt +
          ';">' +
          ctx.naam +
          '</div>' +

          '<div style="' +
          'font-size:12px;' +
          'color:' +
          D.grijs +
          ';margin-top:2px;' +
          '">' +

          (
            deelPeriode
              ? (
                  num(
                    a.dagen,
                    0
                  ) +
                  ' van ' +
                  volDagen +
                  ' dagen \u00b7 alles naar rato'
                )
              : (
                  (
                    a.dagen
                      ? (
                          num(
                            a.dagen,
                            0
                          ) +
                          ' dagen \u00b7 '
                        )
                      : ''
                  ) +
                  (
                    contractPeriode
                      ? 'contractstand incl. voorschotten'
                      : 'alles inbegrepen'
                  )
                )
          ) +

          '</div>' +

        '</div>' +

        '<div style="text-align:right;">' +

          '<div style="' +
          'font-size:27px;' +
          'font-weight:700;' +
          'line-height:1.1;' +
          'color:' +
          kleur(
            eindbedrag
          ) +
          ';font-variant-numeric:tabular-nums;' +
          '">' +
          eurT(
            eindbedrag
          ) +
          '</div>' +

          '<div style="' +
          'font-size:12px;' +
          'color:' +
          D.grijs +
          ';">' +

          (
            perMaand ||
            contractPeriode
              ? (
                  eindbedrag < 0
                    ? 'nog te betalen'
                    : 'te ontvangen'
                )
              : (
                  eindbedrag < 0
                    ? 'kosten'
                    : 'opbrengst'
                )
          ) +

          '</div>' +

        '</div>' +

      '</div>';

    c.innerHTML =
      kop +
      tabel;

    if (deelPeriode) {
      c.appendChild(
        el(
          'div',
          'margin-top:10px;' +
          'font-size:11px;' +
          'color:' +
          D.grijs +
          ';line-height:1.5;',
          'Balans heeft ' +
          a.dagen +
          ' van de ' +
          volDagen +
          ' dagen verwerkt. ' +
          'Netbeheer en voorschot tellen naar rato mee, ' +
          'zodat er niet een hele maand voorschot tegenover ' +
          a.dagen +
          ' dagen kosten staat. ' +
          'Het resterende deel van het voorschot is wel betaald ' +
          'en schuift mee zodra de maand compleet is.'
        )
      );
    }

    return c;
  }

  function bouwPrijsopbouw(a) {
    var c =
      sectie(
        'be-prijs',
        'Prijsopbouw per kWh'
      );

    function kolomPrijs(
      titel,
      balansPrijs,
      ebDeel,
      allinPrijs,
      kl,
      voet
    ) {
      return (
        '<div style="' +
        'padding:12px 14px;' +
        'border:1px solid ' +
        D.rand +
        ';border-radius:9px;' +
        '">' +

          '<div style="' +
          'font-size:11px;' +
          'text-transform:uppercase;' +
          'letter-spacing:.06em;' +
          'color:' +
          D.grijs +
          ';margin-bottom:9px;' +
          '">' +
          titel +
          '</div>' +

          '<div style="' +
          'display:flex;' +
          'justify-content:space-between;' +
          'font-size:12.5px;' +
          'padding:3px 0;' +
          '">' +

            '<span style="color:#4a4453;">' +
            'Volgens Balans' +
            '</span>' +

            '<span style="' +
            'font-variant-numeric:tabular-nums;' +
            '">' +
            eur(
              balansPrijs,
              3
            ) +
            '</span>' +

          '</div>' +

          '<div style="' +
          'display:flex;' +
          'justify-content:space-between;' +
          'font-size:12.5px;' +
          'padding:3px 0;' +
          '">' +

            '<span style="color:#4a4453;">' +
            'Energiebelasting' +
            '</span>' +

            '<span style="' +
            'font-variant-numeric:tabular-nums;' +
            'color:' +
            kl +
            ';">' +

            (
              ebDeel < 0
                ? '\u2212'
                : '+'
            ) +
            ' ' +
            eur(
              Math.abs(
                ebDeel
              ),
              3
            ) +

            '</span>' +

          '</div>' +

          '<div style="' +
          'display:flex;' +
          'justify-content:space-between;' +
          'font-size:14px;' +
          'font-weight:700;' +
          'padding:7px 0 0;' +
          'margin-top:5px;' +
          'border-top:1px solid ' +
          D.rand +
          ';">' +

            '<span>' +
            'All-in' +
            '</span>' +

            '<span style="' +
            'font-variant-numeric:tabular-nums;' +
            'color:' +
            kl +
            ';">' +
            eur(
              allinPrijs,
              3
            ) +
            '</span>' +

          '</div>' +

          '<div style="' +
          'font-size:11px;' +
          'color:' +
          D.grijs +
          ';margin-top:6px;' +
          'line-height:1.45;' +
          '">' +
          voet +
          '</div>' +

        '</div>'
      );
    }

    var ebVerkPerKwh =
      a.exp > 0
        ? (
            a.ebVerk /
            a.exp
          )
        : 0;

    c.appendChild(
      el(
        'div',
        'display:grid;' +
        'grid-template-columns:repeat(auto-fit,minmax(230px,1fr));' +
        'gap:12px;',

        kolomPrijs(
          'Afname',
          a.prijsInkBalans,
          EB,
          a.prijsInk,
          D.rood,
          'Het cijfer van Balans is inclusief BTW en de 2 ct leverkosten. ' +
          'Daar komt ' +
          eur(
            EB_BASIS,
            3
          ) +
          ' energiebelasting plus 21% BTW bij, dus ' +
          eur(
            EB,
            5
          ) +
          '.'
        ) +

        kolomPrijs(
          'Teruglevering',
          a.prijsVerkBalans,
          ebVerkPerKwh,
          a.prijsVerk,
          D.groen,

          a.ongesaldeerd > 0.5
            ? (
                kwh(
                  a.gesaldeerd
                ) +
                ' van de ' +
                kwh(
                  a.exp
                ) +
                ' valt binnen de saldering en krijgt EB terug; ' +
                kwh(
                  a.ongesaldeerd
                ) +
                ' niet. Gemiddeld dus minder dan ' +
                eur(
                  EB,
                  5
                ) +
                '.'
              )
            : (
                'Alle teruglevering valt binnen de saldeerruimte, ' +
                'dus over elke kWh komt ' +
                eur(
                  EB,
                  5
                ) +
                ' energiebelasting terug.'
              )
        )
      )
    );

    c.appendChild(
      el(
        'div',
        'margin-top:12px;' +
        'padding-top:12px;' +
        'border-top:1px solid ' +
        D.rand +
        ';display:flex;' +
        'gap:24px;' +
        'flex-wrap:wrap;' +
        'row-gap:12px;',

        kolom(
          'Spread all-in',
          ct(
            a.prijsVerk -
            a.prijsInk
          ) +
          ' / kWh',
          'verkoop \u2212 inkoop',
          D.paars
        ) +

        kolom(
          'Energiebelasting',
          eurT(
            a.eb
          ),
          kwh(
            a.imp
          ) +
          ' af, ' +
          kwh(
            a.gesaldeerd
          ) +
          ' terug',
          kleur(
            a.eb
          )
        ) +

        kolom(
          'Netbeheer',
          eurT(
            a.vast
          ),
          'levering ' +
          eur(
            LEV_DAG,
            4
          ) +
          ' + transport ' +
          eur(
            TRA_DAG,
            4
          ) +
          ' \u2212 vermindering ' +
          eur(
            VER_DAG,
            4
          ) +
          ' per dag',
          kleur(
            a.vast
          )
        )
      )
    );

    return c;
  }

  function fprKleur(r) {
    if (r >= 1.6) {
      return D.groen;
    }

    if (r >= 1.05) {
      return D.paars;
    }

    if (r >= 1.0) {
      return D.oranje;
    }

    return D.rood;
  }

  function fprWoord(r) {
    if (r >= 1.8) {
      return 'Uitstekend';
    }

    if (r >= 1.6) {
      return 'Zeer goed';
    }

    if (r >= 1.4) {
      return 'Goed';
    }

    if (r >= 1.2) {
      return 'Redelijk';
    }

    if (r >= 1.05) {
      return 'Matig';
    }

    if (r >= 1.0) {
      return 'Break-even';
    }

    return 'Verlies';
  }

  function kolom(
    kop,
    groot,
    klein,
    kl
  ) {
    return (
      '<div style="min-width:96px;">' +

        '<div style="' +
        'font-size:10px;' +
        'text-transform:uppercase;' +
        'letter-spacing:.05em;' +
        'color:' +
        D.grijs +
        ';">' +
        kop +
        '</div>' +

        '<div style="' +
        'font-size:13.5px;' +
        'font-weight:600;' +
        'margin-top:2px;' +
        'color:' +
        D.inkt +
        ';font-variant-numeric:tabular-nums;' +
        '">' +
        groot +
        '</div>' +

        '<div style="' +
        'font-size:11px;' +
        'font-weight:700;' +
        'color:' +
        kl +
        ';">' +
        klein +
        '</div>' +

      '</div>'
    );
  }

  function bouwFpr(
    f,
    periodeWoord
  ) {
    if (!f) {
      return null;
    }

    var c =
      sectie(
        'be-fpr',
        'Accu \u00b7 financial performance ratio'
      );

    var kl =
      fprKleur(
        f.ratio
      );

    var pct =
      Math.min(
        100,
        Math.max(
          0,
          (
            f.ratio /
            2
          ) *
          100
        )
      );

    c.appendChild(
      el(
        'div',
        'display:flex;' +
        'gap:28px;' +
        'flex-wrap:wrap;' +
        'align-items:center;' +
        'row-gap:18px;',

        '<div style="' +
        'display:flex;' +
        'align-items:center;' +
        'gap:13px;' +
        '">' +

          '<div style="' +
          'font-size:40px;' +
          'font-weight:700;' +
          'line-height:1;' +
          'color:' +
          kl +
          ';font-variant-numeric:tabular-nums;' +
          '">' +
          num(
            f.ratio,
            2
          ) +
          '</div>' +

          '<div>' +

            '<div style="' +
            'font-size:13px;' +
            'font-weight:700;' +
            'color:' +
            kl +
            ';">' +

            (
              f.ratio >= 1
                ? '+'
                : ''
            ) +

            num(
              (
                f.ratio -
                1
              ) *
              100,
              0
            ) +

            '% rendement' +

            '</div>' +

            '<div style="' +
            'font-size:11px;' +
            'font-weight:600;' +
            'color:' +
            kl +
            ';opacity:.85;' +
            '">' +
            fprWoord(
              f.ratio
            ) +
            '</div>' +

            '<div style="' +
            'font-size:10px;' +
            'color:' +
            D.grijs +
            ';">' +
            'waarde ontladen \u00f7 waarde laden' +
            '</div>' +

          '</div>' +

        '</div>' +

        '<div style="' +
        'width:1px;' +
        'align-self:stretch;' +
        'background:' +
        D.rand +
        ';">' +
        '</div>' +

        '<div style="' +
        'display:flex;' +
        'gap:26px;' +
        'flex-wrap:wrap;' +
        'flex:1;' +
        'row-gap:12px;' +
        '">' +

          kolom(
            'Laden',
            kwh(
              f.laadKwh
            ),
            ct(
              f.gemLaad
            ) +
            '/kWh',
            D.rood
          ) +

          kolom(
            'Ontladen',
            kwh(
              f.ontlaadKwh
            ),
            ct(
              f.gemOntlaad
            ) +
            '/kWh',
            D.groen
          ) +

          kolom(
            'Netto',
            eurT(
              f.netto
            ),
            num(
              f.retour *
              100,
              0
            ) +
            '% retour',
            kleur(
              f.netto
            )
          ) +

          kolom(
            'Spread',
            ct(
              f.gemOntlaad -
              f.gemLaad
            ),
            'per kWh all-in',
            D.paars
          ) +

        '</div>' +

        '<div style="' +
        'min-width:180px;' +
        'flex:1;' +
        '">' +

          '<div style="' +
          'height:8px;' +
          'border-radius:4px;' +
          'position:relative;' +
          'background:linear-gradient(to right,' +
          D.rood +
          ',' +
          D.oranje +
          ' 25%,' +
          D.paars +
          ' 50%,' +
          D.groen +
          ');">' +

            '<div style="' +
            'position:absolute;' +
            'top:-3px;' +
            'left:' +
            pct +
            '%;' +
            'transform:translateX(-50%);' +
            'width:14px;' +
            'height:14px;' +
            'border-radius:50%;' +
            'background:#fff;' +
            'border:2.5px solid ' +
            kl +
            ';box-shadow:0 1px 4px rgba(0,0,0,.15);' +
            '">' +
            '</div>' +

          '</div>' +

          '<div style="' +
          'display:flex;' +
          'justify-content:space-between;' +
          'font-size:9px;' +
          'color:' +
          D.grijs +
          ';margin-top:4px;' +
          '">' +

            '<span>0</span>' +
            '<span>1,0</span>' +
            '<span>2,0+</span>' +

          '</div>' +

        '</div>'
      )
    );

    return c;
  }

  var KOL1 =
    '92px';

  var STAAT_GRID =
    'grid-template-columns:' +
    KOL1 +
    ' minmax(60px,1fr) 104px 84px 84px 96px;' +
    'gap:12px;';

  function staatKop() {
    return (
      '<div style="' +
      'display:grid;' +
      STAAT_GRID +
      'padding:0 6px 7px;' +
      'margin-bottom:5px;' +
      'border-bottom:1px solid ' +
      D.rand +
      ';font-size:9.5px;' +
      'text-transform:uppercase;' +
      'letter-spacing:.05em;' +
      'color:' +
      D.grijs +
      ';white-space:nowrap;' +
      '">' +

        '<div>Maand</div>' +
        '<div></div>' +

        '<div style="text-align:right;">' +
        'All-in' +
        '</div>' +

        '<div style="text-align:right;">' +
        'Vschot' +
        '</div>' +

        '<div style="text-align:right;">' +
        'Vaste k.' +
        '</div>' +

        '<div style="text-align:right;">' +
        'Saldo' +
        '</div>' +

      '</div>'
    );
  }

  function staatRij(o) {
    var bg =
      o.nu
        ? 'rgba(107,63,160,.06)'
        : (
            o.even
              ? 'rgba(107,63,160,.02)'
              : 'transparent'
          );

    var dim =
      o.geschat
        ? 'opacity:.6;'
        : '';

    var cur =
      o.geschat
        ? 'font-style:italic;'
        : '';

    var t =
      o.geschat
        ? '~'
        : '';

    var balk =
      Math.min(
        100,
        Math.abs(
          o.stroom
        ) /
        4
      );

    var balkEcht =
      balk;

    var balkVoorlopig = 0;

    if (
      Number.isFinite(
        o.voorlopigStroom
      ) &&
      Math.abs(
        o.voorlopigStroom
      ) > 0.000001 &&
      Number.isFinite(
        o.stroomEcht
      )
    ) {
      var zelfdeRichting =
        o.stroomEcht === 0 ||
        o.stroom === 0 ||
        (
          o.stroomEcht > 0 &&
          o.stroom > 0
        ) ||
        (
          o.stroomEcht < 0 &&
          o.stroom < 0
        );

      if (
        zelfdeRichting &&
        Math.abs(
          o.stroom
        ) >=
        Math.abs(
          o.stroomEcht
        )
      ) {
        balkEcht =
          Math.min(
            balk,
            Math.abs(
              o.stroomEcht
            ) /
            4
          );

        balkVoorlopig =
          Math.max(
            0,
            balk - balkEcht
          );

      } else {
        balkVoorlopig =
          Math.min(
            balk,
            Math.abs(
              o.voorlopigStroom
            ) /
            4
          );

        balkEcht =
          Math.max(
            0,
            balk - balkVoorlopig
          );
      }
    }

    var balkRest = 0;

    if (o.naast) {
      var balkProg =
        Math.min(
          100,
          Math.abs(
            o.naast
          ) /
          4
        );

      balkRest =
        Math.max(
          0,
          balkProg -
          balk
        );
    }

    var vastWeergave =
      -o.vast;

    var sub =
      o.sub
        ? (
            '<div style="' +
            'font-size:10px;' +
            'font-weight:600;' +
            'margin-top:4px;' +
            'white-space:nowrap;' +
            'color:' +
            (
              o.subKleur ||
              D.paars
            ) +
            ';">' +
            o.sub +
            '</div>'
          )
        : '';

    return (
      '<div style="' +
      'display:grid;' +
      STAAT_GRID +
      'align-items:start;' +
      'padding:8px 6px;' +
      'border-radius:5px;' +
      'background:' +
      bg +
      ';' +
      dim +
      'font-variant-numeric:tabular-nums;' +
      '">' +

        '<div style="' +
        'font-size:12px;' +
        'padding-top:1px;' +
        cur +
        'color:' +
        (
          o.geschat
            ? D.paarsLicht
            : D.inkt
        ) +
        ';font-weight:' +
        (
          o.nu
            ? '600'
            : '400'
        ) +
        ';">' +
        maandLabel(
          o.key
        ) +
        '</div>' +

        '<div>' +

          '<div style="' +
          'height:7px;' +
          'border-radius:4px;' +
          'background:#eeebf4;' +
          'overflow:hidden;' +
          'margin-top:4px;' +
          'display:flex;' +
          '">' +

            '<div style="' +
            'height:100%;' +
            'width:' +
            balkEcht +
            '%;' +
            'flex-shrink:0;' +
            'border-radius:' +
            (
              balkVoorlopig > 0
                ? '4px 0 0 4px'
                : '4px'
            ) +
            ';background:' +
            (
              o.geschat
                ? kleurZacht(
                    o.stroom
                  )
                : kleur(
                    o.stroom
                  )
            ) +
            ';">' +
            '</div>' +

            (
              balkVoorlopig > 0
                ? (
                    '<div style="' +
                    'height:100%;' +
                    'width:' +
                    balkVoorlopig +
                    '%;' +
                    'flex-shrink:0;' +
                    'background-color:' +
                    kleur(
                      o.stroom
                    ) +
                    ';background-image:' +
                    'repeating-linear-gradient(' +
                    '135deg,' +
                    'rgba(255,255,255,.82) 0,' +
                    'rgba(255,255,255,.82) 2px,' +
                    'rgba(255,255,255,0) 2px,' +
                    'rgba(255,255,255,0) 5px' +
                    ');' +
                    'border-radius:0 4px 4px 0;' +
                    '">' +
                    '</div>'
                  )
                : ''
            ) +

            (
              balkRest > 0
                ? (
                    '<div style="' +
                    'height:100%;' +
                    'width:' +
                    balkRest +
                    '%;' +
                    'flex-shrink:0;' +
                    'background:' +
                    kleurZacht(
                      o.naast
                    ) +
                    ';">' +
                    '</div>'
                  )
                : ''
            ) +

          '</div>' +

          sub +

        '</div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'font-weight:600;' +
        'padding-top:1px;' +
        cur +
        'color:' +
        (
          o.geschat
            ? kleurZacht(
                o.stroom
              )
            : kleur(
                o.stroom
              )
        ) +
        ';">' +

        t +
        eurCent(
          o.stroom
        ) +

        (
          o.naast
            ? (
                '<span style="' +
                'color:' +
                D.paarsLicht +
                ';font-weight:400;' +
                '">' +
                ' / ~' +
                eurKort(
                  o.naast
                ) +
                '</span>'
              )
            : ''
        ) +

        '</div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'padding-top:1px;' +
        'color:' +
        D.grijs +
        ';">' +
        '+\u20ac' +
        num(
          o.voorschot,
          2
        ) +
        '</div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'padding-top:1px;' +
        cur +
        'color:' +
        (
          o.geschat
            ? kleurZacht(
                vastWeergave
              )
            : kleur(
                vastWeergave
              )
        ) +
        ';">' +
        eurCent(
          vastWeergave
        ) +
        '</div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'font-weight:600;' +
        'padding-top:1px;' +
        cur +
        'color:' +
        (
          o.geschat
            ? kleurZacht(
                o.cum
              )
            : kleur(
                o.cum
              )
        ) +
        ';">' +
        t +
        eurKort(
          o.cum
        ) +
        '</div>' +

      '</div>'
    );
  }

  function bouwMaandstaat(
    rijen,
    sald,
    saldProg,
    huidigeKey,
    voorlopigeRijen,
    voorlopigeKey
  ) {
    var c =
      sectie(
        'be-staat',
        'Voorschot &amp; verrekening'
      );

    var werkelijkPer = {};
    var bekendBedrag = {};

    var voorlopigTekst =
      voorlopigeKey
        ? voorlopigeDagenTekst(
            voorlopigeRijen,
            voorlopigeKey
          )
        : '';

    var voorlopigStroom = 0;
    var voorlopigAantal = 0;

    (voorlopigeRijen || [])
      .forEach(
        function (r) {
          if (
            !r ||
            !r.voorlopig ||
            !voorlopigeKey ||
            String(r.key || '')
              .indexOf(
                voorlopigeKey + '-'
              ) !== 0
          ) {
            return;
          }

          var ongesaldeerd =
            naSaldering(
              r.key
            )
              ? r.exp
              : 0;

          var p =
            bereken(
              r,
              ongesaldeerd,
              1
            );

          voorlopigStroom +=
            p.stroom;

          voorlopigAantal++;
        }
      );

    rijen.forEach(
      function (r, i) {
        if (r.leeg) {
          return;
        }

        var a =
          bereken(
            r,
            sald[i].ongesaldeerd,
            dagenVerstreken(
              r.key
            )
          );

        a.dagenEcht =
          a.dagen;

        a.stroomEcht =
          a.stroom;

        a.voorlopigStroom =
          0;

        a.voorlopigAantal =
          0;

        if (
          r.key ===
            voorlopigeKey &&
          voorlopigAantal > 0
        ) {
          a.voorlopigStroom =
            voorlopigStroom;

          a.voorlopigAantal =
            voorlopigAantal;

          a.stroom +=
            voorlopigStroom;

          a.vast +=
            voorlopigAantal *
            VAST_DAG;

          a.dagen +=
            voorlopigAantal;

          a.totaal =
            a.stroom +
            a.vast;

          a.saldo =
            a.totaal +
            cfg.voorschot;
        }

        werkelijkPer[
          r.key
        ] = a;

        if (
          a.dagen >=
          dagenInMaand(
            r.key
          )
        ) {
          bekendBedrag[
            r.key
          ] = a.stroom;
        }
      }
    );

    var ank =
      ankers(
        bekendBedrag
      );

    var cum = 0;
    var betaald = 0;
    var werkelijk = 0;
    var vastTot = 0;
    var maandenBekend = 0;
    var jaarStroom = 0;
    var jaarVast = 0;

    var html =
      staatKop();

    rijen.forEach(
      function (r, i) {
        var a =
          werkelijkPer[
            r.key
          ];

        var loopt =
          isLopendeMaand(
            r.key
          );

        var prog =
          prognoseBedrag(
            r.key,
            ank
          );

        if (
          naSaldering(
            r.key
          ) &&
          saldProg[i]
        ) {
          prog -=
            saldProg[i].exp *
            EB;
        }

        var stroom;
        var vast;
        var geschat;
        var vs;
        var sub = null;
        var subKleur = null;
        var naast = null;

        if (a) {
          geschat =
            false;

          stroom =
            a.stroom;

          vast =
            a.vast;

          vs =
            cfg.voorschot;

          betaald +=
            vs;

          werkelijk +=
            stroom;

          vastTot +=
            vast;

          maandenBekend++;

          if (loopt) {
            sub =
              'berekend t/m ' +
              (
                Number.isFinite(
                  a.dagenEcht
                )
                  ? a.dagenEcht
                  : a.dagen
              ) +
              ' ' +
              maandNaam(
                r.key
              ) +
              (
                voorlopigTekst
                  ? ' · ' +
                    voorlopigTekst
                  : ''
              );

            if (
              Math.abs(
                stroom
              ) <
              Math.abs(
                prog
              )
            ) {
              naast =
                prog;
            }

          } else if (
            a.dagen <
            dagenInMaand(
              r.key
            )
          ) {
            sub =
              'nog ' +
              (
                dagenInMaand(
                  r.key
                ) -
                a.dagen
              ) +
              ' dagen open';

            subKleur =
              D.oranje;
          }

          if (
            loopt &&
            Math.abs(
              prog
            ) >
            Math.abs(
              stroom
            )
          ) {
            jaarStroom +=
              prog;

            jaarVast +=
              dagenInMaand(
                r.key
              ) *
              VAST_DAG;

          } else {
            jaarStroom +=
              stroom;

            jaarVast +=
              vast;
          }

        } else {
          geschat =
            true;

          stroom =
            prog;

          vast =
            dagenInMaand(
              r.key
            ) *
            VAST_DAG;

          vs =
            cfg.voorschot;

          jaarStroom +=
            stroom;

          jaarVast +=
            vast;
        }

        cum +=
          stroom +
          vast +
          vs;

        html +=
          staatRij({
            key:
              r.key,

            nu:
              r.key ===
              huidigeKey,

            even:
              i % 2 === 0,

            geschat:
              geschat,

            stroom:
              stroom,

            stroomEcht:
              a
                ? a.stroomEcht
                : stroom,

            voorlopigStroom:
              a
                ? a.voorlopigStroom
                : 0,

            vast:
              vast,

            voorschot:
              vs,

            cum:
              cum,

            sub:
              sub,

            subKleur:
              subKleur,

            naast:
              naast
          });
      }
    );

    var jaarVoorschot =
      12 *
      cfg.voorschot;

    var jaarSaldo =
      jaarStroom +
      jaarVast +
      jaarVoorschot;

    html +=
      '<div style="' +
      'display:grid;' +
      STAAT_GRID +
      'align-items:center;' +
      'padding:11px 6px 3px;' +
      'margin-top:6px;' +
      'border-top:1.5px solid ' +
      D.rand +
      ';font-variant-numeric:tabular-nums;' +
      '">' +

        '<div style="' +
        'font-size:9.5px;' +
        'font-weight:700;' +
        'text-transform:uppercase;' +
        'letter-spacing:.05em;' +
        'color:' +
        D.label +
        ';">' +
        'Prognose jaar' +
        '</div>' +

        '<div></div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'font-weight:700;' +
        'color:' +
        kleur(
          jaarStroom
        ) +
        ';">' +
        eurKort(
          jaarStroom
        ) +
        '</div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'font-weight:700;' +
        'color:' +
        D.inkt +
        ';">' +
        '+\u20ac' +
        num(
          jaarVoorschot,
          0
        ) +
        '</div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'font-weight:700;' +
        'color:' +
        kleur(
          -jaarVast
        ) +
        ';">' +
        eurKort(
          -jaarVast
        ) +
        '</div>' +

        '<div style="' +
        'text-align:right;' +
        'font-size:12px;' +
        'font-weight:700;' +
        'color:' +
        kleur(
          jaarSaldo
        ) +
        ';">' +
        eurKort(
          jaarSaldo
        ) +
        '</div>' +

      '</div>';

    var werkelijkTot =
      werkelijk +
      vastTot;

    var saldoNu =
      werkelijkTot +
      betaald;

    var pct =
      Math.round(
        (
          maandenBekend /
          12
        ) *
        100
      );

    var eind =
      new Date(
        cfg.start.getFullYear(),
        cfg.start.getMonth() + 12,
        cfg.start.getDate() - 1
      );

    c.appendChild(
      el(
        'div',
        'display:grid;' +
        'grid-template-columns:repeat(auto-fit,minmax(170px,1fr));' +
        'border:1px solid ' +
        D.rand +
        ';border-radius:9px;' +
        'overflow:hidden;' +
        'margin-bottom:14px;',

        cel(
          'Betaald t/m nu',
          '+' +
          eur(
            betaald
          ),
          maandenBekend +
          ' \u00d7 ' +
          eur(
            cfg.voorschot
          ),
          D.inkt
        ) +

        cel(
          'Werkelijk t/m nu',
          eurT(
            werkelijkTot
          ),
          'stroom + netbeheer + belastingen',
          kleur(
            werkelijkTot
          )
        ) +

        cel(
          'Huidig saldo',
          eurT(
            saldoNu
          ),
          saldoNu < 0
            ? 'nog te betalen'
            : 'te ontvangen',
          kleur(
            saldoNu
          )
        )
      )
    );

    c.appendChild(
      el(
        'div',
        'margin-bottom:14px;',

        '<div style="' +
        'display:flex;' +
        'justify-content:space-between;' +
        'font-size:10px;' +
        'color:' +
        D.grijs +
        ';margin-bottom:4px;' +
        '">' +

          '<span>' +
          cfg.start.getDate() +
          ' ' +
          MND_LANG[
            cfg.start.getMonth()
          ] +
          ' ' +
          cfg.start.getFullYear() +
          '</span>' +

          '<span style="' +
          'color:' +
          D.paars +
          ';font-weight:600;' +
          '">' +
          '\u25cf nu (' +
          maandenBekend +
          ' mnd)' +
          '</span>' +

          '<span>' +
          eind.getDate() +
          ' ' +
          MND_LANG[
            eind.getMonth()
          ] +
          ' ' +
          eind.getFullYear() +
          '</span>' +

        '</div>' +

        '<div style="' +
        'height:8px;' +
        'background:#ede8f5;' +
        'border-radius:4px;' +
        'position:relative;' +
        '">' +

          '<div style="' +
          'height:100%;' +
          'width:' +
          pct +
          '%;' +
          'background:' +
          D.paars +
          ';border-radius:4px;' +
          '">' +
          '</div>' +

          '<div style="' +
          'position:absolute;' +
          'top:-3px;' +
          'left:' +
          pct +
          '%;' +
          'transform:translateX(-50%);' +
          'width:14px;' +
          'height:14px;' +
          'border-radius:50%;' +
          'background:#fff;' +
          'border:2.5px solid ' +
          D.paars +
          ';box-shadow:0 1px 3px rgba(0,0,0,.15);' +
          '">' +
          '</div>' +

        '</div>' +

        '<div style="' +
        'font-size:10px;' +
        'color:' +
        D.grijs +
        ';margin-top:4px;' +
        '">' +
        maandenBekend +
        ' van 12 maanden \u00b7 ' +
        pct +
        '% van contractjaar' +
        '</div>'
      )
    );

    var det =
      el(
        'details',
        ''
      );

    det.open =
      true;

    det.innerHTML =
      '<summary style="' +
      'cursor:pointer;' +
      'font-size:11.5px;' +
      'color:' +
      D.grijs +
      ';list-style:none;' +
      '">' +
      '\u25bc Maanddetails verbergen' +
      '</summary>' +

      '<div style="margin-top:11px;">' +
      html +
      '</div>' +

      '<div style="' +
      'margin-top:12px;' +
      'font-size:10.5px;' +
      'color:' +
      D.grijs +
      ';line-height:1.5;' +
      '">' +
      'Cursief met ~ is prognose, geschat uit de eigen geschiedenis. ' +
      'Arcering in de lopende maand is het voorlopige deel dat al in ' +
      'het maandresultaat en huidig saldo is meegenomen. ' +
      'Zodra results-v2-api die dag definitief levert, vervangt de echte data ' +
      'de provisional automatisch. ' +
      'Een maand die nog loopt telt in de jaarprognose mee voor ' +
      'het hoogste van werkelijk en verwacht.' +
      '</div>';

    det.addEventListener(
      'toggle',
      function () {
        var sum =
          det.querySelector(
            'summary'
          );

        if (sum) {
          sum.textContent =
            det.open
              ? '\u25bc Maanddetails verbergen'
              : '\u25b6 Maanddetails tonen';
        }
      }
    );

    c.appendChild(
      det
    );

    c.dataset.beBetaald =
      String(betaald);

    c.dataset.beWerkelijk =
      String(werkelijkTot);

    c.dataset.beSaldoNu =
      String(saldoNu);

    c.dataset.beMaandenBekend =
      String(maandenBekend);

    return c;
  }

  function cel(
    kop,
    groot,
    klein,
    kl
  ) {
    return (
      '<div style="' +
      'padding:11px 14px;' +
      'border-right:1px solid ' +
      D.rand +
      ';">' +

        '<div style="' +
        'font-size:10px;' +
        'text-transform:uppercase;' +
        'letter-spacing:.05em;' +
        'color:' +
        D.grijs +
        ';">' +
        kop +
        '</div>' +

        '<div style="' +
        'font-size:20px;' +
        'font-weight:700;' +
        'margin-top:2px;' +
        'color:' +
        kl +
        ';font-variant-numeric:tabular-nums;' +
        '">' +
        groot +
        '</div>' +

        '<div style="' +
        'font-size:10.5px;' +
        'color:' +
        D.grijs +
        ';margin-top:2px;' +
        '">' +
        klein +
        '</div>' +

      '</div>'
    );
  }

  var SALD_GRID =
    'grid-template-columns:' +
    KOL1 +
    ' 1fr 1fr 1fr 1fr 1.1fr;' +
    'gap:12px;';

  function bouwSaldering(sald) {
    if (!cfg.saldering) {
      return null;
    }

    var gevuld =
      sald.filter(
        function (s) {
          return (
            !s.overgeslagen &&
            (
              s.imp > 0 ||
              s.exp > 0
            )
          );
        }
      );

    if (!gevuld.length) {
      return null;
    }

    var laatsteRij =
      gevuld[
        gevuld.length - 1
      ];

    var totImp =
      laatsteRij.cumImp;

    var totExp =
      laatsteRij.cumExp;

    var over =
      Math.max(
        0,
        totExp -
        totImp
      );

    var ruimte =
      Math.max(
        0,
        totImp -
        totExp
      );

    var naald =
      Math.min(
        98,
        Math.max(
          2,
          (
            totImp > 0
              ? totExp /
                totImp
              : 0
          ) *
          50
        )
      );

    var kl =
      over > 0
        ? D.rood
        : D.groen;

    var schakelaar =
      '<label id="be-sald-prog" style="' +
      'display:flex;' +
      'align-items:center;' +
      'gap:7px;' +
      'cursor:pointer;' +
      'flex-shrink:0;' +
      '">' +

        '<span style="' +
        'font-size:10px;' +
        'font-weight:500;' +
        'color:' +
        (
          salderingPrognose
            ? D.paars
            : D.grijs
        ) +
        ';">' +
        'incl. prognose' +
        '</span>' +

        '<span style="' +
        'position:relative;' +
        'display:block;' +
        'width:36px;' +
        'height:20px;' +
        'border-radius:10px;' +
        'background:' +
        (
          salderingPrognose
            ? D.paars
            : D.rand
        ) +
        ';transition:background .2s;' +
        '">' +

          '<span style="' +
          'position:absolute;' +
          'top:3px;' +
          'left:' +
          (
            salderingPrognose
              ? '18px'
              : '3px'
          ) +
          ';width:14px;' +
          'height:14px;' +
          'border-radius:7px;' +
          'background:#fff;' +
          'transition:left .2s;' +
          'box-shadow:0 1px 3px rgba(0,0,0,.2);' +
          '">' +
          '</span>' +

        '</span>' +

      '</label>';

    var c =
      sectie(
        'be-sald',
        'Salderingsbalans contractjaar',
        schakelaar
      );

    var tabel =
      '<div style="' +
      'display:grid;' +
      SALD_GRID +
      'padding:0 6px 7px;' +
      'margin-bottom:5px;' +
      'border-bottom:1px solid ' +
      D.rand +
      ';font-size:9.5px;' +
      'text-transform:uppercase;' +
      'letter-spacing:.05em;' +
      'color:' +
      D.grijs +
      ';white-space:nowrap;' +
      '">' +

        '<div>Maand</div>' +

        '<div style="text-align:right;">' +
        'Import' +
        '</div>' +

        '<div style="text-align:right;">' +
        'Export' +
        '</div>' +

        '<div style="text-align:right;">' +
        'Cum. imp' +
        '</div>' +

        '<div style="text-align:right;">' +
        'Cum. exp' +
        '</div>' +

        '<div style="text-align:right;">' +
        'Ongesaldeerd' +
        '</div>' +

      '</div>';

    sald.forEach(
      function (s, i) {
        if (s.overgeslagen) {
          tabel +=
            '<div style="' +
            'display:grid;' +
            SALD_GRID +
            'padding:6px;' +
            'font-size:11px;' +
            'opacity:.3;' +
            '">' +

              '<div style="' +
              'font-style:italic;' +
              'color:' +
              D.paarsLicht +
              ';">' +
              maandLabel(
                s.key
              ) +
              '</div>' +

              '<div style="text-align:right;">\u2013</div>' +
              '<div style="text-align:right;">\u2013</div>' +
              '<div style="text-align:right;">\u2013</div>' +
              '<div style="text-align:right;">\u2013</div>' +
              '<div style="text-align:right;">\u2013</div>' +

            '</div>';

          return;
        }

        var kantel =
          !s.naSaldering &&
          s.ongesaldeerd > 0 &&
          (
            s.cumExp -
            s.exp
          ) <=
          (
            s.cumImp -
            s.imp
          );

        var bg =
          s.naSaldering
            ? 'rgba(220,53,69,.05)'
            : (
                kantel
                  ? 'rgba(220,53,69,.07)'
                  : (
                      s.geschat
                        ? 'rgba(107,63,160,.03)'
                        : (
                            i % 2 === 0
                              ? 'rgba(107,63,160,.02)'
                              : 'transparent'
                          )
                    )
              );

        var stijl =
          s.geschat
            ? 'opacity:.65;font-style:italic;'
            : '';

        tabel +=
          '<div style="' +
          'display:grid;' +
          SALD_GRID +
          'padding:6px;' +
          'border-radius:5px;' +
          'font-size:11.5px;' +
          'background:' +
          bg +
          ';' +
          stijl +
          'font-variant-numeric:tabular-nums;' +
          '">' +

            '<div style="color:' +
            D.inkt +
            ';">' +

            maandLabel(
              s.key
            ) +

            (
              kantel
                ? (
                    ' <span style="' +
                    'color:' +
                    D.rood +
                    ';font-size:9px;' +
                    '">' +
                    '\u25c0' +
                    '</span>'
                  )
                : ''
            ) +

            (
              s.naSaldering
                ? (
                    ' <span style="' +
                    'color:' +
                    D.rood +
                    ';font-size:9px;' +
                    '">' +
                    '\u26a0' +
                    '</span>'
                  )
                : ''
            ) +

            '</div>' +

            '<div style="' +
            'text-align:right;' +
            'color:' +
            D.grijs +
            ';">' +
            num(
              s.imp,
              0
            ) +
            '</div>' +

            '<div style="' +
            'text-align:right;' +
            'color:' +
            D.grijs +
            ';">' +
            num(
              s.exp,
              0
            ) +
            '</div>' +

            '<div style="text-align:right;">' +
            num(
              s.cumImp,
              0
            ) +
            '</div>' +

            '<div style="' +
            'text-align:right;' +
            'color:' +
            (
              s.cumExp >
              s.cumImp
                ? D.rood
                : D.inkt
            ) +
            ';">' +
            num(
              s.cumExp,
              0
            ) +
            '</div>' +

            '<div style="' +
            'text-align:right;' +
            'font-weight:' +
            (
              s.ongesaldeerd > 0
                ? '700'
                : '400'
            ) +
            ';color:' +
            (
              s.ongesaldeerd > 0
                ? D.rood
                : D.grijs
            ) +
            ';">' +

            (
              s.ongesaldeerd > 0
                ? (
                    num(
                      s.ongesaldeerd,
                      0
                    ) +
                    ' kWh'
                  )
                : '\u2013'
            ) +

            '</div>' +

          '</div>';
      }
    );

    c.appendChild(
      el(
        'div',
        'display:grid;' +
        'grid-template-columns:repeat(auto-fit,minmax(150px,1fr));' +
        'border:1px solid ' +
        D.rand +
        ';border-radius:9px;' +
        'overflow:hidden;' +
        'margin-bottom:13px;',

        cel(
          'Import',
          kwh(
            totImp
          ),
          'contractjaar',
          D.inkt
        ) +

        cel(
          'Export',
          kwh(
            totExp
          ),
          'contractjaar',
          kl
        ) +

        cel(
          over > 0
            ? 'Buiten saldering'
            : 'Saldeerruimte over',
          kwh(
            over > 0
              ? over
              : ruimte
          ),
          over > 0
            ? 'geen EB-teruggave hierop'
            : 'nog te benutten',
          kl
        )
      )
    );

    c.appendChild(
      el(
        'div',
        'margin-bottom:13px;',

        '<div style="' +
        'display:flex;' +
        'justify-content:space-between;' +
        'font-size:10px;' +
        'color:' +
        D.grijs +
        ';margin-bottom:5px;' +
        '">' +

          '<span>\u2190 import overheerst</span>' +
          '<span>break-even</span>' +
          '<span>export overschot \u2192</span>' +

        '</div>' +

        '<div style="' +
        'height:8px;' +
        'border-radius:4px;' +
        'border:1px solid ' +
        D.rand +
        ';position:relative;' +
        'background:linear-gradient(to right,' +
        D.groen +
        ' 0%,#a8d5b5 45%,#f0edf7 50%,#f5c0c0 55%,' +
        D.rood +
        ' 100%);">' +

          '<div style="' +
          'position:absolute;' +
          'top:0;' +
          'left:50%;' +
          'width:2px;' +
          'height:100%;' +
          'background:' +
          D.paars +
          ';opacity:.3;' +
          '">' +
          '</div>' +

          '<div style="' +
          'position:absolute;' +
          'top:-3px;' +
          'left:' +
          naald +
          '%;' +
          'transform:translateX(-50%);' +
          'width:14px;' +
          'height:14px;' +
          'border-radius:50%;' +
          'background:#fff;' +
          'border:2.5px solid ' +
          kl +
          ';box-shadow:0 1px 4px rgba(0,0,0,.15);' +
          '">' +
          '</div>' +

        '</div>'
      )
    );

    if (over > 0) {
      c.appendChild(
        el(
          'div',
          'margin-bottom:12px;' +
          'padding:7px 10px;' +
          'border-radius:7px;' +
          'font-size:11px;' +
          'background:rgba(220,53,69,.06);' +
          'color:' +
          D.rood +
          ';',

          kwh(
            over
          ) +
          ' export valt buiten de saldering \u2014 daarover komt geen ' +
          eur(
            EB,
            5
          ) +
          '/kWh energiebelasting terug, dus ' +
          eur(
            over *
            EB
          ) +
          ' minder dan wanneer er ruimte was.'
        )
      );
    }

    var det =
      el(
        'details',
        ''
      );

    det.innerHTML =
      '<summary style="' +
      'cursor:pointer;' +
      'font-size:11.5px;' +
      'color:' +
      D.grijs +
      ';list-style:none;' +
      '">' +
      '\u25b6 Maand voor maand' +
      '</summary>' +

      '<div style="margin-top:11px;">' +
      tabel +
      '</div>' +

      '<div style="' +
      'margin-top:10px;' +
      'font-size:10.5px;' +
      'color:' +
      D.grijs +
      ';line-height:1.5;' +
      '">' +

      (
        salderingPrognose
          ? 'Cursief = prognose \u00b7 '
          : 'Alleen maanden met echte cijfers \u00b7 '
      ) +

      '\u25c0 kantelpunt saldering \u00b7 ' +
      '\u26a0 na 31 december 2026, geen saldering meer' +

      '</div>';

    det.addEventListener(
      'toggle',
      function () {
        var s =
          det.querySelector(
            'summary'
          );

        if (s) {
          s.textContent =
            det.open
              ? '\u25bc Maand voor maand verbergen'
              : '\u25b6 Maand voor maand';
        }
      }
    );

    c.appendChild(det);

    return c;
  }


  /*
   * ============================================================
   * RESULTATEN — Balans-kaarten en grafiek
   * ============================================================
   */

  function zetKaartTekst(
    id,
    tekst,
    kl
  ) {
    var e =
      document.getElementById(
        id
      );

    if (!e) {
      return null;
    }

    e.textContent =
      tekst;

    if (kl) {
      e.style.setProperty(
        'color',
        kl,
        'important'
      );

    } else {
      e.style.removeProperty(
        'color'
      );
    }

    return e;
  }

  function zetSubInfo(
    id,
    html
  ) {
    var e =
      document.getElementById(
        id
      );

    if (!e) {
      return;
    }

    var houder =
      e.parentElement;

    var oud =
      houder.querySelector(
        '.be-sub'
      );

    if (oud) {
      oud.remove();
    }

    if (!html) {
      return;
    }

    houder.appendChild(
      el(
        'div',
        'margin-top:6px;' +
        'font-size:11px;' +
        'color:' +
        D.grijs +
        ';',
        html
      )
    );

    houder.lastElementChild
      .className =
        'be-sub';
  }

  function zetPopover(
    id,
    titel,
    inhoud
  ) {
    var e =
      document.getElementById(
        id
      );

    var m =
      e &&
      e.closest(
        '.summary-compact-metric'
      );

    var b =
      m &&
      m.querySelector(
        'button.help-popover'
      );

    if (!b) {
      return;
    }

    if (
      !b.getAttribute(
        'data-be-orig-titel'
      )
    ) {
      b.setAttribute(
        'data-be-orig-titel',
        b.getAttribute(
          'data-bs-title'
        ) || ''
      );

      b.setAttribute(
        'data-be-orig-inhoud',
        b.getAttribute(
          'data-bs-content'
        ) || ''
      );
    }

    var t =
      titel === null
        ? b.getAttribute(
            'data-be-orig-titel'
          )
        : titel;

    var c =
      inhoud === null
        ? b.getAttribute(
            'data-be-orig-inhoud'
          )
        : inhoud;

    if (
      b.getAttribute(
        'data-bs-title'
      ) === t &&
      b.getAttribute(
        'data-bs-content'
      ) === c
    ) {
      return;
    }

    b.setAttribute(
      'data-bs-title',
      t
    );

    b.setAttribute(
      'data-bs-content',
      c
    );

    b.setAttribute(
      'aria-label',
      t
    );

    try {
      var BS =
        window.bootstrap;

      var inst =
        (
          BS &&
          BS.Popover
        )
          ? BS.Popover.getInstance(
              b
            )
          : null;

      if (
        inst &&
        typeof inst.setContent ===
          'function'
      ) {
        inst.setContent({
          '.popover-header':
            t,

          '.popover-body':
            c
        });
      }

    } catch (err) {}
  }

  function pasPopoversAan(
    a,
    aan
  ) {
    if (!aan) {
      [
        'summary-stroom-voordeel',
        'summary-deal-result',
        'summary-buy-price',
        'summary-sell-price'
      ].forEach(
        function (id) {
          zetPopover(
            id,
            null,
            null
          );
        }
      );

      return;
    }

    var ebPerKwhVerk =
      a.exp > 0
        ? (
            a.ebVerk /
            a.exp
          )
        : 0;

    var buiten =
      a.ongesaldeerd > 0.5
        ? (
            ' Van de ' +
            kwh(
              a.exp
            ) +
            ' valt ' +
            kwh(
              a.ongesaldeerd
            ) +
            ' buiten de saldeerruimte; ' +
            'daarover komt geen energiebelasting terug.'
          )
        : (
            ' Alle teruglevering valt binnen de saldeerruimte, ' +
            'dus over elke kWh komt de volle ' +
            eur(
              EB,
              5
            ) +
            ' terug.'
          );

    zetPopover(
      'summary-stroom-voordeel',
      'Kosten stroomafname all-in',

      eur(
        Math.abs(
          a.balansInk
        )
      ) +
      ' volgens Balans, inclusief btw en \u20ac 0,02 leverkosten per kWh. ' +
      'Daar hoort ' +
      eur(
        Math.abs(
          a.ebInk
        )
      ) +
      ' energiebelasting bij: ' +
      kwh(
        a.imp
      ) +
      ' \u00d7 ' +
      eur(
        EB,
        5
      ) +
      ' per kWh. Samen ' +
      eur(
        Math.abs(
          a.allinInk
        )
      ) +
      '. Balans laat die belasting weg, terwijl je hem wel betaalt.'
    );

    zetPopover(
      'summary-deal-result',
      'Opbrengst teruglevering all-in',

      eur(
        a.balansVerk
      ) +
      ' volgens Balans, inclusief btw en minus \u20ac 0,02 leverkosten per kWh. ' +
      'Door saldering krijg je daarnaast ' +
      eur(
        a.ebVerk
      ) +
      ' energiebelasting terug over ' +
      kwh(
        a.gesaldeerd
      ) +
      '. Samen ' +
      eur(
        a.allinVerk
      ) +
      '.' +
      buiten
    );

    zetPopover(
      'summary-buy-price',
      'Gem. inkoopprijs all-in',

      ct(
        a.prijsInkBalans
      ) +
      ' per kWh volgens Balans, plus ' +
      ct(
        EB
      ) +
      ' energiebelasting inclusief btw, is ' +
      ct(
        a.prijsInk
      ) +
      ' per kWh. ' +
      'Dit is het bedrag dat je werkelijk kwijt bent voor een kilowattuur van het net.'
    );

    zetPopover(
      'summary-sell-price',
      'Gem. verkoopprijs all-in',

      ct(
        a.prijsVerkBalans
      ) +
      ' per kWh volgens Balans, plus ' +
      ct(
        ebPerKwhVerk
      ) +
      ' energiebelasting die je via saldering terugkrijgt, is ' +
      ct(
        a.prijsVerk
      ) +
      ' per kWh. ' +
      'Het verschil met de inkoopprijs is ' +
      ct(
        a.prijsVerk -
        a.prijsInk
      ) +
      ' per kWh.'
    );
  }

  function zetKaartLabel(aan) {
    var e =
      document.getElementById(
        'summary-stroom-voordeel'
      );

    if (!e) {
      return;
    }

    var kaartEl =
      e.closest(
        '.summary-compact-metric'
      );

    var lbl =
      kaartEl
        ? kaartEl.querySelector(
            '.summary-compact-label'
          )
        : null;

    if (!lbl) {
      return;
    }

    var tekstNode =
      Array.prototype
        .filter.call(
          lbl.childNodes,
          function (n) {
            return (
              n.nodeType === 3
            );
          }
        )[0];

    if (tekstNode) {
      tekstNode.nodeValue =
        aan
          ? 'Kosten stroomafname all-in'
          : 'Kosten stroomafname';
    }
  }

  function pasBalansKaartenAan(
    a,
    ruw,
    aan
  ) {
    if (!aan) {
      zetKaartTekst(
        'summary-stroom-voordeel',
        eur(
          ruw.inkoop
        )
      );

      zetKaartTekst(
        'summary-deal-result',
        eur(
          ruw.verkoop
        )
      );

      zetKaartTekst(
        'summary-buy-price',
        prijs(
          ruw.prijsInk
        )
      );

      zetKaartTekst(
        'summary-sell-price',
        prijs(
          ruw.prijsVerk
        )
      );

      zetSubInfo(
        'summary-stroom-voordeel',
        null
      );

      zetSubInfo(
        'summary-deal-result',
        null
      );

      zetKaartLabel(
        false
      );

      pasPopoversAan(
        a,
        false
      );

      return;
    }

    zetKaartTekst(
      'summary-stroom-voordeel',
      eur(
        Math.abs(
          a.allinInk
        )
      ),
      D.rood
    );

    zetKaartTekst(
      'summary-deal-result',
      eur(
        a.allinVerk
      ),
      D.groen
    );

    zetKaartTekst(
      'summary-buy-price',
      prijs(
        a.prijsInk
      )
    );

    zetKaartTekst(
      'summary-sell-price',
      prijs(
        a.prijsVerk
      )
    );

    zetSubInfo(
      'summary-stroom-voordeel',

      kwh(
        a.imp
      ) +
      ' \u00b7 waarvan ' +
      '<span style="' +
      'color:' +
      D.rood +
      ';font-weight:600;' +
      '">' +
      eur(
        Math.abs(
          a.ebInk
        )
      ) +
      '</span> energiebelasting'
    );

    zetSubInfo(
      'summary-deal-result',

      kwh(
        a.exp
      ) +
      ' \u00b7 waarvan ' +
      '<span style="' +
      'color:' +
      D.groen +
      ';font-weight:600;' +
      '">' +
      eur(
        a.ebVerk
      ) +
      '</span> energiebelasting terug'
    );

    zetKaartLabel(
      true
    );

    pasPopoversAan(
      a,
      true
    );
  }

  var chartOrig = null;
  var chartHerstelTimer = null;
  var chartWachtFrame = null;
  var chartWachtStatus = null;
  var chartRenderId = 0;

  function grafiekSleutel(chart) {
    return JSON.stringify([
      laatste ? laatste.interval : '',
      laatste ? laatste.periode : '',
      chart.data.labels
    ]);
  }

  function grafiekRenderVingerafdruk(chart) {
    if (!chart) {
      return '';
    }

    function r(v) {
      return Number.isFinite(v)
        ? Math.round(v * 1000) / 1000
        : null;
    }

    var uit = [
      chart.width,
      chart.height,
      chart.data &&
      chart.data.labels
        ? chart.data.labels.length
        : 0
    ];

    if (chart.chartArea) {
      uit.push(
        r(chart.chartArea.left),
        r(chart.chartArea.top),
        r(chart.chartArea.right),
        r(chart.chartArea.bottom)
      );
    }

    Object.keys(
      chart.scales || {}
    )
      .sort()
      .forEach(
        function (k) {
          var s =
            chart.scales[k];

          uit.push(
            k,
            r(s.min),
            r(s.max),
            r(s.left),
            r(s.top),
            r(s.right),
            r(s.bottom)
          );
        }
      );

    (chart.data.datasets || [])
      .forEach(
        function (ds, i) {
          var meta =
            chart.getDatasetMeta
              ? chart.getDatasetMeta(i)
              : null;

          uit.push(
            ds.label || '',
            Array.isArray(ds.data)
              ? ds.data.length
              : 0,
            meta && meta.hidden
              ? 1
              : 0
          );

          (
            meta &&
            Array.isArray(meta.data)
              ? meta.data
              : []
          ).forEach(
            function (e) {
              uit.push(
                r(e.x),
                r(e.y),
                r(e.base),
                r(e.width),
                r(e.height)
              );
            }
          );
        }
      );

    return JSON.stringify(
      uit
    );
  }

  var CHART_SETS = [
    'Inkoop kosten',
    'Verkoop opbrengsten',
    'Totaal'
  ];

  var voorlopigChartPluginGeregistreerd = false;

  function zorgVoorlopigChartPlugin() {
    if (
      voorlopigChartPluginGeregistreerd ||
      !window.Chart ||
      typeof Chart.register !==
        'function'
    ) {
      return;
    }

    try {
      Chart.register({
        id:
          'beVoorlopigArcering',

        beforeDatasetsDraw: function (chart) {
          // Alleen bijgetekende staven: 70% van hun oorspronkelijke dekking.
          if (!chart.$beVoorlopigIndices || !chart.$beVoorlopigIndices.length) return;
          chart.data.datasets.forEach(function (ds, di) {
            var meta = chart.getDatasetMeta(di);
            (meta.data || []).forEach(function (bar, index) {
              if (bar.$beOrigineleDraw || typeof bar.draw !== 'function') return;
              var origineel = bar.draw;
              bar.$beOrigineleDraw = origineel;
              bar.draw = function (ctx) {
                ctx.save();
                try {
                  if ((chart.$beVoorlopigIndices || []).indexOf(index) !== -1) ctx.globalAlpha *= 0.7;
                  return origineel.apply(this, arguments);
                } finally { ctx.restore(); }
              };
            });
          });
        },

        afterDatasetsDraw:
          function (chart) {
            var indices =
              chart.$beVoorlopigIndices || [];

            if (!indices.length) {
              return;
            }

            var ctx =
              chart.ctx;

            indices.forEach(
              function (idx) {
                chart.data.datasets
                  .forEach(
                    function (ds, datasetIndex) {
                      if (
                        !Array.isArray(
                          ds.data
                        ) ||
                        ds.data[idx] == null ||
                        !Number.isFinite(
                          Number(
                            ds.data[idx]
                          )
                        )
                      ) {
                        return;
                      }

                      var meta =
                        chart.getDatasetMeta(
                          datasetIndex
                        );

                      var staaf =
                        meta &&
                        meta.data &&
                        meta.data[idx];

                      if (
                        !staaf ||
                        !Number.isFinite(
                          staaf.x
                        ) ||
                        !Number.isFinite(
                          staaf.y
                        ) ||
                        !Number.isFinite(
                          staaf.base
                        ) ||
                        !Number.isFinite(
                          staaf.width
                        ) ||
                        staaf.width <= 0
                      ) {
                        return;
                      }

                      var links =
                        staaf.x -
                        staaf.width / 2;

                      var rechts =
                        staaf.x +
                        staaf.width / 2;

                      var boven =
                        Math.min(
                          staaf.y,
                          staaf.base
                        );

                      var onder =
                        Math.max(
                          staaf.y,
                          staaf.base
                        );

                      if (
                        onder - boven < 1
                      ) {
                        return;
                      }

                      ctx.save();

                      ctx.beginPath();
                      ctx.rect(
                        links,
                        boven,
                        rechts - links,
                        onder - boven
                      );
                      ctx.clip();

                      ctx.fillStyle =
                        'rgba(107,63,160,.035)';

                      ctx.fillRect(
                        links,
                        boven,
                        rechts - links,
                        onder - boven
                      );

                      ctx.strokeStyle =
                        'rgba(107,63,160,.28)';

                      ctx.lineWidth =
                        1;

                      var hoogte =
                        onder - boven;

                      for (
                        var p =
                          links - hoogte;
                        p < rechts;
                        p += 7
                      ) {
                        ctx.beginPath();
                        ctx.moveTo(
                          p,
                          onder
                        );
                        ctx.lineTo(
                          p + hoogte,
                          boven
                        );
                        ctx.stroke();
                      }

                      ctx.restore();
                    }
                  );
              }
            );
          }
      });

      voorlopigChartPluginGeregistreerd =
        true;

    } catch (e) {
      /*
       * Chart kan de plugin al kennen na een SPA-herbouw.
       */
      voorlopigChartPluginGeregistreerd =
        true;
    }
  }

  function herstelVoorlopigeGrafiek(chart) {
    var v = chart && chart.$beVoorlopig;
    if (!v) return;
    if (JSON.stringify(chart.data.labels) === JSON.stringify(v.projectedLabels)) {
      chart.data.labels = v.basisLabels.slice();
      v.datasets.forEach(function (o) {
        if (chart.data.datasets.indexOf(o.ref) !== -1) o.ref.data = o.data.slice();
      });
    }
    chart.$beVoorlopig = null;
    chart.$beVoorlopigIndices = [];
  }

  function pasVoorlopigeMaandGrafiekAan(chart, rijen, allin) {
    if (!chart || !laatste || laatste.interval !== 'month') return;
    var mk = laatste.periode;
    if (!/^\d{4}-\d{2}$/.test(String(mk))) return;
    var echt = laatste.rijen || [];
    var labelsBron = chart.data.labels || [];
    function labelKey(lbl) {
      if (typeof lbl === 'number' && lbl >= 1 && lbl <= 31) return mk + '-' + n2(lbl);
      var t = String(lbl).trim().toLowerCase().replace(/^~/, '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.slice(0, 7) === mk ? t : null;
      var m = t.match(/^(\d{1,2})(?:\s+([a-z]+)\.?)?$/);
      if (!m || +m[1] < 1 || +m[1] > dagenInMaand(mk)) return null;
      if (m[2] && m[2].slice(0, 3) !== MND_KORT[+mk.slice(5) - 1].toLowerCase().slice(0, 3)) return null;
      return mk + '-' + n2(+m[1]);
    }
    var indices = {};
    labelsBron.forEach(function (lbl, i) {
      var k = labelKey(lbl);
      if (k) indices[k] = indices[k] === undefined ? i : -1;
    });
    var perDag = {}, dubbel = false;
    echt.forEach(function (r, i) {
      if (!r || r.bronAanwezig === false) return;
      if (!voorlopigeDagGrenzen(r.key) || r.key.slice(0, 7) !== mk || perDag[r.key]) {
        dubbel = true; return;
      }
      var idx = indices[r.key];
      if (idx === undefined && echt.length === labelsBron.length) idx = i;
      if (idx === undefined || idx < 0) { dubbel = true; return; }
      perDag[r.key] = { index: idx };
    });
    if (dubbel) return;
    var opslag = leesVoorlopigeDagen();
    (rijen || []).forEach(function (r) {
      if (r && r.key && r.key.slice(0, 7) === mk && opslag[r.key] && !perDag[r.key]) {
        perDag[r.key] = { rij: opslag[r.key] };
      }
    });
    var basisLabels = chart.data.labels.slice();
    var datasets = chart.data.datasets.map(function (ds) {
      return { ref: ds, data: Array.isArray(ds.data) ? ds.data.slice() : [] };
    });
    var vandaag = iso(new Date());
    var einde = mk === vandaag.slice(0, 7) ? +vandaag.slice(8) : dagenInMaand(mk);
    if (mk > vandaag.slice(0, 7)) return;
    var labels = [], indices = [];
    var nieuw = datasets.map(function () { return []; });
    for (var dag = 1; dag <= einde; dag++) {
      var key = mk + '-' + n2(dag), item = perDag[key];
      labels.push(item && item.index !== undefined
        ? basisLabels[item.index]
        : item && item.rij
          ? voorlopigDagLabel(key)
          : key);
      var a = item && item.rij ? bereken(item.rij, naSaldering(key) ? item.rij.exp : 0, 1) : null;
      if (a) indices.push(dag - 1);
      datasets.forEach(function (o, di) {
        var value = null;
        if (item && item.index !== undefined) {
          value = o.data[item.index] == null ? null : o.data[item.index];
        } else if (a) {
          if (o.ref.label === 'Inkoop kosten') value = allin ? -a.allinInk : item.rij.inkoop;
          if (o.ref.label === 'Verkoop opbrengsten') value = allin ? a.allinVerk : item.rij.verkoop;
          if (o.ref.label === 'Totaal') value = allin ? a.stroom : -item.rij.inkoop + item.rij.verkoop;
          if (o.ref.label === 'Energiebelasting') value = allin ? a.eb : null;
        }
        nieuw[di].push(value);
      });
    }
    chart.data.labels = labels;
    datasets.forEach(function (o, i) { o.ref.data = nieuw[i]; });
    chart.$beVoorlopig = { basisLabels: basisLabels, datasets: datasets, projectedLabels: labels.slice() };
    chart.$beVoorlopigIndices = indices;
    zorgVoorlopigChartPlugin();
  }

  function pasGrafiekAan(perPeriode, aan, poging, renderId, bron, voorlopigeRijen) {
    poging = poging || 0;

    if (
      renderId !== chartRenderId ||
      laatste !== bron
    ) {
      return;
    }

    var chart =
      window.Chart &&
      Chart.getChart
        ? Chart.getChart(
            'summary-chart'
          )
        : null;

    /*
     * Alleen de Resultaten-chart wordt hier gevolgd.
     * Actueel en andere Chart.js-instanties worden nergens aangeraakt.
     */
    if (!chart) {
      if (poging < 30) {
        chartHerstelTimer =
          setTimeout(
            function () {
              pasGrafiekAan(
                perPeriode,
                aan,
                poging + 1,
                renderId,
                bron,
                voorlopigeRijen
              );
            },
            75
          );
      }

      return;
    }

    /*
     * Een eventuele vorige maandprojectie één keer terugzetten naar
     * de basislabels/data voordat we op de native Balans-render wachten.
     *
     * Geen chart.update() hier: Balans mag eerst zijn eigen render en
     * animatie volledig afmaken.
     */
    if (
      chart.$beHerstelRenderId !==
      renderId
    ) {
      herstelVoorlopigeGrafiek(
        chart
      );

      chart.$beHerstelRenderId =
        renderId;
    }

    var n =
      chart.data &&
      chart.data.labels
        ? chart.data.labels.length
        : 0;

    var origineleSets =
      chart.data &&
      chart.data.datasets
        ? chart.data.datasets.filter(
            function (d) {
              return (
                CHART_SETS.indexOf(
                  d.label
                ) !== -1
              );
            }
          )
        : [];

    var klaar =
      n > 0 &&
      origineleSets.length ===
        CHART_SETS.length &&
      origineleSets.every(
        function (d) {
          return (
            Array.isArray(
              d.data
            ) &&
            d.data.length === n
          );
        }
      );

    if (!klaar) {
      if (poging < 30) {
        chartHerstelTimer =
          setTimeout(
            function () {
              pasGrafiekAan(
                perPeriode,
                aan,
                poging + 1,
                renderId,
                bron,
                voorlopigeRijen
              );
            },
            75
          );
      }

      return;
    }

    var nu =
      (
        window.performance &&
        typeof performance.now ===
          'function'
      )
        ? performance.now()
        : Date.now();

    var vinger =
      grafiekRenderVingerafdruk(
        chart
      );

    if (
      !chartWachtStatus ||
      chartWachtStatus.renderId !==
        renderId ||
      chartWachtStatus.chart !==
        chart
    ) {
      chartWachtStatus = {
        renderId:
          renderId,

        chart:
          chart,

        gestart:
          nu,

        vorige:
          vinger,

        stabiel:
          0
      };

    } else if (
      chartWachtStatus.vorige ===
      vinger
    ) {
      chartWachtStatus.stabiel++;

    } else {
      chartWachtStatus.vorige =
        vinger;

      chartWachtStatus.stabiel =
        0;
    }

    /*
     * Dit is bewust géén vaste "180 ms en hopen"-render meer.
     *
     * We kijken uitsluitend naar summary-chart en wachten:
     * - minimaal 450 ms nadat de native chart bruikbaar werd;
     * - én minstens 5 opeenvolgende animation frames zonder
     *   verandering in schaal/chartArea/staaf- of puntgeometrie.
     *
     * Daardoor kan de originele Balans-animatie volledig aflopen.
     * Na maximaal 3 s gaan we toch door om een vastloper te voorkomen.
     */
    var langGenoeg =
      nu -
      chartWachtStatus.gestart >=
      450;

    var stabielGenoeg =
      chartWachtStatus.stabiel >=
      5;

    var timeout =
      nu -
      chartWachtStatus.gestart >=
      3000;

    if (
      (
        !langGenoeg ||
        !stabielGenoeg
      ) &&
      !timeout
    ) {
      chartWachtFrame =
        requestAnimationFrame(
          function () {
            pasGrafiekAan(
              perPeriode,
              aan,
              poging,
              renderId,
              bron,
              voorlopigeRijen
            );
          }
        );

      return;
    }

    chartWachtFrame =
      null;

    chartWachtStatus =
      null;

    delete chart.$beHerstelRenderId;

    /*
     * Pas NU — nadat Balans klaar is — nemen we de native reeks als
     * basis en zetten we de All-in/provisional projectie erop.
     */
    var sleutel =
      grafiekSleutel(
        chart
      );

    if (
      !chartOrig ||
      chartOrig.sleutel !==
        sleutel ||
      chartOrig.chart !==
        chart
    ) {
      chartOrig = {
        chart:
          chart,

        sleutel:
          sleutel,

        n:
          n,

        sets:
          origineleSets.map(
            function (d) {
              return {
                label:
                  d.label,

                data:
                  d.data.slice()
              };
            }
          )
      };
    }

    chart.data.datasets =
      chart.data.datasets
        .filter(
          function (d) {
            return (
              d.label !==
              'Energiebelasting'
            );
          }
        );

    if (
      !aan ||
      !perPeriode ||
      perPeriode.length !== n
    ) {
      chartOrig.sets
        .forEach(
          function (o) {
            var ds =
              chart.data.datasets
                .find(
                  function (d) {
                    return (
                      d.label ===
                      o.label
                    );
                  }
                );

            if (ds) {
              ds.data =
                o.data.slice();
            }
          }
        );

    } else {
      chart.data.datasets
        .forEach(
          function (ds) {
            if (
              ds.label ===
              'Inkoop kosten'
            ) {
              ds.data =
                perPeriode.map(
                  function (a) {
                    return -a.allinInk;
                  }
                );
            }

            if (
              ds.label ===
              'Verkoop opbrengsten'
            ) {
              ds.data =
                perPeriode.map(
                  function (a) {
                    return a.allinVerk;
                  }
                );
            }

            if (
              ds.label ===
              'Totaal'
            ) {
              ds.data =
                perPeriode.map(
                  function (a) {
                    return a.stroom;
                  }
                );
            }
          }
        );

      chart.data.datasets.push({
        label:
          'Energiebelasting',

        data:
          perPeriode.map(
            function (a) {
              return a.eb;
            }
          ),

        backgroundColor:
          '#1D9E75',

        borderRadius:
          0,

        order:
          2
      });
    }

    /*
     * Provisional dagen veranderen bij Maand ook het aantal X-categorieën.
     * Dat gebeurt vóór onderstaande normale Chart.js-update, zodat breedte
     * en schaal in dezelfde layoutpass opnieuw worden berekend.
     */
    pasVoorlopigeMaandGrafiekAan(
      chart,
      voorlopigeRijen || [],
      !!aan
    );

    if (
      chart.options.scales &&
      chart.options.scales.y
    ) {
      chart.options.scales.y.min =
        undefined;

      chart.options.scales.y.max =
        undefined;
    }

    /*
     * Geen update('none'): de normale Chart.js-animatie blijft behouden.
     * Omdat de native animatie hierboven al klaar was, vechten twee renders
     * niet meer om dezelfde schaal/bar-geometrie.
     */
    chart.update();
  }


  /*
   * ============================================================
   * RESULTATEN — API onderscheppen
   * ============================================================
   */

  var laatste = null;
  var periodeCache = {};
  var timer = null;

  function isJaarInterval(interval) {
    return interval === 'year' || interval === 'rolling_year';
  }

  function actievePeriode() {
    var knop = document.querySelector('.summary-granularity.active');
    var g = knop ? knop.textContent.trim().toLowerCase() : 'maand';

    if (g === 'dag') {
      var dagPicker = document.getElementById('dayPicker');
      return {
        interval: 'day',
        periode: dagPicker ? dagPicker.value : null
      };
    }

    if (g === 'jaar') {
      var jaarPicker = document.getElementById('summary-year-picker');
      var jaarKeuze = jaarPicker ? String(jaarPicker.value || '') : '';
      var jaarTekst =
        jaarPicker &&
        jaarPicker.options &&
        jaarPicker.selectedIndex >= 0
          ? String(
              jaarPicker.options[
                jaarPicker.selectedIndex
              ].textContent || ''
            ).trim()
          : (
              jaarPicker
                ? String(
                    jaarPicker.textContent ||
                    jaarPicker.getAttribute('value') ||
                    jaarPicker.getAttribute('aria-valuetext') ||
                    ''
                  ).trim()
                : ''
            );

      /*
       * Balans gebruikt voor "12 maanden" sinds de dashboardwijziging:
       * interval=rolling_year&period=de huidige jjjj-mm.
       */
      if (
        jaarKeuze === 'rolling_year' ||
        /12\s*maanden/i.test(jaarTekst)
      ) {
        return {
          interval: 'rolling_year',
          periode: iso(new Date()).slice(0, 7)
        };
      }

      return {
        interval: 'year',
        periode: jaarKeuze || String(new Date().getFullYear())
      };
    }

    var maandPicker = document.getElementById('summary-month-picker');
    return {
      interval: 'month',
      periode: maandPicker ? maandPicker.value : null
    };
  }

  function periodeSleutel(
    interval,
    periode
  ) {
    return (
      String(interval || '') +
      '|' +
      String(periode || '')
    );
  }

  function pastBijActievePeriode(
    data,
    actief
  ) {
    if (!data || !actief) {
      return false;
    }

    return (
      data.interval === actief.interval &&
      (
        !actief.periode ||
        String(data.periode || '') === String(actief.periode)
      )
    );
  }

  function kiesActieveCache() {
    var actief = actievePeriode();
    var opgeslagen = periodeCache[
      periodeSleutel(
        actief.interval,
        actief.periode
      )
    ];

    if (opgeslagen) {
      laatste = opgeslagen;
      return true;
    }

    return pastBijActievePeriode(
      laatste,
      actief
    );
  }

  function onthoud(
    j,
    valInterval,
    valPeriode
  ) {
    if (
      !j ||
      !Array.isArray(
        j.series
      )
    ) {
      return false;
    }

    var actief =
      actievePeriode();

    var isAangevraagdeRolling =
      actief.interval === 'rolling_year' &&
      valInterval === 'rolling_year';

    var interval =
      isAangevraagdeRolling
        ? 'rolling_year'
        : (
            j.interval ||
            valInterval ||
            'month'
          );

    var pv =
      j.pricing || {};

    var tot =
      j.totals || {};

    var snapshot = {
      rijen:
        j.series.map(
          function (s) {
            return naarIncl(
              s,
              pv
            );
          }
        ),

      totaal:
        naarIncl(
          tot,
          pv
        ),

      ruw: {
        inkoop:
          getal(
            tot.total_buy_eur
          ),

        verkoop:
          getal(
            tot.total_sell_eur
          ),

        prijsInk:
          getal(
            tot.avg_buy_price_eur_per_kwh
          ),

        prijsVerk:
          getal(
            tot.avg_sell_price_eur_per_kwh
          )
      },

      interval:
        interval,

      periode:
        isAangevraagdeRolling
          ? (
              valPeriode ||
              actief.periode
            )
          : (
              j.period ||
              valPeriode ||
              actief.periode
            )
    };

    periodeCache[
      periodeSleutel(
        snapshot.interval,
        snapshot.periode
      )
    ] = snapshot;

    /*
     * Balans kan tijdens de opbouw van Resultaten nog een antwoord van
     * de vorige granulariteit afronden. Bewaar dat antwoord wel, maar laat
     * het de nu gekozen Dag/Maand/Jaar-periode nooit overschrijven.
     */
    if (!pastBijActievePeriode(snapshot, actief)) {
      return false;
    }

    laatste = snapshot;

    return true;
  }

  if (
    KLANT &&
    KLANT !== 'account'
  ) {
    window.fetch =
      function (
        input,
        init
      ) {
        var url =
          typeof input === 'string'
            ? input
            : (
                input &&
                typeof input.url ===
                  'string'
                  ? input.url
                  : ''
              );

        var p =
          origFetch(
            input,
            init
          );

        if (
          url.indexOf(
            'results-v2-api'
          ) === -1
        ) {
          return p;
        }

        return p.then(
          function (resp) {
            if (!resp.ok) {
              return resp;
            }

            var requestUrl;

            try {
              requestUrl =
                new URL(
                  url,
                  location.origin
                );
            } catch (e) {
              requestUrl = null;
            }

            resp.clone()
              .json()
              .then(
                function (j) {
                  if (
                    onthoud(
                      j,
                      requestUrl
                        ? requestUrl.searchParams.get('interval')
                        : null,
                      requestUrl
                        ? requestUrl.searchParams.get('period')
                        : null
                    )
                  ) {
                    plan();
                  }
                }
              )
              .catch(
                function () {}
              );

            return resp;
          }
        );
      };
  }

  function plan() {
    clearTimeout(
      timer
    );

    timer =
      setTimeout(
        function () {
          if (kiesActieveCache()) {
            herteken();

          } else {
            zelfHalen()
              .then(
                function (ok) {
                  if (ok) {
                    herteken();
                  }
                }
              );
          }
        },
        90
      );
  }

  var bezig = false;

  function zelfHalen() {
    if (
      bezig ||
      !KLANT
    ) {
      return Promise.resolve(
        false
      );
    }

    var actief =
      actievePeriode();

    if (!actief.periode) {
      return Promise.resolve(
        false
      );
    }

    bezig = true;

    var u =
      new URL(
        location.origin +
        '/customer/' +
        KLANT +
        '/results-v2-api/'
      );

    u.searchParams.set(
      'interval',
      actief.interval
    );

    u.searchParams.set(
      'period',
      actief.periode
    );

    u.searchParams.set(
      'include_vat',
      '1'
    );

    u.searchParams.set(
      'include_delivery_cost',
      '1'
    );

    return origFetch(
      u,
      {
        credentials:
          'same-origin'
      }
    )

      .then(
        function (r) {
          return r.ok
            ? r.json()
            : null;
        }
      )

      .then(
        function (j) {
          bezig = false;

          return onthoud(
            j,
            actief.interval,
            actief.periode
          );
        }
      )

      .catch(
        function () {
          bezig = false;
          return false;
        }
      );
  }


  /*
   * ============================================================
   * RESULTATEN — pagina bouwen
   * ============================================================
   */

  function anker() {
    var k =
      document.querySelector(
        '.results-summary-card'
      );

    return k
      ? k.closest(
          '.row'
        )
      : null;
  }

  function houder() {
    var h =
      document.getElementById(
        'be-panelen'
      );

    if (h) {
      return h;
    }

    var a =
      anker();

    if (
      !a ||
      !a.parentElement
    ) {
      return null;
    }

    h =
      el(
        'div',
        ''
      );

    h.id =
      'be-panelen';

    a.parentElement
      .insertBefore(
        h,
        a.nextSibling
      );

    return h;
  }

  function regelBalansBlok() {
    var b =
      document.querySelector(
        '.results-trade-savings-card'
      );

    /*
     * De nieuwe dashboardopbouw deelt layout-rijen met andere onderdelen.
     * Verberg daarom alleen de kaart zelf en nooit meer closest('.row').
     */
    if (b) {
      b.style.display =
        cfg.balansBlok
          ? ''
          : 'none';
    }

    /* De originele kop/intro blijft staan; die hoort bij de pagina. */
  }

  function periodeNaam() {
    var t =
      document.getElementById(
        'summary-title'
      );

    return t
      ? t.textContent.trim()
      : (
          laatste
            ? laatste.periode
            : ''
        );
  }

  function herteken() {
    if (!kiesActieveCache()) {
      zelfHalen()
        .then(
          function (ok) {
            if (ok) {
              herteken();
            }
          }
        );

      return;
    }

    var h =
      houder();

    if (!h) {
      return;
    }

    regelBalansBlok();
    var renderBron = laatste;

    var extraMaandKey =
      null;

    if (
      laatste.interval ===
        'day' &&
      laatste.periode
    ) {
      extraMaandKey =
        String(
          laatste.periode
        ).slice(
          0,
          7
        );

    } else if (
      isJaarInterval(laatste.interval) &&
      (
        laatste.interval === 'rolling_year' ||
        String(laatste.periode) === String(new Date().getFullYear())
      )
    ) {
      extraMaandKey =
        iso(
          new Date()
        ).slice(
          0,
          7
        );
    }

    var extraMaand =
      extraMaandKey
        ? haalMaandDagen(
            extraMaandKey
          )
        : Promise.resolve(
            []
          );

    /*
     * Voorschot & verrekening beslaat het contractjaar, onafhankelijk
     * van de hierboven geselecteerde grafiekperiode. Valideer de
     * voorlopige dagen daarom altijd tegen de echte dagen van de
     * lopende maand, ook wanneer de gebruiker 2025 bekijkt.
     */
    var contractVoorlopigeKey =
      iso(new Date()).slice(0, 7);

    var contractMaand =
      laatste.interval === 'month' &&
      laatste.periode === contractVoorlopigeKey
        ? Promise.resolve(laatste.rijen)
        : extraMaandKey === contractVoorlopigeKey
          ? extraMaand
          : haalMaandDagen(contractVoorlopigeKey);

    Promise.all([
      haalContractjaar(),
      haalLopendeDagen(),
      extraMaand,
      contractMaand
    ]).then(
      function (res) {
        if (laatste !== renderBron) return;
        var jaar =
          res[0];

        var sald =
          salderingReeks(
            jaar,
            false
          );

        var saldProg =
          salderingReeks(
            jaar,
            true
          );

        var tot =
          laatste.totaal;

        var huidigeKey = null;
        var ongesaldeerd;
        var dagen;
        var periodeWoord;

        if (
          laatste.interval ===
            'month' &&
          laatste.periode
        ) {
          huidigeKey =
            laatste.periode;

          tot.key =
            huidigeKey;

          var s =
            sald.find(
              function (x) {
                return (
                  x.key ===
                  huidigeKey
                );
              }
            );

          ongesaldeerd =
            s
              ? s.ongesaldeerd
              : Math.max(
                  0,
                  tot.exp -
                  tot.imp
                );

          dagen =
            dagenVerstreken(
              huidigeKey
            );

          periodeWoord =
            'deze maand';

        } else if (
          laatste.interval ===
          'day'
        ) {
          huidigeKey =
            laatste.periode
              ? String(
                  laatste.periode
                ).slice(
                  0,
                  7
                )
              : null;

          var sm =
            sald.find(
              function (x) {
                return (
                  x.key ===
                  huidigeKey
                );
              }
            );

          var maandExp =
            res[2].reduce(
              function (
                a,
                r
              ) {
                return (
                  a +
                  r.exp
                );
              },
              0
            );

          var fractieDagOnges =
            (
              sm &&
              maandExp > 0
            )
              ? (
                  sm.ongesaldeerd /
                  maandExp
                )
              : 0;

          ongesaldeerd =
            tot.exp *
            Math.min(
              1,
              Math.max(
                0,
                fractieDagOnges
              )
            );

          dagen = 1;

          periodeWoord =
            'deze dag';

        } else {
          if (
            isJaarInterval(laatste.interval) &&
            (
              laatste.interval === 'rolling_year' ||
              String(laatste.periode) === String(new Date().getFullYear())
            )
          ) {
            huidigeKey =
              iso(
                new Date()
              ).slice(
                0,
                7
              );
          }

          var eigenKeys = {};

          laatste.rijen
            .forEach(
              function (r) {
                if (r.key) {
                  eigenKeys[
                    r.key
                  ] = true;
                }
              }
            );

          dagen =
            laatste.rijen
              .reduce(
                function (
                  a,
                  r
                ) {
                  return (
                    a +
                    (
                      r.key
                        ? dagenVerstreken(
                            r.key
                          )
                        : 0
                    )
                  );
                },
                0
              );

          ongesaldeerd =
            sald.reduce(
              function (
                a,
                x
              ) {
                return (
                  a +
                  (
                    x.overgeslagen ||
                    !eigenKeys[
                      x.key
                    ]
                      ? 0
                      : x.ongesaldeerd
                  )
                );
              },
              0
            );

          periodeWoord =
            'deze periode';
        }

        var a =
          bereken(
            tot,
            ongesaldeerd,
            dagen
          );

        var fractieOnges =
          tot.exp > 0
            ? (
                ongesaldeerd /
                tot.exp
              )
            : 0;

        var perPeriode =
          laatste.rijen.map(
            function (r) {
              return bereken(
                r,
                r.exp *
                fractieOnges,
                1
              );
            }
          );

        var voorlopigeRijen =
          (
            laatste.interval ===
              'month' ||
            laatste.interval ===
              'day'
          )
            ? voorlopigeDagenVoorMaand(
                huidigeKey,
                laatste.interval ===
                  'day'
                    ? res[2]
                    : laatste.rijen
              )
            : (
                isJaarInterval(laatste.interval) &&
                huidigeKey
                  ? voorlopigeDagenVoorMaand(
                      huidigeKey,
                      res[2]
                    )
                  : []
              );

        var contractVoorlopigeRijen =
          voorlopigeDagenVoorMaand(
            contractVoorlopigeKey,
            res[3]
          );

        pasBalansKaartenAan(
          a,
          laatste.ruw,
          cfg.allin
        );

        clearTimeout(
          chartHerstelTimer
        );

        if (chartWachtFrame) {
          cancelAnimationFrame(
            chartWachtFrame
          );

          chartWachtFrame =
            null;
        }

        chartWachtStatus =
          null;

        var renderId =
          ++chartRenderId;

        var bron =
          laatste;

        var grafiekAan =
          cfg.allin &&
          laatste.interval !==
            'day';

        chartHerstelTimer =
          setTimeout(
            function () {
              pasGrafiekAan(
                perPeriode,
                grafiekAan,
                0,
                renderId,
                bron,
                voorlopigeRijen
              );
            },
            30
          );

        h.innerHTML = '';

        if (!cfg.allin) {
          h.appendChild(
            el(
              'div',
              'margin-top:14px;' +
              'padding:11px 14px;' +
              'border:1px dashed ' +
              D.rand +
              ';border-radius:9px;' +
              'font-size:12px;' +
              'color:' +
              D.grijs +
              ';',

              'All-in staat uit \u2014 dit zijn de cijfers van Balans zelf, ' +
              'zonder energiebelasting. Zet de schakelaar ' +
              '<b style="color:' +
              D.paars +
              ';">All-in</b> in de kaartkop aan.'
            )
          );

          return;
        }

        var maandStaat =
          bouwMaandstaat(
            jaar,
            sald,
            saldProg,
            huidigeKey,
            contractVoorlopigeRijen,
            contractVoorlopigeKey
          );

        var kaartCtx = {
          naam:
            periodeNaam(),

          interval:
            laatste.interval,

          periodeWoord:
            periodeWoord
        };

        if (
          laatste.interval ===
            'rolling_year'
        ) {
          kaartCtx.contractBetaald =
            parseFloat(
              maandStaat.dataset.beBetaald
            );

          kaartCtx.contractWerkelijk =
            parseFloat(
              maandStaat.dataset.beWerkelijk
            );

          kaartCtx.contractSaldo =
            parseFloat(
              maandStaat.dataset.beSaldoNu
            );

          kaartCtx.contractMaanden =
            parseInt(
              maandStaat.dataset.beMaandenBekend,
              10
            ) || 0;
        }

        var kaartEl =
          bouwHoofdkaart(
            a,
            kaartCtx
          );

        kaartEl.appendChild(
          bouwPrijsopbouw(
            a
          )
        );

        if (laatste.interval !== 'day') {
          var f = fpr(perPeriode);
          var fprSectie = bouwFpr(f, periodeWoord);

          if (fprSectie) {
            kaartEl.appendChild(fprSectie);
          }
        }

        kaartEl.appendChild(
          maandStaat
        );

        var saldSectie =
          bouwSaldering(
            salderingPrognose
              ? saldProg
              : sald
          );

        if (saldSectie) {
          kaartEl.appendChild(
            saldSectie
          );
        }

        h.appendChild(
          kaartEl
        );

        var knop =
          document.getElementById(
            'be-sald-prog'
          );

        if (knop) {
          knop.addEventListener(
            'click',
            function (e) {
              e.preventDefault();

              salderingPrognose =
                !salderingPrognose;

              herteken();
            }
          );
        }

        var g =
          grenzen();

        if (
          g &&
          g.max_day
        ) {
          h.appendChild(
            bouwVerwerkt(
              g
            )
          );
        }
      }
    );
  }

  function bouwVerwerkt(g) {
    var laatsteDag =
      new Date(
        g.max_day +
        'T12:00:00'
      );

    var achter =
      Math.round(
        (
          new Date(
            iso(
              new Date()
            ) +
            'T12:00:00'
          ) -
          laatsteDag
        ) /
        86400000
      );

    var laat =
      achter > 3;

    var c =
      el(
        'div',
        'margin-top:14px;' +
        'padding:9px 13px;' +
        'border-radius:8px;' +
        'font-size:11.5px;' +
        'line-height:1.55;' +
        'background:' +
        (
          laat
            ? 'rgba(224,123,0,.08)'
            : '#f6f4fa'
        ) +
        ';border:1px solid ' +
        (
          laat
            ? 'rgba(224,123,0,.35)'
            : D.rand
        ) +
        ';color:' +
        (
          laat
            ? '#5a4a33'
            : D.grijs
        ) +
        ';',

        'Balans heeft verwerkt tot en met <b>' +
        laatsteDag.getDate() +
        ' ' +
        MND_LANG[
          laatsteDag.getMonth()
        ] +
        '</b> \u2014 ' +
        achter +
        ' dag' +
        (
          achter === 1
            ? ''
            : 'en'
        ) +
        ' achterstand. ' +
        (
          laat
            ? 'Dat is meer dan de gebruikelijke twee dagen.'
            : 'Dat is normaal.'
        )
      );

    c.id =
      'be-verwerkt';

    return c;
  }


  /*
   * ============================================================
   * RESULTATEN — toggle + instellingen
   * ============================================================
   */

  function injecteerKop() {
    if (
      document.getElementById(
        'be-kop'
      )
    ) {
      return;
    }

    var k =
      document.querySelector(
        '.results-summary-card'
      );

    var hdr =
      k
        ? k.querySelector(
            '.card-header'
          )
        : null;

    if (!hdr) {
      return;
    }

    var cs =
      getComputedStyle(
        hdr
      );

    if (
      cs.display !==
      'flex'
    ) {
      hdr.style.display =
        'flex';

      hdr.style.alignItems =
        'center';

      hdr.style.flexWrap =
        'wrap';

      hdr.style.gap =
        '12px';
    }

    var wrap =
      el(
        'div',
        'display:flex;' +
        'align-items:center;' +
        'gap:11px;' +
        'margin-left:auto;' +
        'user-select:none;'
      );

    wrap.id =
      'be-kop';

    var lbl =
      el(
        'span',
        'font-size:13px;' +
        'font-weight:600;' +
        'letter-spacing:.03em;' +
        'transition:color .2s;' +
        'color:' +
        (
          cfg.allin
            ? D.paars
            : D.paarsLicht
        ) +
        ';',
        'All-in'
      );

    var track =
      el(
        'div',
        'position:relative;' +
        'width:44px;' +
        'height:24px;' +
        'border-radius:12px;' +
        'flex-shrink:0;' +
        'border:1.5px solid ' +
        D.paarsLicht +
        ';transition:background .25s;' +
        'background:' +
        (
          cfg.allin
            ? D.paars
            : D.rand
        ) +
        ';'
      );

    var thumb =
      el(
        'div',
        'position:absolute;' +
        'top:2px;' +
        'left:2px;' +
        'width:16px;' +
        'height:16px;' +
        'border-radius:50%;' +
        'background:#fff;' +
        'box-shadow:0 1px 4px rgba(0,0,0,.25);' +
        'transition:transform .25s;' +
        'transform:translateX(' +
        (
          cfg.allin
            ? '20px'
            : '0'
        ) +
        ');'
      );

    track.appendChild(
      thumb
    );

    var schakel =
      el(
        'label',
        'display:flex;' +
        'align-items:center;' +
        'gap:9px;' +
        'cursor:pointer;'
      );

    schakel.appendChild(
      lbl
    );

    schakel.appendChild(
      track
    );

    schakel.addEventListener(
      'click',
      function (e) {
        e.preventDefault();

        cfg.allin =
          !cfg.allin;

        lbl.style.color =
          cfg.allin
            ? D.paars
            : D.paarsLicht;

        track.style.background =
          cfg.allin
            ? D.paars
            : D.rand;

        thumb.style.transform =
          cfg.allin
            ? 'translateX(20px)'
            : 'translateX(0)';

        herteken();
      }
    );

    wrap.appendChild(
      schakel
    );

    var gear =
      el(
        'div',
        'width:18px;' +
        'height:18px;' +
        'cursor:pointer;' +
        'opacity:.6;' +
        'flex-shrink:0;' +
        'transition:opacity .2s;'
      );

    gear.innerHTML =
      '<svg viewBox="0 0 24 24" ' +
      'fill="none" ' +
      'stroke="' +
      D.paars +
      '" ' +
      'stroke-width="2" ' +
      'stroke-linecap="round" ' +
      'stroke-linejoin="round" ' +
      'style="width:100%;height:100%;">' +

        '<circle cx="12" cy="12" r="3"/>' +

        '<path d="' +
        'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06' +
        'a2 2 0 0 1-2.83 2.83l-.06-.06' +
        'a1.65 1.65 0 0 0-1.82-.33 ' +
        '1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09' +
        'A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33' +
        'l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06' +
        'A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1' +
        'H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9' +
        'a1.65 1.65 0 0 0-.33-1.82l-.06-.06' +
        'a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68' +
        'a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09' +
        'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33' +
        'l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06' +
        'A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1' +
        'H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' +
        '"/>' +

      '</svg>';

    gear.addEventListener(
      'mouseenter',
      function () {
        gear.style.opacity =
          '1';
      }
    );

    gear.addEventListener(
      'mouseleave',
      function () {
        gear.style.opacity =
          '.6';
      }
    );

    gear.addEventListener(
      'click',
      function (e) {
        e.stopPropagation();

        var p =
          document.getElementById(
            'be-paneel'
          );

        if (p) {
          p.remove();
          return;
        }

        openInstellingen(
          hdr
        );
      }
    );

    wrap.appendChild(
      gear
    );

    hdr.appendChild(
      wrap
    );
  }

  function veld(
    id,
    label,
    waarde,
    type
  ) {
    return (
      '<div style="margin-bottom:13px;">' +

        '<label style="' +
        'font-size:10.5px;' +
        'color:#555;' +
        'display:block;' +
        'margin-bottom:5px;' +
        'text-transform:uppercase;' +
        'letter-spacing:.04em;' +
        '">' +
        label +
        '</label>' +

        '<input id="' +
        id +
        '" type="' +
        type +
        '" step="0.01" value="' +
        waarde +
        '" style="' +
        'width:100%;' +
        'box-sizing:border-box;' +
        'padding:8px 10px;' +
        'border:1px solid ' +
        D.rand +
        ';border-radius:6px;' +
        'font-size:13px;' +
        '">' +

      '</div>'
    );
  }

  function knopje(
    id,
    titel,
    uitleg,
    aan
  ) {
    return (
      '<div style="' +
      'margin-bottom:11px;' +
      'padding:10px 12px;' +
      'background:#faf9fd;' +
      'border:1px solid ' +
      D.rand +
      ';border-radius:8px;' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:space-between;' +
      'gap:12px;' +
      '">' +

        '<div>' +

          '<div style="' +
          'font-size:11px;' +
          'color:#555;' +
          'font-weight:600;' +
          '">' +
          titel +
          '</div>' +

          '<div style="' +
          'font-size:10px;' +
          'color:' +
          D.paarsLicht +
          ';margin-top:3px;' +
          'line-height:1.4;' +
          '">' +
          uitleg +
          '</div>' +

        '</div>' +

        '<div id="' +
        id +
        '" style="' +
        'position:relative;' +
        'width:36px;' +
        'height:20px;' +
        'border-radius:10px;' +
        'cursor:pointer;' +
        'flex-shrink:0;' +
        'transition:background .2s;' +
        'background:' +
        (
          aan
            ? D.paars
            : D.rand
        ) +
        ';">' +

          '<div style="' +
          'position:absolute;' +
          'top:3px;' +
          'left:' +
          (
            aan
              ? '18px'
              : '3px'
          ) +
          ';width:14px;' +
          'height:14px;' +
          'border-radius:7px;' +
          'background:#fff;' +
          'transition:left .2s;' +
          'box-shadow:0 1px 3px rgba(0,0,0,.2);' +
          '">' +
          '</div>' +

        '</div>' +

      '</div>'
    );
  }

  function hangKnopje(
    id,
    staat,
    sleutel
  ) {
    var e =
      document.getElementById(
        id
      );

    if (!e) {
      return;
    }

    e.addEventListener(
      'click',
      function () {
        staat[sleutel] =
          !staat[sleutel];

        e.style.background =
          staat[sleutel]
            ? D.paars
            : D.rand;

        e.firstElementChild
          .style.left =
            staat[sleutel]
              ? '18px'
              : '3px';
      }
    );
  }

  function openInstellingen(hdr) {
    var p =
      el(
        'div',
        'position:absolute;' +
        'z-index:9999;' +
        'background:#fff;' +
        'border:1px solid ' +
        D.rand +
        ';border-radius:10px;' +
        'padding:17px 19px;' +
        'width:330px;' +
        'box-shadow:0 6px 22px rgba(107,63,160,.16);'
      );

    p.id =
      'be-paneel';

    var r =
      hdr.getBoundingClientRect();

    p.style.top =
      (
        window.scrollY +
        r.bottom +
        6
      ) +
      'px';

    p.style.left =
      Math.max(
        12,
        window.scrollX +
        r.right -
        340
      ) +
      'px';

    p.innerHTML =
      '<div style="' +
      'display:flex;' +
      'justify-content:space-between;' +
      'align-items:center;' +
      'margin-bottom:15px;' +
      '">' +

        '<div style="' +
        'font-size:12px;' +
        'font-weight:700;' +
        'letter-spacing:.05em;' +
        'text-transform:uppercase;' +
        'color:' +
        D.paars +
        ';">' +
        'Instellingen v4.5.4' +
        '</div>' +

        '<span id="be-p-sluit" style="' +
        'cursor:pointer;' +
        'font-size:19px;' +
        'color:#aaa;' +
        'line-height:1;' +
        '">' +
        '\u00d7' +
        '</span>' +

      '</div>' +

      veld(
        'be-p-voorschot',
        'Voorschot per maand (\u20ac)',
        cfg.voorschot.toFixed(2),
        'number'
      ) +

      veld(
        'be-p-start',
        'Startdatum contract (dd-mm-jjjj)',
        n2(
          cfg.start.getDate()
        ) +
        '-' +
        n2(
          cfg.start.getMonth() + 1
        ) +
        '-' +
        cfg.start.getFullYear(),
        'text'
      ) +

      knopje(
        'be-p-sald',
        'Salderingsbalans tonen',
        'Import tegen export over het contractjaar',
        cfg.saldering
      ) +

      knopje(
        'be-p-balans',
        'Blok "Balans Systeem resultaat" tonen',
        'Besparing tegenover een vast contract, exclusief energiebelasting',
        cfg.balansBlok
      ) +

      '<div style="' +
      'display:flex;' +
      'gap:8px;' +
      'margin-top:4px;' +
      '">' +

        '<button id="be-p-op" style="' +
        'flex:1;' +
        'padding:9px;' +
        'background:' +
        D.paars +
        ';color:#fff;' +
        'border:none;' +
        'border-radius:6px;' +
        'font-size:12px;' +
        'font-weight:600;' +
        'cursor:pointer;' +
        '">' +
        'Opslaan' +
        '</button>' +

        '<button id="be-p-wis" ' +
        'title="Wis restanten van eerdere versies uit localStorage" ' +
        'style="' +
        'padding:9px 12px;' +
        'background:#fff;' +
        'color:' +
        D.rood +
        ';border:1px solid ' +
        D.rood +
        ';border-radius:6px;' +
        'font-size:12px;' +
        'cursor:pointer;' +
        '">' +
        'Wis data' +
        '</button>' +

      '</div>' +

      '<div id="be-p-melding" style="' +
      'margin-top:11px;' +
      'font-size:11px;' +
      'display:none;' +
      '">' +
      '</div>';

    document.body.appendChild(
      p
    );

    document.getElementById(
      'be-p-sluit'
    ).addEventListener(
      'click',
      function () {
        p.remove();
      }
    );

    var staat = {
      sald:
        cfg.saldering,

      balans:
        cfg.balansBlok
    };

    hangKnopje(
      'be-p-sald',
      staat,
      'sald'
    );

    hangKnopje(
      'be-p-balans',
      staat,
      'balans'
    );

    document.getElementById(
      'be-p-wis'
    ).addEventListener(
      'click',
      function () {
        var m =
          document.getElementById(
            'be-p-melding'
          );

        if (
          !confirm(
            'Restanten van eerdere versies uit localStorage wissen? De instellingen blijven staan.'
          )
        ) {
          return;
        }

        var n =
          wisOpslag();

        m.style.color =
          n > 0
            ? D.oranje
            : D.grijs;

        m.textContent =
          n > 0
            ? (
                n +
                ' oude sleutel' +
                (
                  n === 1
                    ? ''
                    : 's'
                ) +
                ' gewist.'
              )
            : (
                'Niets te wissen \u2014 er stond niets ouds meer in.'
              );

        m.style.display =
          'block';

        herteken();
      }
    );

    document.getElementById(
      'be-p-op'
    ).addEventListener(
      'click',
      function () {
        var m =
          document.getElementById(
            'be-p-melding'
          );

        function fout(t) {
          m.style.color =
            D.rood;

          m.textContent =
            t;

          m.style.display =
            'block';
        }

        var v =
          parseFloat(
            document.getElementById(
              'be-p-voorschot'
            ).value
          );

        var s =
          document.getElementById(
            'be-p-start'
          )
            .value
            .trim()
            .split('-');

        if (
          isNaN(v) ||
          v < 0
        ) {
          return fout(
            'Ongeldig voorschotbedrag.'
          );
        }

        if (
          s.length !== 3
        ) {
          return fout(
            'Datum moet dd-mm-jjjj zijn.'
          );
        }

        var d =
          new Date(
            parseInt(
              s[2],
              10
            ),
            parseInt(
              s[1],
              10
            ) - 1,
            parseInt(
              s[0],
              10
            )
          );

        if (
          isNaN(
            d.getTime()
          )
        ) {
          return fout(
            'Ongeldige datum.'
          );
        }

        cfg.voorschot =
          v;

        cfg.start =
          d;

        cfg.saldering =
          staat.sald;

        cfg.balansBlok =
          staat.balans;

        localStorage.setItem(
          LS.voorschot,
          v.toFixed(2)
        );

        localStorage.setItem(
          LS.startdatum,
          iso(d)
        );

        localStorage.setItem(
          LS.saldering,
          staat.sald
            ? 'aan'
            : 'uit'
        );

        localStorage.setItem(
          LS.balansBlok,
          staat.balans
            ? 'aan'
            : 'uit'
        );

        contractCache =
          null;

        dagenLopend =
          null;

        m.style.color =
          D.groen;

        m.textContent =
          'Opgeslagen.';

        m.style.display =
          'block';

        herteken();
      }
    );
  }

  function wisOpslag() {
    var weg = [];

    try {
      Object.keys(
        localStorage
      ).forEach(
        function (k) {
          if (
            k.indexOf('be_') === 0 &&
            k.indexOf(
              'be_cfg_'
            ) !== 0
          ) {
            weg.push(k);
          }
        }
      );

      weg.forEach(
        function (k) {
          localStorage.removeItem(
            k
          );
        }
      );

    } catch (e) {}

    contractCache =
      null;

    dagenLopend =
      null;

    cacheJaar = {};

    return weg.length;
  }


  /*
   * ============================================================
   * START
   * ============================================================
   */

  function pols() {
    if (
      location.pathname.indexOf(
        '/results'
      ) === -1
    ) {
      return;
    }

    injecteerKop();

    regelBalansBlok();

    resultatenHaalVoorlopigeDagen()
      .then(
        function (ok) {
          if (ok) {
            plan();
          }
        }
      );
  }

  function start() {
    new MutationObserver(
      pols
    ).observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

    startActueelAllin();
    beArchiefOnderhoud();
    setInterval(beArchiefOnderhoud, 30000);

    pols();

    if (
      location.pathname.indexOf(
        '/results'
      ) !== -1
    ) {
      setTimeout(
        plan,
        400
      );

      setTimeout(
        plan,
        1600
      );
    }
  }

  if (document.body) {
    start();

  } else {
    document.addEventListener(
      'DOMContentLoaded',
      start
    );
  }

    

    
})();


/*
 * ============================================================
 * ABSURD UNITS — alleen actief wanneer Resultaten All-in AAN staat
 * Los getest als v0.5 en hier ongewijzigd geïntegreerd.
 * Jaar: originele Balans-jaargrafiek blijft intact.
 * Dag/Maand: Absurd Units mogen ook de samenvattingsgrafiek overnemen.
 * ============================================================
 */

(function () {
  'use strict';

  /* Ook het losse Absurd Units-deel mag maar één DOM-schrijver hebben. */
  var BE_ABSURD_GUARD =
    'data-be-absurd-runtime';

  if (
    document.documentElement.hasAttribute(
      BE_ABSURD_GUARD
    )
  ) {
    return;
  }

  document.documentElement.setAttribute(
    BE_ABSURD_GUARD,
    '4.5.4'
  );

  var TAG =
    '[BE Absurd Units]';

  var laatsteSleutel =
    null;

  var sessieSeed =
    null;

  var domOrigineel = {};
  var chartOrigineel =
    null;

  var huidigeSet =
    null;

  /*
   * Bewaar de ECHTE Balans-bronwaarde per periode apart.
   * Daarna mag data-counter-value van het DOM-element weg,
   * zodat de ingebouwde Balans-counter onze absurdwaarde
   * niet steeds terug naar euro's probeert te schrijven.
   */
  var bronBedragen =
    {};

  /*
   * Externe grapbron.
   *
   * De bron is de bestaande Wikipedia-lijst "List of humorous units
   * of measurement". We bewaren een succesvolle lijst 24 uur lokaal.
   * Als Wikipedia/CORS/CSP niet beschikbaar is, blijft de ingebouwde
   * v4.4.7-verzameling gewoon als fallback werken.
   */
  var ABSURD_WIKI_API =
    'https://en.wikipedia.org/w/api.php?' +
    'action=parse&' +
    'page=List_of_humorous_units_of_measurement&' +
    'prop=text&' +
    'format=json&' +
    'formatversion=2&' +
    'origin=*';

  var ABSURD_CACHE_KEY =
    'be_absurd_wikipedia_units_v1';

  var ABSURD_HISTORY_KEY =
    'be_absurd_units_history_v1';

  var ABSURD_CACHE_MS =
    24 * 60 * 60 * 1000;

  var externeThemas = [];
  var absurdBronVersie = 0;
  var externeThemasBezig = false;

  var ABSURD_KORTE_UITLEG = [
    'Ongeveer exact.',
    'Meetbaar bij goed weer.',
    'Gekeurd door niemand.',
    'Bij benadering officieel.',
    'Met liefde verkeerd gemeten.',
    'IJking zoek, resultaat gevonden.',
    'Nauwkeurig genoeg voor koffie.',
    'Wetenschappelijk gezien: vooruit.',
    'Afgerond door een professional.',
    'Volgens de rekenkabouter klopt het.'
  ];

  function absurdKorteUitleg(set) {
    var sleutel =
      String(set.bronId || '') +
      '|' +
      String(set.eenheid || '') +
      '|' +
      formatWaarde(
        set.totaal,
        set.code
      );

    return ABSURD_KORTE_UITLEG[
      seedVan(sleutel) %
      ABSURD_KORTE_UITLEG.length
    ];
  }

  function getal(v) {
    var n =
      Number(v);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function nl(v, dec) {
    return Number(v)
      .toLocaleString(
        'nl-NL',
        {
          minimumFractionDigits:
            dec,
          maximumFractionDigits:
            dec
        }
      );
  }

  function leesBedrag(
    periode
  ) {
    var e =
      document.getElementById(
        'summary-trade-savings-total'
      );

    if (!e) {
      return null;
    }

    /*
     * Alleen data-counter-value vertrouwen als verse/native bron.
     * De hoofdsite zet die bij een nieuwe periode opnieuw.
     */
    var attr =
      e.getAttribute(
        'data-counter-value'
      );

    if (
      attr !== null &&
      attr !== ''
    ) {
      var n =
        parseFloat(
          String(attr)
            .replace(
              ',',
              '.'
            )
        );

      if (Number.isFinite(n)) {
        bronBedragen[
          periode
        ] =
          n;

        return n;
      }
    }

    /*
     * Zodra wij het element hebben overgenomen, staat er expres
     * geen data-counter-value meer. Dan gebruiken we uitsluitend
     * de eerder vastgelegde echte Balans-waarde voor deze periode.
     */
    if (
      Object.prototype
        .hasOwnProperty.call(
          bronBedragen,
          periode
        )
    ) {
      return bronBedragen[
        periode
      ];
    }

    /*
     * Alleen vóór onze eerste overname is textContent nog veilig.
     */
    if (!huidigeSet) {
      var tekst =
        String(
          e.textContent || ''
        )
          .replace(
            /\./g,
            ''
          )
          .replace(
            ',',
            '.'
          );

      var m =
        tekst.match(
          /-?\d+(?:\.\d+)?/
        );

      if (m) {
        var t =
          parseFloat(
            m[0]
          );

        if (Number.isFinite(t)) {
          bronBedragen[
            periode
          ] =
            t;

          return t;
        }
      }
    }

    return null;
  }

  function periodeTekst() {
    var e =
      document.querySelector(
        '.trade-savings-period-label'
      );

    return e
      ? e.textContent.trim()
      : '';
  }

  function jaarActief() {
    var knoppen =
      document.querySelectorAll(
        'button, a'
      );

    for (
      var i = 0;
      i < knoppen.length;
      i++
    ) {
      var b =
        knoppen[i];

      if (
        String(
          b.textContent || ''
        ).trim() !==
        'Jaar'
      ) {
        continue;
      }

      if (
        b.classList.contains(
          'active'
        ) ||
        b.getAttribute(
          'aria-selected'
        ) ===
          'true' ||
        b.getAttribute(
          'aria-pressed'
        ) ===
          'true'
      ) {
        return true;
      }
    }

    return false;
  }

  function allinAan() {
    var waarde =
      document.getElementById(
        'summary-stroom-voordeel'
      );

    var kaart =
      waarde
        ? waarde.closest(
            '.summary-compact-metric'
          )
        : null;

    var label =
      kaart
        ? kaart.querySelector(
            '.summary-compact-label'
          )
        : null;

    return !!(
      label &&
      /all-in/i.test(
        label.textContent || ''
      )
    );
  }

  function seedVan(tekst) {
    var h =
      2166136261;

    for (
      var i = 0;
      i < tekst.length;
      i++
    ) {
      h ^=
        tekst.charCodeAt(i);

      h =
        Math.imul(
          h,
          16777619
        );
    }

    return h >>> 0;
  }

  function rng(seed) {
    var x =
      seed || 123456789;

    return function () {
      x +=
        0x6D2B79F5;

      var t =
        x;

      t =
        Math.imul(
          t ^
          (
            t >>> 15
          ),
          t | 1
        );

      t ^=
        t +
        Math.imul(
          t ^
          (
            t >>> 7
          ),
          t | 61
        );

      return (
        (
          t ^
          (
            t >>> 14
          )
        ) >>> 0
      ) /
      4294967296;
    };
  }

  function kies(r, lijst) {
    return lijst[
      Math.floor(
        r() *
        lijst.length
      )
    ];
  }

  function haalSessieSeed() {
    if (
      sessieSeed !==
      null
    ) {
      return sessieSeed;
    }

    var a =
      new Uint32Array(
        1
      );

    crypto.getRandomValues(
      a
    );

    sessieSeed =
      a[0];

    return sessieSeed;
  }

  function schoonAbsurdTekst(s) {
    return String(
      s || ''
    )
      .replace(
        /\[[^\]]*\]/g,
        ''
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();
  }

  function kortAbsurdTekst(
    s,
    max
  ) {
    var t =
      schoonAbsurdTekst(
        s
      );

    if (
      t.length <= max
    ) {
      return t;
    }

    t =
      t.slice(
        0,
        max - 1
      );

    var sp =
      t.lastIndexOf(
        ' '
      );

    if (
      sp >
      max * 0.6
    ) {
      t =
        t.slice(
          0,
          sp
        );
    }

    return (
      t +
      '…'
    );
  }

  function absurdCode(
    naam
  ) {
    var woorden =
      String(
        naam || ''
      )
        .replace(
          /\([^)]*\)/g,
          ' '
        )
        .replace(
          /[^A-Za-z0-9]+/g,
          ' '
        )
        .trim()
        .split(
          /\s+/
        )
        .filter(Boolean);

    if (!woorden.length) {
      return '???';
    }

    if (
      woorden.length === 1
    ) {
      return woorden[0]
        .slice(
          0,
          3
        )
        .toUpperCase();
    }

    return woorden
      .slice(
        0,
        4
      )
      .map(
        function (w) {
          return w.charAt(0);
        }
      )
      .join('')
      .toUpperCase();
  }

  function absurdCategorie(
    heading
  ) {
    var n =
      heading;

    while (
      n
    ) {
      n =
        n.previousElementSibling;

      if (!n) {
        break;
      }

      if (
        n.tagName ===
        'H2'
      ) {
        var h =
          n.querySelector(
            '.mw-headline'
          );

        return schoonAbsurdTekst(
          h
            ? h.textContent
            : n.textContent
        );
      }
    }

    return (
      'onclassificeerbare metrologie'
    );
  }

  function parseWikipediaThemas(
    html
  ) {
    var doc =
      new DOMParser()
        .parseFromString(
          html,
          'text/html'
        );

    var uit = [];
    var gezien = {};

    doc.querySelectorAll(
      '.mw-parser-output h3, ' +
      '.mw-parser-output h4'
    )
      .forEach(
        function (heading) {
          var span =
            heading.querySelector(
              '.mw-headline'
            );

          var naam =
            schoonAbsurdTekst(
              span
                ? span.textContent
                : heading.textContent
            );

          if (
            !naam ||
            naam.length > 90
          ) {
            return;
          }

          var laag =
            naam.toLowerCase();

          if (
            gezien[laag] ||
            /^(see also|notes|references|bibliography|external links)$/i.test(
              naam
            )
          ) {
            return;
          }

          var n =
            heading.nextElementSibling;

          var beschrijving =
            '';

          while (n) {
            if (
              /^H[234]$/.test(
                n.tagName
              )
            ) {
              break;
            }

            if (
              n.tagName ===
              'P'
            ) {
              var p =
                schoonAbsurdTekst(
                  n.textContent
                );

              if (
                p.length >= 28
              ) {
                beschrijving =
                  p;

                break;
              }
            }

            n =
              n.nextElementSibling;
          }

          if (
            !beschrijving
          ) {
            return;
          }

          gezien[laag] =
            true;

          uit.push({
            id:
              'wiki:' +
              laag,

            naam:
              naam,

            categorie:
              absurdCategorie(
                heading
              ),

            beschrijving:
              kortAbsurdTekst(
                beschrijving,
                190
              )
          });
        }
      );

    return uit;
  }

  function leesAbsurdCache() {
    try {
      var c =
        JSON.parse(
          localStorage.getItem(
            ABSURD_CACHE_KEY
          ) ||
          'null'
        );

      if (
        !c ||
        !Array.isArray(
          c.items
        ) ||
        c.items.length < 5
      ) {
        return null;
      }

      return c;

    } catch (e) {
      return null;
    }
  }

  function schrijfAbsurdCache(
    items
  ) {
    try {
      localStorage.setItem(
        ABSURD_CACHE_KEY,
        JSON.stringify({
          tijd:
            Date.now(),

          items:
            items
        })
      );

    } catch (e) {}
  }

  function leesAbsurdHistorie() {
    try {
      var h =
        JSON.parse(
          localStorage.getItem(
            ABSURD_HISTORY_KEY
          ) ||
          '[]'
        );

      return Array.isArray(h)
        ? h
        : [];

    } catch (e) {
      return [];
    }
  }

  function onthoudAbsurdGebruik(
    id
  ) {
    if (!id) {
      return;
    }

    var h =
      leesAbsurdHistorie()
        .filter(
          function (x) {
            return (
              x !== id
            );
          }
        );

    h.unshift(
      id
    );

    h =
      h.slice(
        0,
        24
      );

    try {
      localStorage.setItem(
        ABSURD_HISTORY_KEY,
        JSON.stringify(
          h
        )
      );

    } catch (e) {}
  }

  function kiesAbsurdThema(
    r,
    lijst
  ) {
    var historie =
      leesAbsurdHistorie();

    var vers =
      lijst.filter(
        function (t) {
          return (
            historie.indexOf(
              t.id
            ) === -1
          );
        }
      );

    /*
     * Pas nadat de recente 24 vrijwel alles uitsluiten, mag de zak
     * opnieuw beginnen. Daardoor zie je veel minder snel dezelfde unit.
     */
    var bron =
      vers.length
        ? vers
        : lijst;

    return kies(
      r,
      bron
    );
  }

  function wikiItemNaarThema(
    item
  ) {
    var h =
      seedVan(
        item.id
      );

    var r =
      rng(
        h
      );

    var factor =
      0.35 +
      r() *
      18;

    var correcties1 = [
      'Historische conversiecorrectie',
      'Onnodige kalibratiemarge',
      'Referentie-afwijking',
      'Conventionele onzekerheid',
      'Metrologische zijstap',
      'Traditionele afrondingsmarge'
    ];

    var correcties2 = [
      'Wikipedia-meetmarge',
      'Documentatiecorrectie',
      'Bronvermeldingsopslag',
      'Ceremoniële restwaarde',
      'Niet-SI afrondingscorrectie',
      'Onverklaarde systeemtoeslag'
    ];

    return {
      id:
        item.id,

      eenheid:
        item.naam,

      code:
        absurdCode(
          item.naam
        ),

      factor:
        factor,

      kop:
        'Resultaat uitgedrukt in ' +
        item.naam,

      toelichting:
        item.beschrijving,

      vergelijking:
        'Bestaande humor-eenheid uit Wikipedia · ' +
        item.categorie,

      delen: [
        'Nominale ' +
        item.naam,

        kies(
          r,
          correcties1
        ),

        kies(
          r,
          correcties2
        )
      ]
    };
  }

  function haalExterneThemas() {
    if (
      externeThemasBezig
    ) {
      return;
    }

    var cache =
      leesAbsurdCache();

    if (
      cache &&
      cache.items.length
    ) {
      externeThemas =
        cache.items
          .map(
            wikiItemNaarThema
          );

      absurdBronVersie++;

      console.log(
        TAG,
        externeThemas.length,
        'Wikipedia-units uit lokale cache geladen.'
      );
    }

    if (
      cache &&
      Number.isFinite(
        cache.tijd
      ) &&
      Date.now() -
        cache.tijd <
        ABSURD_CACHE_MS
    ) {
      return;
    }

    externeThemasBezig =
      true;

    window.fetch(
      ABSURD_WIKI_API,
      {
        method:
          'GET',

        mode:
          'cors',

        credentials:
          'omit',

        cache:
          'no-store'
      }
    )
      .then(
        function (r) {
          if (!r.ok) {
            throw new Error(
              'HTTP ' +
              r.status
            );
          }

          return r.json();
        }
      )
      .then(
        function (j) {
          var html =
            j &&
            j.parse &&
            typeof j.parse.text ===
              'string'
              ? j.parse.text
              : '';

          var items =
            parseWikipediaThemas(
              html
            );

          if (
            items.length < 5
          ) {
            throw new Error(
              'te weinig bruikbare units (' +
              items.length +
              ')'
            );
          }

          schrijfAbsurdCache(
            items
          );

          externeThemas =
            items.map(
              wikiItemNaarThema
            );

          absurdBronVersie++;

          /*
           * Zelfde periode/bedrag moet na de eerste succesvolle externe
           * laadbeurt één keer opnieuw gekozen kunnen worden.
           */
          laatsteSleutel =
            null;

          console.log(
            TAG,
            externeThemas.length,
            'humor-units live uit Wikipedia geladen.'
          );
        }
      )
      .catch(
        function (e) {
          console.warn(
            TAG,
            'Wikipedia-bron niet beschikbaar; ingebouwde fallback blijft actief:',
            e.message
          );
        }
      )
      .then(
        function () {
          externeThemasBezig =
            false;
        }
      );
  }

  function lokaleAbsurdThemas() {
    return [
      {
        id:
          'local:BES',

        eenheid:
          'Bald Eagle-spans',

        code:
          'BES',

        factor:
          8.5,

        kop:
          'Resultaat uitgedrukt in gecertificeerde Bald Eagle-spans',

        toelichting:
          'SI-eenheden waren blijkbaar te eenvoudig',

        vergelijking:
          'Volgens het Freedom Measurement Bureau',

        delen: [
          'Nominale vleugelspanwijdte',
          'Federale verenopslag',
          'Patriottische afrondingscorrectie'
        ]
      },
      {
        id:
          'local:IAB',

        eenheid:
          'ISO-afgekeurde bananenlengtes',

        code:
          'IAB',

        factor:
          31,

        kop:
          'Resultaat uitgedrukt in ISO-afgekeurde bananenlengtes',

        toelichting:
          'gemeten bij twijfelachtige rijpheid en kamertemperatuur',

        vergelijking:
          'Conform norm ISO 0.0-NOPE',

        delen: [
          'Referentiebanaan',
          'Krommingscorrectie',
          'Rijpheidstoeslag'
        ]
      },
      {
        id:
          'local:PKP',

        eenheid:
          'parlementaire koffiepauzes',

        code:
          'PKP',

        factor:
          0.42,

        kop:
          'Resultaat uitgedrukt in parlementaire koffiepauzes',

        toelichting:
          'inclusief vergadertijd waarin aantoonbaar niets gebeurde',

        vergelijking:
          'Volgens de Commissie Tijdverlies & Caffeine',

        delen: [
          'Plenaire cafeïne',
          'Commissievertraging',
          'Administratief melkschuim'
        ]
      },
      {
        id:
          'local:FYD',

        eenheid:
          'vrijheidsyards',

        code:
          'FYD',

        factor:
          4.2,

        kop:
          'Resultaat omgerekend naar volstrekt noodzakelijke vrijheidsyards',

        toelichting:
          'want meters zouden ongepast efficiënt zijn',

        vergelijking:
          'Imperiaal, maar met extra zelfvertrouwen',

        delen: [
          'Basale yardage',
          'Strategische duimcorrectie',
          'Freedom overhead'
        ]
      },
      {
        id:
          'local:BPE',

        eenheid:
          'Brusselse paperclip-equivalenten',

        code:
          'BPE',

        factor:
          93,

        kop:
          'Resultaat in Brusselse paperclip-equivalenten',

        toelichting:
          'goedgekeurd na 14 formulieren en één onleesbare bijlage',

        vergelijking:
          'EU-verordening 404: maatstaf niet gevonden',

        delen: [
          'Directe paperclips',
          'Gedelegeerde paperclips',
          'Regelgevende nietjes'
        ]
      },
      {
        id:
          'local:VVD',

        eenheid:
          'voetbalveld-diagonalen',

        code:
          'VVD',

        factor:
          0.0037,

        kop:
          'Resultaat uitgedrukt in voetbalveld-diagonalen',

        toelichting:
          'de officiële media-eenheid voor alles wat groter is dan een koelkast',

        vergelijking:
          'Omdat vierkante meters kennelijk verboden zijn',

        delen: [
          'Reguliere diagonalen',
          'Blessuretijdcorrectie',
          'VAR-meetfout'
        ]
      },
      {
        id:
          'local:LTL',

        eenheid:
          'luchtvaartwaardige theelepels',

        code:
          'LTL',

        factor:
          57,

        kop:
          'Resultaat in luchtvaartwaardige theelepels',

        toelichting:
          'drukgecompenseerd en volledig ongeschikt voor koffie',

        vergelijking:
          'Aerospace-grade keukenmetrologie',

        delen: [
          'Nominale lepels',
          'Cabinedrukcorrectie',
          'Turbulentietoeslag'
        ]
      },
      {
        id:
          'local:NSM',

        eenheid:
          'notariële schoenmaten',

        code:
          'NSM',

        factor:
          1.8,

        kop:
          'Resultaat uitgedrukt in notarieel vastgelegde schoenmaten',

        toelichting:
          'juridisch bindend zolang niemand daadwerkelijk gaat meten',

        vergelijking:
          'Gewaarmerkt in drievoud',

        delen: [
          'Linkerschoenbasis',
          'Rechterschoencorrectie',
          'Aktekosten in natura'
        ]
      },
      {
        id:
          'local:KIBISH',

        eenheid:
          'imperiale kilobytes',

        code:
          'KiB-ish',

        factor:
          12.7,

        kop:
          'Resultaat geconverteerd naar imperiale kilobytes',

        toelichting:
          '1 kilobyte = 12 ounces data, behalve op donderdag',

        vergelijking:
          'Digitale meetkunde uit een parallel universum',

        delen: [
          'Hoofdgeheugen',
          'Pond-per-bitcorrectie',
          'Legacy overhead'
        ]
      },
      {
        id:
          'local:MWL',

        eenheid:
          'ministeriële worstlengtes',

        code:
          'MWL',

        factor:
          6.6,

        kop:
          'Resultaat in ministerieel afgeronde worstlengtes',

        toelichting:
          'de uiteinden zijn administratief buiten beschouwing gelaten',

        vergelijking:
          'Officieel nauwkeurig tot op drie sauzen',

        delen: [
          'Netto worst',
          'Mosterdcorrectie',
          'Bestuurlijke darmmarge'
        ]
      }
    ];
  }

  function maakThema(
    bedrag,
    periode
  ) {
    var r =
      rng(
        seedVan(
          periode +
          '|' +
          bedrag +
          '|' +
          haalSessieSeed() +
          '|' +
          absurdBronVersie
        )
      );

    var themas =
      externeThemas.length >= 5
        ? externeThemas
        : lokaleAbsurdThemas();

    var t =
      kiesAbsurdThema(
        r,
        themas
      );

    onthoudAbsurdGebruik(
      t.id
    );

    var factorVariatie =
      0.82 +
      r() *
      0.36;

    var totaal =
      bedrag *
      t.factor *
      factorVariatie;

    var p1 =
      0.55 +
      r() *
      0.16;

    var p2 =
      0.17 +
      r() *
      0.11;

    var p3 =
      1 -
      p1 -
      p2;

    var delen = [
      totaal * p1,
      totaal * p2,
      totaal * p3
    ];

    return {
      bronId:
        t.id,

      eenheid:
        t.eenheid,

      code:
        t.code,

      kop:
        t.kop,

      toelichting:
        t.toelichting,

      vergelijking:
        t.vergelijking,

      labels:
        t.delen,

      totaal:
        totaal,

      delen:
        delen
    };
  }

  function decimalen(v) {
    var a =
      Math.abs(v);

    if (a >= 1000) {
      return 0;
    }

    if (a >= 100) {
      return 1;
    }

    if (a >= 10) {
      return 2;
    }

    return 3;
  }

  function formatWaarde(
    v,
    code
  ) {
    var dec =
      decimalen(v);

    return (
      (
        v < 0
          ? '−'
          : ''
      ) +
      nl(
        Math.abs(v),
        dec
      ) +
      ' ' +
      code
    );
  }

  function onthoudDom(
    id
  ) {
    if (
      Object.prototype
        .hasOwnProperty.call(
          domOrigineel,
          id
        )
    ) {
      return;
    }

    var e =
      document.getElementById(
        id
      );

    if (e) {
      domOrigineel[id] = {
        html:
          e.innerHTML,

        className:
          e.className,

        style:
          e.getAttribute(
            'style'
          ),

        counter:
          e.getAttribute(
            'data-counter-value'
          )
      };
    }
  }

  function onthoudAlles() {
    [
      'summary-trade-savings-total',
      'summary-trade-savings-availability',
      'summary-trade-savings-comparison-copy',
      'summary-trade-savings-detail',
      'summary-trade-savings-legend'
    ].forEach(
      onthoudDom
    );
  }

  function herstelDom() {
    Object.keys(
      domOrigineel
    ).forEach(
      function (id) {
        var e =
          document.getElementById(
            id
          );

        var o =
          domOrigineel[id];

        if (!e) {
          return;
        }

        e.innerHTML =
          o.html;

        e.className =
          o.className;

        if (
          o.style === null
        ) {
          e.removeAttribute(
            'style'
          );

        } else {
          e.setAttribute(
            'style',
            o.style
          );
        }

        if (
          o.counter === null
        ) {
          e.removeAttribute(
            'data-counter-value'
          );

        } else {
          e.setAttribute(
            'data-counter-value',
            o.counter
          );
        }
      }
    );
  }

  function chart() {
    return (
      window.Chart &&
      Chart.getChart
    )
      ? Chart.getChart(
          'summary-trade-savings-chart'
        )
      : null;
  }

  function onthoudChart(c) {
    if (
      chartOrigineel ||
      !c
    ) {
      return;
    }

    chartOrigineel = {
      labels:
        Array.isArray(
          c.data.labels
        )
          ? c.data.labels.slice()
          : [],

      datasets:
        c.data.datasets.map(
          function (d) {
            return {
              label:
                d.label,

              data:
                Array.isArray(
                  d.data
                )
                  ? d.data.slice()
                  : [],

              hidden:
                !!d.hidden
            };
          }
        ),

      tickCallback:
        c.options &&
        c.options.scales &&
        c.options.scales.y &&
        c.options.scales.y.ticks
          ? c.options.scales.y.ticks.callback
          : undefined,

      tooltipCallbacks:
        c.options &&
        c.options.plugins &&
        c.options.plugins.tooltip
          ? c.options.plugins.tooltip.callbacks
          : undefined
    };
  }

  function herstelChart() {
    var c =
      chart();

    if (
      !c ||
      !chartOrigineel
    ) {
      return;
    }

    c.data.labels =
      chartOrigineel.labels.slice();

    chartOrigineel.datasets
      .forEach(
        function (o, i) {
          var d =
            c.data.datasets[i];

          if (!d) {
            return;
          }

          d.label =
            o.label;

          d.data =
            o.data.slice();

          d.hidden =
            o.hidden;
        }
      );

    if (
      c.options &&
      c.options.scales &&
      c.options.scales.y &&
      c.options.scales.y.ticks
    ) {
      c.options.scales.y.ticks.callback =
        chartOrigineel.tickCallback;
    }

    if (
      c.options &&
      c.options.plugins &&
      c.options.plugins.tooltip
    ) {
      c.options.plugins.tooltip.callbacks =
        chartOrigineel.tooltipCallbacks;
    }

    c.update(
      'none'
    );
  }

  function detailRij(
    label,
    waarde,
    index
  ) {
    var kleuren = [
      '#4d216d',
      '#7f3fad',
      '#c28bd3'
    ];

    return (
      '<div style="' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:space-between;' +
      'gap:10px;' +
      'min-width:0;' +
      '">' +

        '<div style="' +
        'display:flex;' +
        'align-items:center;' +
        'gap:7px;' +
        'min-width:0;' +
        'font-size:14px;' +
        'color:#2b2733;' +
        '">' +

          '<span style="' +
          'width:11px;' +
          'height:11px;' +
          'border-radius:2px;' +
          'flex:0 0 auto;' +
          'background:' +
          kleuren[index] +
          ';">' +
          '</span>' +

          '<span>' +
          label +
          '</span>' +

        '</div>' +

        '<div style="' +
        'font-size:14px;' +
        'font-weight:700;' +
        'white-space:nowrap;' +
        'color:#6B3FA0;' +
        'font-variant-numeric:tabular-nums;' +
        '">' +
        waarde +
        '</div>' +

      '</div>'
    );
  }

  function absurdOnderregel(bron) {
    var h = 2166136261;
    var s = String(bron || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    var x = (h >>> 0) + 0x6D2B79F5;
    var t = Math.imul(x ^ x >>> 15, x | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    var r = ((t ^ t >>> 14) >>> 0) / 4294967296;
    var regels = [
      "ISO-afgekeurd wegens buitensporige meetbaarheid",
      "RDW-geijkt met een bitterbal als referentie",
      "EU-conform zolang niemand het narekent",
      "Notarieel gewaarmerkt bij normale koffiedruk",
      "NEN-LOL 404 · meten is weten-ish",
      "Goedgekeurd door het Ministerie van Ongeveer",
      "Gekalibreerd met de officiële HEMA-worst",
      "NATO-getest op drie geiten en een bureaustoel",
      "Wettig meetbaar op oneven dinsdagen",
      "CE-gemarkeerd door iemand met een printer",
      "Administratief exact tot op een frikandel",
      "Geijkt bij volle maan en 2 bar koffiedruk",
      "Volgens Brussel voldoende ongeveer",
      "Wetenschappelijk plausibel na twee borrels",
      "Officieel afgerond tot de dichtstbijzijnde banaan",
      "Gecertificeerd door het Bureau Nattevingerwerk",
      "DIN-conform mits horizontaal gefrituurd",
      "Kalibratie geldig zolang de stagiair meekijkt",
      "Goedgekeurd met 95% bestuurlijk vertrouwen",
      "SI-onverenigbaar maar bestuurlijk wenselijk",
      "Gemeten met een liniaal uit de Action",
      "Herleidbaar tot één officieel erkende tuinkabouter",
      "Conform protocol: niet schudden vóór gebruik",
      "Statistisch verantwoord volgens ome Henk",
      "Geijkt tegen de nationale reservebitterbal",
      "Formeel exact binnen een foutmarge van ±ja",
      "NEN-gecertificeerd na drie bezwaarschriften",
      "Internationaal erkend door niemand in het bijzonder",
      "Metrologisch verdacht maar gezellig afgerond",
      "Goedgekeurd door de Commissie Onnodige Precisie"
];
    return regels[Math.floor(r * regels.length)];
  }

  function pasDomAan(set) {
    onthoudAlles();

    var totaal =
      document.getElementById(
        'summary-trade-savings-total'
      );

    var beschikbaar =
      document.getElementById(
        'summary-trade-savings-availability'
      );

    var vergelijking =
      document.getElementById(
        'summary-trade-savings-comparison-copy'
      );

    var detail =
      document.getElementById(
        'summary-trade-savings-detail'
      );

    if (totaal) {
      var totaalTekst =
        formatWaarde(
          set.totaal,
          set.code
        );

      if (
        totaal.textContent !==
        totaalTekst
      ) {
        totaal.textContent =
          totaalTekst;
      }

      /*
       * Belangrijk: de echte waarde staat al in bronBedragen.
       * Dit attribuut moet daarna weg, anders blijft Balans'
       * eigen counter de tekst opnieuw naar euro's zetten.
       */
      totaal.removeAttribute(
        'data-counter-value'
      );
    }

    if (beschikbaar) {
      var uitlegTekst =
        absurdKorteUitleg(
          set
        );

      if (
        beschikbaar.textContent !==
        uitlegTekst
      ) {
        beschikbaar.textContent =
          uitlegTekst;
      }
    }

    if (vergelijking) {
      var bron = String(set.vergelijking || '');
      var vergelijkingTekst =
        bron.indexOf('Bestaande humor-eenheid uit Wikipedia') === 0
          ? absurdOnderregel(
              bron +
              '|' +
              (
                totaal
                  ? totaal.textContent
                  : undefined
              )
            )
          : bron;

      if (bron.indexOf('Bestaande humor-eenheid uit Wikipedia') === 0) {
        vergelijking.style.whiteSpace = 'nowrap';
      }

      if (
        vergelijking.textContent !==
        vergelijkingTekst
      ) {
        vergelijking.textContent =
          vergelijkingTekst;
      }
    }

    if (detail) {
      detail.style.display =
        'grid';

      detail.style.gridTemplateColumns =
        '1fr';

      detail.style.gap =
        '10px';

      var detailHtml =
        detailRij(
          set.labels[0],
          formatWaarde(
            set.delen[0],
            set.code
          ),
          0
        ) +
        detailRij(
          set.labels[1],
          formatWaarde(
            set.delen[1],
            set.code
          ),
          1
        ) +
        detailRij(
          set.labels[2],
          formatWaarde(
            set.delen[2],
            set.code
          ),
          2
        );

      if (
        detail.innerHTML !==
        detailHtml
      ) {
        detail.innerHTML =
          detailHtml;
      }
    }
  }

  function pasLegendaAan(set) {
    var leg =
      document.getElementById(
        'summary-trade-savings-legend'
      );

    if (!leg) {
      return;
    }

    onthoudDom(
      'summary-trade-savings-legend'
    );

    var items =
      leg.querySelectorAll(
        '.trade-savings-legend-item'
      );

    items.forEach(
      function (item, i) {
        if (i < 3) {
          item.classList.remove(
            'd-none'
          );

          var tekst =
            item.querySelector(
              '.trade-savings-legend-label'
            ) ||
            item.querySelector(
              'span:last-child'
            );

          if (tekst) {
            tekst.textContent =
              set.labels[i];
          }

        } else {
          item.classList.add(
            'd-none'
          );
        }
      }
    );
  }

  function pasChartAan(set) {
    /*
     * Jaar is bewust uitgezonderd.
     *
     * Links mag de onzin blijven staan, maar de Balans-jaargrafiek
     * bevat echte maand-op-maand informatie en blijft daarom exact
     * zoals Balans hem zelf rendert.
     */
    if (jaarActief()) {
      return;
    }

    var c =
      chart();

    if (!c) {
      return;
    }

    onthoudChart(
      c
    );

    if (
      !c.data.datasets ||
      c.data.datasets.length <
        3
    ) {
      return;
    }

    c.data.labels = [
      set.eenheid
    ];

    for (
      var i = 0;
      i < c.data.datasets.length;
      i++
    ) {
      var d =
        c.data.datasets[i];

      if (i < 3) {
        d.label =
          set.labels[i];

        d.data = [
          set.delen[i]
        ];

        d.hidden =
          false;

      } else {
        d.data = [
          0
        ];

        d.hidden =
          true;
      }
    }

    if (
      c.options &&
      c.options.scales &&
      c.options.scales.y &&
      c.options.scales.y.ticks
    ) {
      c.options.scales.y.ticks.callback =
        function (value) {
          return (
            nl(
              value,
              Math.abs(value) < 10
                ? 1
                : 0
            ) +
            ' ' +
            set.code
          );
        };
    }

    if (
      c.options &&
      c.options.plugins &&
      c.options.plugins.tooltip
    ) {
      c.options.plugins.tooltip.callbacks = {
        label:
          function (ctx) {
            var v =
              getal(
                ctx.raw
              );

            return (
              ctx.dataset.label +
              ': ' +
              formatWaarde(
                v,
                set.code
              )
            );
          }
      };
    }

    c.update(
      'none'
    );

    pasLegendaAan(
      set
    );
  }

  function absurdDomKlopt(set) {
    var totaal =
      document.getElementById(
        'summary-trade-savings-total'
      );

    var beschikbaar =
      document.getElementById(
        'summary-trade-savings-availability'
      );

    var vergelijking =
      document.getElementById(
        'summary-trade-savings-comparison-copy'
      );

    if (
      !totaal ||
      !set
    ) {
      return false;
    }

    var bron =
      String(
        set.vergelijking || ''
      );

    var vergelijkingTekst =
      bron.indexOf(
        'Bestaande humor-eenheid uit Wikipedia'
      ) === 0
        ? absurdOnderregel(
            bron +
            '|' +
            formatWaarde(
              set.totaal,
              set.code
            )
          )
        : bron;

    return (
      String(
        totaal.textContent || ''
      ).trim() ===
      formatWaarde(
        set.totaal,
        set.code
      ) &&
      !!beschikbaar &&
      String(
        beschikbaar.textContent || ''
      ).trim() ===
      absurdKorteUitleg(
        set
      ) &&
      !!vergelijking &&
      String(
        vergelijking.textContent || ''
      ).trim() ===
      vergelijkingTekst
    );
  }

  function absurdChartKlopt(set) {
    var c =
      chart();

    if (
      !c ||
      !set ||
      !c.data ||
      !Array.isArray(c.data.labels) ||
      c.data.labels.length !== 1 ||
      c.data.labels[0] !== set.eenheid ||
      !Array.isArray(c.data.datasets) ||
      c.data.datasets.length < 3
    ) {
      return false;
    }

    for (
      var i = 0;
      i < 3;
      i++
    ) {
      var d =
        c.data.datasets[i];

      if (
        !d ||
        d.label !== set.labels[i] ||
        !Array.isArray(d.data) ||
        d.data.length !== 1 ||
        d.data[0] !== set.delen[i] ||
        d.hidden === true
      ) {
        return false;
      }
    }

    return true;
  }

  function herstelAlles() {
    herstelDom();
    herstelChart();

    huidigeSet =
      null;
  }

  function werkBij() {
    var periode =
      periodeTekst();

    var bedrag =
      leesBedrag(
        periode
      );

    var aan =
      allinAan();

    if (
      bedrag === null ||
      !periode
    ) {
      return;
    }

    var sleutel =
      String(aan) +
      '|' +
      periode +
      '|' +
      bedrag +
      '|' +
      absurdBronVersie;

    if (
      sleutel ===
      laatsteSleutel
    ) {
      /*
       * Balans heeft op het grote resultaatbedrag een eigen counter/
       * animatie. Die kan NA onze eerste wijziging alsnog één keer de
       * originele eurowaarde terugschrijven.
       *
       * De sleutel verandert dan niet, dus vroeger deden we hier niets
       * meer met de DOM. Controleer daarom bij dezelfde sleutel of onze
       * absurdwaarde nog werkelijk zichtbaar is en herstel hem alleen
       * wanneer Balans hem heeft overschreven.
       */
      if (
        aan &&
        huidigeSet &&
        !absurdDomKlopt(
          huidigeSet
        )
      ) {
        pasDomAan(
          huidigeSet
        );
      }

      /*
       * Chart.js kan later klaar zijn dan de DOM.
       * Werk de grafiek alleen bij wanneer Balans hem echt heeft
       * vervangen. Een onvoorwaardelijke update liet het vlak knipperen.
       */
      if (
        aan &&
        huidigeSet &&
        !jaarActief() &&
        chart() &&
        !absurdChartKlopt(
          huidigeSet
        )
      ) {
        pasChartAan(
          huidigeSet
        );
      }

      return;
    }

    laatsteSleutel =
      sleutel;

    if (!aan) {
      herstelAlles();

      console.log(
        TAG,
        'All-in uit — originele Balans-weergave actief.'
      );

      return;
    }

    huidigeSet =
      maakThema(
        bedrag,
        periode
      );

    pasDomAan(
      huidigeSet
    );

    if (!jaarActief()) {
      pasChartAan(
        huidigeSet
      );
    }

    console.log(
      TAG,
      huidigeSet
    );
  }

  /*
   * Eerst eventueel de lokale Wikipedia-cache gebruiken en daarna,
   * alleen wanneer nodig, de publieke MediaWiki-bron verversen.
   */
  haalExterneThemas();

  setInterval(
    werkBij,
    700
  );

  werkBij();
})();


/* Rustâââgh: stabiele live cijfers op Actueel. */
(function () {
  'use strict';

  if (window.top !== window.self) return;

  var RUSTAAGH_RUNTIME_GUARD = 'data-be-rustaagh-runtime';
  if (document.documentElement.getAttribute(RUSTAAGH_RUNTIME_GUARD) === '4.5.4') return;
  document.documentElement.setAttribute(RUSTAAGH_RUNTIME_GUARD, '4.5.4');

  var STYLE_ID = 'be-stabiele-cijfers-stijl';
  var MARKER = 'be-stabiel-getal';
  var TOGGLE_ID = 'be-stabiele-cijfers-toggle';
  var OPSLAG = 'be_stabiele_cijfers_aan_v2';
  var scanGepland = false;
  var ingeschakeld = localStorage.getItem(OPSLAG) !== '0';

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
      '.' + MARKER + '[data-be-uitlijning="links"]{text-align:left!important;}' +
      '.be-stabiele-cijfers-kop{position:relative!important;}' +
      '#' + TOGGLE_ID + '{' +
        'appearance:none;-webkit-appearance:none;' +
        'display:flex;align-items:center;gap:8px;' +
        'width:auto;height:auto;cursor:pointer;' +
        'border:0;background:transparent;' +
        'position:absolute;right:24px;top:50%;z-index:2;' +
        'transform:translateY(-50%);' +
        'padding:3px 2px;flex:0 0 auto;' +
        'white-space:nowrap;color:#342f3a;' +
        'font-family:inherit;font-size:12px;font-weight:500;line-height:1.2;' +
        'box-shadow:none;' +
      '}' +
      '#' + TOGGLE_ID + ' [data-be-stabiel-track]{' +
        'position:relative;display:inline-block;' +
        'width:34px;height:18px;border-radius:999px;flex-shrink:0;' +
        'transition:background .18s ease;' +
      '}' +
      '#' + TOGGLE_ID + ' [data-be-stabiel-thumb]{' +
        'position:absolute;left:2px;top:2px;' +
        'width:14px;height:14px;border-radius:50%;background:#fff;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.35);' +
        'transition:transform .18s ease;' +
      '}' +
      '#' + TOGGLE_ID + ' [data-be-stabiel-status]{' +
        'min-width:24px;font-size:10px;font-weight:700;line-height:1;' +
      '}' +
      '@media(max-width:700px) and (orientation:portrait){' +
        '#' + TOGGLE_ID + '{right:12px!important;gap:6px!important;font-size:11px!important;}' +
      '}';

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

  function vindPaneel(titel) {
    var bestaandeKop = titel === 'Live Status'
      ? document.querySelector('.be-stabiele-cijfers-kop')
      : null;

    if (bestaandeKop) {
      var bestaandPaneel = bestaandeKop;
      while (bestaandPaneel.parentElement) {
        bestaandPaneel = bestaandPaneel.parentElement;
        var bestaandRect = bestaandPaneel.getBoundingClientRect();
        if (bestaandRect.width > 280 && bestaandRect.height > 220 && bestaandRect.height < 1000) {
          return bestaandPaneel;
        }
      }
    }

    var alles = document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span');

    for (var i = 0; i < alles.length; i++) {
      if (tekst(alles[i]) !== titel) continue;

      var paneel = alles[i];
      while (paneel.parentElement) {
        paneel = paneel.parentElement;
        var r = paneel.getBoundingClientRect();

        /* Pak de eerste volledige kaart, niet alleen de titelbalk. */
        if (r.width > 280 && r.height > 220 && r.height < 1000) return paneel;
      }
    }

    return null;
  }

  function vindKopbalk(titel) {
    var bestaandeKop = document.querySelector('.be-stabiele-cijfers-kop');
    if (bestaandeKop) return bestaandeKop;

    var alles = document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span');

    for (var i = 0; i < alles.length; i++) {
      if (tekst(alles[i]) !== titel) continue;

      var kop = alles[i];
      while (kop.parentElement) {
        kop = kop.parentElement;
        var r = kop.getBoundingClientRect();

        if (r.width > 280 && r.height >= 40 && r.height <= 140) return kop;
        if (r.height > 140) break;
      }
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

  function verwijderMarkeringen() {
    var gemarkeerd = document.querySelectorAll('.' + MARKER);

    for (var i = 0; i < gemarkeerd.length; i++) {
      gemarkeerd[i].classList.remove(MARKER);
      gemarkeerd[i].removeAttribute('data-be-eenheid');
      gemarkeerd[i].removeAttribute('data-be-uitlijning');
    }
  }

  function tekenSchakelaar(knop) {
    if (!knop) return;

    var track = knop.querySelector('[data-be-stabiel-track]');
    var duim = knop.querySelector('[data-be-stabiel-thumb]');
    var status = knop.querySelector('[data-be-stabiel-status]');

    knop.setAttribute('aria-pressed', ingeschakeld ? 'true' : 'false');
    knop.title = ingeschakeld
      ? 'Vaste cijferbreedtes uitschakelen'
      : 'Vaste cijferbreedtes inschakelen';
    track.style.background = ingeschakeld ? '#7040a3' : '#aab4c2';
    duim.style.transform = ingeschakeld ? 'translateX(16px)' : 'translateX(0)';
    var statusTekst = ingeschakeld ? 'AAN' : 'UIT';
    if (status.textContent !== statusTekst) status.textContent = statusTekst;
  }

  function voegSchakelaarToe() {
    var kop = vindKopbalk('Live Status');
    if (!kop) return;

    kop.classList.add('be-stabiele-cijfers-kop');

    var knop = document.getElementById(TOGGLE_ID);

    if (!knop) {
      knop = document.createElement('button');
      knop.id = TOGGLE_ID;
      knop.type = 'button';
      knop.innerHTML =
        '<span>Rustâââgh</span>' +
        '<span data-be-stabiel-track>' +
          '<span data-be-stabiel-thumb></span>' +
        '</span>' +
        '<span data-be-stabiel-status></span>';

      knop.addEventListener('click', function () {
        ingeschakeld = !ingeschakeld;
        localStorage.setItem(OPSLAG, ingeschakeld ? '1' : '0');
        tekenSchakelaar(knop);

        if (ingeschakeld) {
          planScan();
        } else {
          verwijderMarkeringen();
        }
      });
    }

    if (knop.parentElement !== kop) {
      kop.appendChild(knop);
    }

    tekenSchakelaar(knop);
  }

  function markeerActueleCijfers() {
    scanGepland = false;
    voegStijlToe();
    voegSchakelaarToe();

    if (!ingeschakeld) {
      verwijderMarkeringen();
      return;
    }

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

