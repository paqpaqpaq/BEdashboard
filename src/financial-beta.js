  /* Financieel v6.4.2. Eigen scherm; geen herschrijving van Balans-kaarten.
   * De API-bedragen zijn volgens dezelfde prijsmetadata genormaliseerd als v5.
   * Saldering/EB zijn expliciete ramingen per contractjaar, geen maandafrekening.
   */
  var beOvDefault = {
    vat: true, tax: true, salderen: true, eligible: 100, schema: 2,
    paymentMode: 'schema', payments: {}, taxAllocation: 'tijd', eligibleConfirmed: false,
    supplier: LEV_DAG, network: TRA_DAG,
    rates: {'2025': 0.10154, '2026': 0.09161},
    credit: {'2025': 524.95, '2026': 519.80}
  };
  var beOvSettings = (function () {
    try {
      var s = JSON.parse(localStorage.getItem('be_overzicht_settings_v1') || '{}');
      // be_cfg_saldering uit v5 bepaalde alleen de zichtbaarheid van de kaart.
      // De eerste testversie las dat ten onrechte als uitschakeling van EB-verrekening.
      return Object.assign({}, beOvDefault, s, {
        schema: 2, salderen: s.schema === 2 ? s.salderen !== false : true,
        rates: Object.assign({}, beOvDefault.rates, s.rates || {}),
        credit: Object.assign({}, beOvDefault.credit, s.credit || {})
      });
    } catch (_) { return Object.assign({}, beOvDefault); }
  })();
  function beOvDate(key) { return new Date(key + 'T12:00:00Z'); }
  function beOvISO(d) { return d.toISOString().slice(0, 10); }
  function beOvAdd(key, n) { var d = beOvDate(key); d.setUTCDate(d.getUTCDate() + n); return beOvISO(d); }
  function beOvDays(a, b) { return Math.max(0, Math.round((beOvDate(b) - beOvDate(a)) / 86400000) + 1); }
  function beOvAnniversary(start, n) {
    var d = beOvDate(start), y = d.getUTCFullYear() + n, m = d.getUTCMonth();
    return beOvISO(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate()), 12)));
  }
  function beOvContract(key) {
    var start = iso(cfg.start), n = Math.max(0, +key.slice(0, 4) - +start.slice(0, 4));
    if (n && beOvAnniversary(start, n) > key) n--;
    var begin = beOvAnniversary(start, n), end = beOvAdd(beOvAnniversary(start, n + 1), -1);
    return {begin: begin, end: end, index: n};
  }
  function beOvMonths(a, b) {
    if (a > b) return [];
    var out = [], d = beOvDate(a.slice(0, 7) + '-01');
    while (beOvISO(d).slice(0, 7) <= b.slice(0, 7) && out.length < 61) {
      out.push(beOvISO(d).slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }
  function beOvFinite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function beOvNormalize(j, month) {
    if (!j || !Array.isArray(j.series) || !j.pricing) throw Error('Onbekend antwoordformaat voor ' + month + '.');
    var flags = j.pricing;
    ['include_vat', 'include_delivery_cost'].forEach(function (k) {
      if (![true, false, 0, 1, '0', '1'].includes(flags[k])) throw Error('Prijsbasis ontbreekt: ' + k + ' (' + month + ').');
    });
    var vat = flags.include_vat === true || flags.include_vat === 1 || flags.include_vat === '1';
    var fee = flags.include_delivery_cost === true || flags.include_delivery_cost === 1 || flags.include_delivery_cost === '1';
    var seen = new Set();
    return j.series.map(function (s) {
      var key = s.date || s.day;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '') || key.slice(0, 7) !== month || beOvISO(beOvDate(key)) !== key)
        throw Error('Onverwachte dagdatum in ' + month + '.');
      if (seen.has(key)) throw Error('Dubbele dagdatum: ' + key + '.');
      seen.add(key);
      if (!['import_kwh', 'export_kwh', 'total_buy_eur', 'total_sell_eur'].every(function (k) { return beOvFinite(s[k]); }) || s.import_kwh < 0 || s.export_kwh < 0)
        return null; // Een ontbrekend bronbedrag is nooit een nulbedrag.
      var r = naarIncl(s, {include_vat: vat, include_delivery_cost: fee});
      r.key = key; r.voorlopig = /provisional|preliminary|pending|voorlopig/i.test(String(s.status || ''));
      return r;
    }).filter(Boolean);
  }
  function beOvSum(rows, key) { return rows.reduce(function (n, r) { return n + (beOvFinite(r[key]) ? r[key] : 0); }, 0); }

  // De eigen cache is een gedateerd deelresultaat, ook na een herlaadactie.
  // Definitieve Balansdagen winnen; dezelfde dag wordt nooit tweemaal opgeteld.
  function beOvMergeRows(source, stored, id, from, to, now) {
    var today=iso(new Date(now)), map=new Map();
    source.forEach(function(r){if(r.key>=from&&r.key<=to&&r.key<=today)map.set(r.key,Object.assign({},r));});
    Object.keys(stored).forEach(function(key){
      var p=stored[key],g=voorlopigeDagGrenzen(key);
      if(map.has(key)||key<from||key>to||key>today||!g||!p||p.key!==key||p.klant!==id||p.archiefVersie!==1||p.voorlopig!==true)return;
      if(!['imp','exp','inkoop','verkoop','gemetenVanaf','gemetenTot','gedektMs','bijgewerkt'].every(function(k){return beOvFinite(p[k]);})||p.imp<0||p.exp<0)return;
      if(p.gemetenVanaf!==g.start||p.gemetenTot<=g.start||p.gemetenTot>g.eind||p.gemetenTot>now||p.bijgewerkt>now||p.gedektMs<=0||p.gedektMs>p.gemetenTot-g.start)return;
      var r=Object.assign({},p,{eigenCache:true});
      if(p.prijsOnvolledig){
        if(!['geprijsdeImportKwh','geprijsdeExportKwh'].every(function(k){return beOvFinite(p[k])&&p[k]>=0;}))return;
        if(p.geprijsdeImportKwh>p.imp+1e-6||p.geprijsdeExportKwh>p.exp+1e-6)return;
        r.gemetenImportKwh=p.imp;r.gemetenExportKwh=p.exp;
        r.imp=p.geprijsdeImportKwh;r.exp=p.geprijsdeExportKwh;
      }
      r.deelresultaat=!!p.prijsOnvolledig||p.gedektMs<(g.eind-g.start)*.995;
      map.set(key,r);
    });
    return Array.from(map.values()).sort(function(a,b){return a.key.localeCompare(b.key);});
  }

  function beOvForecast(all, range, settings, today) {
    var complete=all.filter(function(d){return d.key<today&&!d.voorlopig&&!d.deelresultaat;}),
        base=complete.filter(function(d){return d.key>=beOvAdd(today,-28);});
    if(range.b<today)return {rows:null,reason:'afgelopen',base:base.length};
    if(base.length<7)return {rows:null,reason:'weinig',base:base.length};
    // Dezelfde maandfactoren als de kWh-prognose in 5.0. Reken kWh en
    // bronbedragen apart, zodat de prognose controleerbaar blijft met huidige EB.
    var factors={imp:[1,.62,.25,.09,.02,.01,.02,.03,.10,.32,.57,.87],exp:[.10,.18,.45,1,1.30,1.32,1.18,.96,.74,.28,.12,.08]};
    var plans={},scenario=all.filter(function(d){return d.key<today;}),usedHistory=false;
    beOvMonths(today,range.b).forEach(function(month){
      var prior=String(+month.slice(0,4)-1)+month.slice(4),old=complete.filter(function(d){return d.key.slice(0,7)===prior;}),plan={};
      ['imp','exp'].forEach(function(k){
        var factor=factors[k],target=factor[+month.slice(5,7)-1];
        var normalized=base.reduce(function(sum,d){return sum+d[k]/factor[+d.key.slice(5,7)-1];},0)/base.length;
        plan[k]=normalized*target;
        var priceKey=k==='imp'?'inkoop':'verkoop',volume=beOvSum(base,k);
        plan[priceKey]=volume>0?plan[k]*beOvSum(base,priceKey)/volume:0;
        // Vorig jaar weegt 60%, de recente seizoensraming 40%, zoals de
        // combinatie in 5.0. Alleen een volledige bronmaand mag meetellen.
        var next=beOvDate(prior+'-01');next.setUTCMonth(next.getUTCMonth()+1);
        if(old.length===beOvDays(prior+'-01',beOvAdd(beOvISO(next),-1))){
          plan[k]=.6*beOvSum(old,k)/old.length+.4*plan[k];
          plan[priceKey]=.6*beOvSum(old,priceKey)/old.length+.4*plan[priceKey];usedHistory=true;
        }
      });plans[month]=plan;
    });
    for(var key=today;key<=range.b;key=beOvAdd(key,1))scenario.push(Object.assign({key:key,forecast:true},plans[key.slice(0,7)]));
    return {rows:beOvCalculate(scenario,settings),reason:'',base:base.length,history:usedHistory};
  }

  // Het contract bepaalt de salderingsgrens. De EB-last staat op de afnamedag;
  // de EB-teruggaaf op de terugleverdag. Zo blijft het seizoenseffect per maand
  // zichtbaar. Voor de teruggaaf wordt het naar afname gewogen EB-tarief gebruikt.
  // De jaargrens gebruikt de gekozen, expliciet benoemde tariefverdelingsraming.
  function beOvCalculate(rows, settings) {
    var out = rows.map(function (r) { return Object.assign({}, r); }), groups = {};
    out.forEach(function (r) {
      var contract = beOvContract(r.key), group = contract.begin;
      (groups[group] || (groups[group] = [])).push(r);
      r.contract = group;
    });
    Object.keys(groups).forEach(function (key) {
      var pre = groups[key].filter(function (r) { return r.key < '2027-01-01'; });
      var imp = beOvSum(pre, 'imp'), eligibleBase = beOvSum(pre, 'exp') * settings.eligible / 100;
      // De bron splitst de herkomst niet uit. Zonder contractbevestiging wordt
      // niet automatisch meer dan de 5.000 kWh-grens voor niet-duurzame invoeding gebruikt.
      var eligible=settings.eligibleConfirmed?eligibleBase:Math.min(5000,eligibleBase);
      var creditKwh = settings.salderen ? Math.min(imp, eligible) : 0;
      var grossTax = 0, unknownRate = false;
      pre.forEach(function(r){var rate=settings.rates[r.key.slice(0,4)];if(r.imp>0&&!(beOvFinite(rate)&&rate>=0))unknownRate=true;else if(r.imp>0)grossTax+=r.imp*rate;});
      var refundEx = !creditKwh ? 0 : unknownRate ? null : grossTax * creditKwh / imp;
      if(creditKwh>0&&settings.taxAllocation!=='afname'&&!unknownRate){
        var through=pre.reduce(function(last,r){return r.key>last?r.key:last;},key),sumRates=0,countDays=0;
        for(var dateKey=key;dateKey<=through;dateKey=beOvAdd(dateKey,1)){
          var dayRate=settings.rates[dateKey.slice(0,4)];
          if(!beOvFinite(dayRate)||dayRate<0){unknownRate=true;break;}
          sumRates+=dayRate;countDays++;
        }
        refundEx=unknownRate?null:grossTax-(imp-creditKwh)*(countDays?sumRates/countDays:0);
      }
      var higherContract=imp-creditKwh+beOvSum(groups[key].filter(function(r){return r.key>='2027-01-01';}),'imp')>10000+1e-8;
      groups[key].forEach(function (r) {
        var eligibleRow=r.key<'2027-01-01'?r.exp*settings.eligible/100:0;
        var fraction=eligibleBase>0?eligibleRow/eligibleBase:0;
        r.saldKwh=creditKwh*fraction;
        r.taxable=r.imp-(imp>0&&r.key<'2027-01-01'?r.imp*creditKwh/imp:0);
        var rate = settings.rates[r.key.slice(0, 4)];
        r.ebGrossEx=r.imp<1e-9?0:beOvFinite(rate)&&rate>=0?r.imp*rate:null;
        r.ebCreditEx=!fraction?0:refundEx===null?null:refundEx*fraction;
        r.ebEx=r.ebGrossEx===null||r.ebCreditEx===null?null:r.ebGrossEx-r.ebCreditEx;
        if(higherContract)r.ebEx=null;
        r.buyEx = r.inkoop / BTW; r.sellEx = r.verkoop / BTW;
        r.buyShown = settings.vat ? r.inkoop : r.buyEx;
        r.sellShown = settings.vat ? r.verkoop : r.sellEx;
        r.ebShown = !settings.tax ? 0 : r.ebEx === null ? null : r.ebEx * (settings.vat ? BTW : 1);
        r.ebGrossShown=!settings.tax?0:r.ebGrossEx===null?null:r.ebGrossEx*(settings.vat?BTW:1);
        r.ebCreditShown=!settings.tax?0:r.ebCreditEx===null?null:r.ebCreditEx*(settings.vat?BTW:1);
        r.trade = r.sellShown - r.buyShown;
        r.result = r.ebShown === null ? null : r.trade - r.ebShown;
      });
    });
    return out.sort(function (a, b) { return a.key.localeCompare(b.key); });
  }
  function beOvTotal(rows) {
    var total = {};
    ['imp', 'exp', 'inkoop', 'verkoop', 'buyEx', 'sellEx', 'buyShown', 'sellShown', 'trade', 'taxable', 'saldKwh', 'pv', 'laden', 'ontladen'].forEach(function (k) { total[k] = beOvSum(rows, k); });
    total.ebShown = rows.some(function (r) { return r.ebShown === null; }) ? null : beOvSum(rows, 'ebShown');
    total.ebGrossShown=rows.some(function(r){return r.ebGrossShown===null;})?null:beOvSum(rows,'ebGrossShown');
    total.ebCreditShown=rows.some(function(r){return r.ebCreditShown===null;})?null:beOvSum(rows,'ebCreditShown');
    total.result = total.ebShown === null ? null : total.trade - total.ebShown;
    total.vatTrade = (total.verkoop - total.inkoop) - (total.sellEx - total.buyEx);
    return total;
  }
  function beOvFixed(a, b, settings) {
    var n = beOvDays(a, b), credit = 0, unknown = false;
    for (var k = a; k <= b; k = beOvAdd(k, 1)) {
      var y = k.slice(0, 4), amount = settings.credit[y];
      var yearDays = beOvDays(y + '-01-01', y + '-12-31');
      if (!beOvFinite(amount)) unknown = true;
      else credit += amount / yearDays * (settings.vat ? BTW : 1);
    }
    var factor = settings.vat ? 1 : 1 / BTW;
    return {days: n, supplier: n * settings.supplier * factor, network: n * settings.network * factor,
      credit: unknown ? null : credit, net: unknown ? null : credit - n * (settings.supplier + settings.network) * factor,
      advance: settings.paymentMode==='actual' ? ((settings.payments||{})[KLANT]||[]).filter(function(p){return p.datum>=a&&p.datum<=b;}).reduce(function(sum,p){return sum+p.bedrag;},0) : n ? beVoorschotSom(a, n) : 0};
  }
  function beOvStatementData(all,r,settings,through) {
    function cents(n){return n===null?null:Math.round((n+Math.sign(n)*1e-10)*100);}
    var cumulative=0,unknown=false,stroom=0,vast=0,advance=0,hasRows=false;
    var months=beOvMonths(r.a,r.b).map(function(m){
      var a=m+'-01';if(a<r.a)a=r.a;
      var next=beOvDate(m+'-01');next.setUTCMonth(next.getUTCMonth()+1);
      var b=beOvAdd(beOvISO(next),-1);if(b>r.b)b=r.b;if(b>through)b=through;
      var n=beOvDays(a,b),rows=all.filter(function(d){return d.key>=a&&d.key<=b;}),t=beOvTotal(rows),f=beOvFixed(a,b,settings);
      var sc=rows.length?cents(t.result):null,fc=cents(f.net),ac=cents(f.advance);
      if(rows.length)hasRows=true;
      if(n){vast+=fc||0;advance+=ac;if(sc===null||fc===null)unknown=true;else {stroom+=sc;cumulative+=sc+fc+ac;}}
      return {month:m,from:a,to:b,total:t,fixed:f,days:n,count:rows.length,provisional:rows.filter(function(d){return d.voorlopig;}).length,
        provisionalRows:rows.filter(function(d){return d.voorlopig&&!d.forecast;}),lastKnown:rows.length?rows[rows.length-1].key:null,
        stroom:sc===null?null:sc/100,vast:fc===null?null:fc/100,advance:ac/100,saldo:unknown?null:cumulative/100};
    });
    return {months:months,stroom:unknown||!hasRows?null:stroom/100,vast:unknown?null:vast/100,advance:advance/100,
      full:unknown||!hasRows?null:(stroom+vast)/100,saldo:unknown||!hasRows?null:cumulative/100};
  }

  function beOvForecastLines(known,expected,today){
    function cents(v){return v===null?null:Math.round(v*100);}
    function diff(a,b){return a===null||b===null?null:cents(a)-cents(b);}
    var month=today.slice(0,7),previous={},correction=0;
    known.months.forEach(function(m){previous[m.month]=m;});
    expected.months.filter(function(m){return m.month<month;}).forEach(function(m){
      var old=previous[m.month],delta=diff(m.stroom,old?old.stroom:0);
      correction=correction===null||delta===null?null:correction+delta;
    });
    var balance=known.months.some(function(m){return m.days;})?cents(known.saldo):0;
    return expected.months.filter(function(m){return m.month>=month;}).map(function(m,i){
      var old=previous[m.month],stroom=diff(m.stroom,old&&old.days?old.stroom:0),advance=diff(m.advance,old&&old.days?old.advance:0),vast=diff(m.vast,old&&old.days?old.vast:0);
      if(i===0)stroom=stroom===null||correction===null?null:stroom+correction;
      balance=balance===null||stroom===null||vast===null?null:balance+stroom+advance+vast;
      return {month:m.month,stroom:stroom===null?null:stroom/100,advance:advance/100,vast:vast===null?null:vast/100,saldo:balance===null?null:balance/100};
    });
  }

  function beOverzichtStart() {
    var HASH = '#be-energieoverzicht', root, shadow, navAnchor, fallback, state, latest, cache = new Map(), serial = 0, opened = false;
    var layoutTimer, monthNow = iso(new Date()).slice(0, 7), inertNodes = [], oldHash = '', previousFocus;
    var ownRefreshPromise=null, ownRefreshAt=0, expandedMonth=null, chartUnit='eur', chartPoints=[], tooltipPinned=false, tooltipIndex=-1;
    var monthAnimation=null,monthToggleSerial=0,menuActiveBefore=[],navLinks=[],menuSerial=0;
    var mobileChrome=[],mobileHeader=null,mobileSidebar=null,pageScrollBefore=null;
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function fmt(v, decimals) { return Number(v).toLocaleString('nl-NL', {minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals == null ? 1 : decimals}); }
    function money(v) { return v === null || !Number.isFinite(v) ? 'Nog onbekend' : new Intl.NumberFormat('nl-NL', {style:'currency', currency:'EUR'}).format(Math.abs(v) < 0.005 ? 0 : v); }
    function date(s) { return new Intl.DateTimeFormat('nl-NL', {day:'numeric',month:'short',year:'numeric', timeZone:'UTC'}).format(beOvDate(s)); }
    function signedClass(v) { return v === null ? '' : v >= 0 ? 'positive' : 'negative'; }
    function save() { try { localStorage.setItem('be_overzicht_settings_v1', JSON.stringify(beOvSettings)); } catch (_) {} }
    function $(id) { return shadow.getElementById(id); }
    function status(text, error) { $('status').textContent = text; $('status').className = error ? 'notice warning' : 'notice'; }
    function button(label, attr) { return '<button type="button" ' + (attr || '') + '>' + label + '</button>'; }
    function contractOptions() {
      var max = beOvContract(iso(new Date())).index + 1, html = '';
      for (var i = 0; i <= max; i++) {
        var begin = beOvAnniversary(iso(cfg.start), i), end = beOvAdd(beOvAnniversary(iso(cfg.start), i + 1), -1);
        html += '<option value="' + i + '">' + date(begin) + ' – ' + date(end) + '</option>';
      }
      return html;
    }
    function mount() {
      root=document.createElement('section');root.id='be-energieoverzicht';root.hidden=true;
      root.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;z-index:1040;background:#f6f7fb;overflow:auto;overscroll-behavior:contain';
      shadow=root.attachShadow({mode:'open'});
      shadow.innerHTML=`<style>
        :host{--bg:#f6f7fb;--paper:#fff;--ink:#292633;--muted:#74717e;--line:#e7e4ec;--purple:#714291;--soft:#f1edf6;--green:#208557;--red:#c64151;--blue:#2f7996;color-scheme:light;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
        :host([data-dark]){--bg:#282723;--paper:#36342f;--ink:#eee8df;--muted:#c0b8ab;--line:#575148;--purple:#cfb3f0;--soft:#44384f;--green:#62d0ad;--red:#ff96a8;--blue:#99b9ff;color-scheme:dark}
        :host{--button:#714291;--button-ink:#fff}
        :host([data-dark]){--button:#8057a4;--ink:#f5f0e8}
        :host([data-dark][data-dark-style="grafiet"]){--bg:#111316;--paper:#1c1f26;--ink:#f5f7fa;--muted:#b6c0cf;--line:#3c4351;--purple:#a879ff;--soft:#262a34;--green:#23d9a0;--red:#ff6079;--blue:#4398ff;--button:#7340b5}
        :host([data-dark][data-dark-style="grafiet"]) .chart-bar:not([stroke]){fill-opacity:1}
        :host([data-dark]) button,:host([data-dark]) input,:host([data-dark]) select,:host([data-dark]) option{color:var(--ink)}
        #title:focus{outline:none;box-shadow:none}
        *{box-sizing:border-box}[hidden]{display:none!important}h1,h2,h3,p{margin:0}h1{font-size:23px}h2{font-size:16px}h3{font-size:14px}small,.help,.muted{color:var(--muted)}a{color:var(--purple)}button,input,select{font:inherit;color:inherit}button,select,input[type=date],input[type=month],input[type=number]{border:1px solid var(--line);border-radius:6px;background:var(--paper);padding:7px 10px;min-height:34px}button,summary{cursor:pointer}button:hover{border-color:var(--purple)}button:disabled{opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--purple);outline-offset:3px}input[type=checkbox]{accent-color:var(--purple)}
        .page{padding:24px 28px 36px;background:var(--bg);min-height:100%}.wrap{max-width:1380px;margin:auto}.top,.actions,.fields,.toggles,.section-head,.legend{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.top,.section-head{justify-content:space-between}.fields label{display:grid;gap:3px;font-size:11px;color:var(--muted)}.fields input,.fields select{font-size:13px;color:var(--ink)}.filters{margin-top:18px}.toggles{margin-top:12px;font-size:12px}.toggles label{display:flex;align-items:center;gap:5px}.toggles small{margin-left:auto}.panel{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:18px;margin-top:14px}.notice{font-size:12px;color:var(--muted);margin-top:12px}.notice.warning{color:var(--red)}.help{font-size:11px;line-height:1.5;margin-top:8px}.positive{color:var(--green)}.negative{color:var(--red)}
        .summary{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:7px;margin-bottom:16px}.summary>div{padding:10px 14px}.summary>div+div{border-left:1px solid var(--line)}.summary small{display:block;font-size:11px}.summary strong{font-size:23px;font-variant-numeric:tabular-nums}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}th,td{text-align:right;padding:9px 10px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}th{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600}th:first-child{width:auto}tbody tr:nth-child(odd){background:color-mix(in srgb,var(--soft) 30%,var(--paper))}.month-cell{display:flex;align-items:center;gap:12px}.month-name{width:104px;flex-shrink:0}.month-link{border:0;padding:0;min-height:0;background:none;font-weight:500}.month-name small{display:block;font-size:10px}.month-meter{flex:1;min-width:190px;height:24px;position:relative;background:var(--soft);border-radius:9px;overflow:hidden}.month-meter>span{height:10px;display:block;min-width:1px;border-radius:9px}.current-month{font-weight:650}.current-month .month-link{font-weight:650}.future{color:var(--muted);font-style:italic}.forecast-row{border-top:1px dashed var(--line);color:var(--muted)}.end-row{background:var(--soft);font-weight:700}tfoot td{padding-top:10px;padding-bottom:10px}tfoot .known-row{font-weight:700;border-top:2px solid var(--line)}.legend{font-size:11px;color:var(--muted);gap:18px}.dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}.chart{margin-top:8px}.chart svg{width:100%;height:auto;display:block}.purchase-summary{display:flex;gap:28px;margin-top:9px;font-size:13px}.purchase-summary strong{font-variant-numeric:tabular-nums}.row{display:flex;gap:16px;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}.row strong{white-space:nowrap}.row.total{font-weight:650;border-top:1px solid var(--line)}.grid{display:grid;gap:12px}.settings-grid{grid-template-columns:repeat(3,1fr);margin:12px 0}.settings-grid label{display:grid;gap:5px;font-size:12px}.settings-grid input{min-width:0;width:100%}.note-list{display:grid;gap:9px;margin-top:12px;font-size:12px}.bar{height:7px;background:var(--soft);margin-top:8px}.bar span{display:block;height:100%;background:var(--purple)}summary{font-size:13px;font-weight:600}.empty{padding:24px;text-align:center;color:var(--muted)}.narrative{font-size:13px;margin-top:12px}.badge{font-size:11px;color:var(--muted)}
        .projected-meter{opacity:.38;margin-top:4px}.forecast-value{display:block;color:var(--muted);font-size:11px;margin-top:5px}.month-detail{white-space:normal;text-align:left;padding:14px;background:var(--paper);border-left:3px solid var(--purple)}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 30px}.detail-grid h3{font-size:13px;margin:6px 0}.detail-period{font-size:12px;color:var(--muted);margin-bottom:10px}.detail-row td{padding:0 0 12px}.month-link:hover{text-decoration:underline}@media(max-width:750px){.page{padding:16px 12px}.panel{padding:12px}.summary strong{font-size:18px}.summary>div{padding:8px}.month-meter{min-width:190px}.detail-grid{grid-template-columns:1fr}th:first-child{width:auto}.settings-grid{grid-template-columns:1fr 1fr}.purchase-summary{gap:12px;font-size:12px}td,th{padding:8px}.toggles small{margin-left:0}.actions{gap:6px}}@media(max-width:450px){.settings-grid{grid-template-columns:1fr}.summary strong{font-size:16px}.summary small{font-size:10px}}

        .month-statement{table-layout:fixed;min-width:900px;font-size:12px}.month-plot-col{width:auto}.amount-col{width:110px}.month-statement td,.month-statement th{padding-left:7px;padding-right:7px}.month-statement th{font-size:9px;letter-spacing:.15px;white-space:normal}.month-statement td:first-child{padding-right:18px}.month-statement .detail-row td{padding:0}.month-meter{border-radius:3px;background:repeating-linear-gradient(to right,var(--soft),var(--soft) calc(25% - 1px),var(--line) calc(25% - 1px),var(--line) 25%)}.month-meter>span{border-radius:2px}.month-cell{gap:12px}.month-meter>span:only-child{height:14px;margin-top:5px}.period-switch,.unit-switch{display:inline-flex;border:1px solid var(--line);padding:3px;border-radius:8px;gap:3px;background:var(--paper)}.period-switch button,.unit-switch button{border:0;background:transparent;white-space:nowrap;font-size:13px;padding:7px 14px}.period-switch button[aria-pressed=true],.unit-switch button[aria-pressed=true]{background:var(--button);color:var(--button-ink);font-weight:600}.period-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.period-navigation{display:flex;align-items:end;gap:6px}.period-navigation label{min-width:160px}.period-navigation input,.period-navigation select{width:100%}.period-switch button:focus-visible,.unit-switch button:focus-visible{outline-offset:0}.chart-stage{position:relative;isolation:isolate}.chart-stage svg{width:100%;height:auto;min-height:210px;display:block}.chart-hit{fill:transparent;cursor:crosshair}.chart-hit:hover,.chart-hit:focus{fill:var(--purple);fill-opacity:.08;outline:none}.chart-hit:focus{stroke:var(--purple);stroke-width:1}.chart-tooltip{position:absolute;z-index:2;width:300px;max-width:calc(100% - 12px);padding:12px 14px;background:var(--paper);border:1px solid var(--line);box-shadow:0 5px 24px #0002;border-radius:8px;pointer-events:none;font-size:12px}.chart-tooltip h3{font-size:13px;margin-bottom:3px}.tip-state{color:var(--muted);font-size:11px;margin-bottom:8px}.tip-grid{display:grid;grid-template-columns:1fr auto auto;gap:5px 12px;align-items:baseline;font-variant-numeric:tabular-nums}.tip-grid strong{text-align:right;white-space:nowrap}.tip-grid small{text-align:right}.tip-foot{font-size:10px;color:var(--muted);border-top:1px solid var(--line);padding-top:7px;margin-top:8px}.chart-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;align-items:center;color:var(--muted);margin-top:6px}.legend-outline{display:inline-block;width:12px;height:9px;border:1.5px dashed currentColor;margin-right:4px}.legend-solid{display:inline-block;width:12px;height:9px;background:currentColor;opacity:.7;margin-right:4px}.chart-hint{margin-left:auto}.chart-stage [data-chart-hit]{touch-action:pan-y}.chart-stage svg{overflow:visible}.chart-title-note{font-size:11px;color:var(--muted)}
        .chart-tooltip{position:static;width:auto;max-width:none;padding:0;border:0;box-shadow:none;border-radius:0;background:transparent;pointer-events:none}.chart-readout{min-height:70px;margin-top:6px;padding:10px 12px;border-radius:6px;background:var(--soft);display:grid;align-content:center}.tip-values{display:flex;align-items:baseline;gap:10px 22px;flex-wrap:wrap;font-size:12px}.tip-values>strong{color:var(--purple);min-width:100px}.tip-values span{color:var(--muted);white-space:nowrap}.tip-values span strong{color:var(--ink);margin-left:4px;font-variant-numeric:tabular-nums}.chart-readout .tip-foot{border:0;margin-top:5px;padding:0}.chart-readout .help{margin:0}.month-name{width:132px}.month-meter{display:flex;align-items:stretch;height:12px;background:var(--soft);border-radius:4px;min-width:190px}.month-meter>span,.month-meter>span:only-child{height:100%;margin:0;flex-shrink:0;min-width:0;border-radius:0}.month-meter .forecast-tail{opacity:.35}.month-meter>span:first-child{border-radius:3px 0 0 3px}.month-dates{font-weight:400}.contract-edge{font-weight:600;color:var(--purple)}
        .month-summary{cursor:pointer}.month-summary:hover{background:var(--soft)}.month-summary:focus-visible{outline:2px solid var(--purple);outline-offset:-2px}.toggles select{font-size:12px;margin-left:4px}.ledger-dates{font-size:12px;color:var(--muted);margin-top:3px;margin-bottom:12px}
        .chart-column{transition:opacity .14s ease}.chart-stage[data-active] .chart-column{opacity:.4}.chart-stage[data-active] .chart-column[data-selected]{opacity:1}.chart-backlight{opacity:0;pointer-events:none;transition:opacity .14s ease}.chart-column[data-selected] .chart-backlight{opacity:.85}.chart-column[data-selected] .chart-bar{fill-opacity:1;filter:drop-shadow(0 2px 2px #0002)}.chart-hit:hover,.chart-hit:focus{fill:transparent;stroke:none}.chart-hit:focus-visible{stroke:var(--purple);stroke-width:.8;stroke-dasharray:3 3}.chart-readout{border-left:3px solid var(--purple)}.tip-values span{display:inline-flex;align-items:center;gap:5px;background:var(--paper);border-radius:5px;padding:4px 7px}.tip-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--series-color);flex:none}.tip-values span strong{color:var(--series-color)}.tip-values .has-rate{display:inline-grid;grid-template-columns:7px auto auto;column-gap:5px;row-gap:2px;align-items:center}.tip-values .tip-rate{grid-column:2/-1;font-size:10px;font-weight:400;line-height:1.15;color:var(--muted);white-space:nowrap}@media(prefers-reduced-motion:reduce){.chart-column,.chart-backlight{transition:none}}
        .detail-reveal{overflow:hidden}.cache-detail{margin-top:18px;padding:14px;background:var(--soft);border:1px solid var(--line);border-radius:8px}.cache-detail h3{margin:0 0 4px}.cache-table{width:100%;font-size:12px}.month-statement .cache-table td,.month-statement .cache-table th{padding:8px;white-space:nowrap}.cache-table td:first-child,.cache-table th:first-child{text-align:left;width:auto}.cache-table small{display:block;color:var(--muted);font-size:10px}.cache-table td:last-child{font-weight:700;font-size:14px}.tip-balance{display:flex;align-items:baseline;gap:10px 22px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}.tip-balance>strong{font-size:16px}.tip-balance>span{color:var(--muted);font-size:11px}.month-summary .month-link{transition:color .2s ease}
        .stream-result{display:flex;align-items:baseline;gap:8px 20px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}.stream-result>span:first-child{font-weight:650;font-size:13px}.stream-result>strong{font-size:24px;font-variant-numeric:tabular-nums}.stream-result strong small{font-size:13px;font-weight:600}.stream-result>span:last-child{font-size:11px;color:var(--muted)}.cache-table .net-stream{font-size:15px;font-weight:750;background:var(--paper)}.day-result-label{pointer-events:none}.month-progress{display:block;font-size:10px;font-weight:400;line-height:1.5;white-space:normal;margin-top:4px;color:var(--muted)}

        @media(max-width:767px){
          .top{position:static;background:var(--bg);padding:8px 0 12px}.mobile-menu{font-weight:600}
          .page{padding:max(12px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));overflow-x:clip}
          .wrap,.panel,.fields,.filters{min-width:0;max-width:100%}.top h1{font-size:21px}.top .actions{display:grid;grid-template-columns:minmax(0,1fr) 44px;width:100%}
          button,select,input[type=date],input[type=month],input[type=number]{min-height:44px}.fields select,.fields input,.toggles select,.settings-grid input,.settings-grid select{font-size:16px;min-width:0;max-width:100%}
          .period-switch{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));width:100%}.period-switch button{font-size:12px;padding:6px 2px}
          .period-navigation{display:grid;grid-template-columns:44px minmax(0,1fr) 44px 44px;gap:4px;width:100%}.period-navigation label{min-width:0}.period-navigation:has(#from-field:not([hidden])){grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
          .toggles{align-items:flex-start}.toggles label{display:grid;gap:4px;width:100%}.toggles select{width:100%;margin-left:0}.toggles small{margin-left:0;white-space:normal}
          .purchase-summary{flex-wrap:wrap;gap:6px 16px}.summary{grid-template-columns:1fr}.summary>div+div{border-left:0;border-top:1px solid var(--line)}.summary strong{font-size:21px}
          .table-wrap{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}.month-statement{min-width:720px}.settings-grid{grid-template-columns:minmax(0,1fr)}
          .chart-stage{max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}.chart-stage svg{width:max(600px,100%);min-height:0}.chart-stage [data-chart-hit]{touch-action:pan-x pan-y}
          .chart-readout{max-width:100%;padding:9px}.tip-values{gap:6px;align-items:center}.tip-values>strong{flex-basis:100%;min-width:0}.tip-values span{font-size:11px}.stream-result{gap:6px}.stream-result>strong{font-size:21px}.stream-result>span:first-child{flex-basis:100%}
          .row{gap:8px;font-size:12px}.row>span{min-width:0;overflow-wrap:anywhere}.chart-hint{margin-left:0}.section-head{gap:8px}.top .actions button{padding:7px 8px;font-size:12px}
        }
.filters label,.settings-grid label{min-width:0;gap:6px;font-size:12px;font-weight:550;line-height:1.4}
.fields input,.fields select,.toggles select,.settings-grid input,.settings-grid select,.payment-row input,#advance-history input{min-width:0;max-width:100%;height:40px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font:inherit;font-size:14px;font-variant-numeric:tabular-nums}
.fields input,.fields select,.settings-grid input,.settings-grid select{width:100%}
.fields input:focus-visible,.fields select:focus-visible,.toggles select:focus-visible,.settings-grid input:focus-visible,.settings-grid select:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
.toggles label{display:grid;align-items:start;gap:6px}.toggles{align-items:end;gap:12px}
.appearance-settings{display:flex;align-items:center;justify-content:space-between;gap:16px}.appearance-settings h2{margin:0 0 4px}.appearance-settings .help{margin:0}
.appearance-settings label{display:grid;gap:6px;min-width:150px;font-size:12px;font-weight:550}.appearance-settings select{height:40px;border-radius:8px;font-size:14px}
@media(max-width:560px){.fields input,.fields select,.toggles select,.settings-grid input,.settings-grid select,.payment-row input,#advance-history input,.appearance-settings select{font-size:16px;min-height:44px;height:44px}.toggles label{width:100%}.toggles select{width:100%}.appearance-settings{align-items:stretch;flex-direction:column;gap:12px}.appearance-settings label{min-width:0;width:100%}.settings-grid{gap:14px}.period-navigation{max-width:100%}}

      </style><div class="page"><div class="wrap">
        <header class="top">${button('☰ Menu','id="mobile-menu" class="mobile-menu" hidden aria-label="Dashboardmenu openen"')}<h1 id="title" tabindex="-1">Financieel <small style="font-size:11px;font-weight:500">6.4.2</small></h1><div class="actions">${button('Instellingen & uitleg','id="options" aria-expanded="false" aria-controls="settings"')}${button('↻','id="refresh" aria-label="Vernieuwen"')}</div></header>
        <div class="filters"><select id="period" aria-label="Periode" hidden><option value="month">Maand</option><option value="year">Jaar</option><option value="contract">Contractjaar</option><option value="custom">Eigen periode</option></select><div class="period-bar"><div class="period-switch" role="group" aria-label="Periode kiezen">${button('Maand','data-preset="month" aria-pressed="false"')}${button('Jaar','data-preset="year" aria-pressed="false"')}${button('Contract','data-preset="contract" aria-pressed="true"')}${button('Zelf kiezen','data-preset="custom" aria-pressed="false"')}</div><div class="fields period-navigation">${button('←','id="prev" aria-label="Vorige periode"')}<label id="month-field">Maand<input id="month" type="month" value="${monthNow}"></label><label id="year-field" hidden>Jaar<select id="year"></select></label><label id="contract-field" hidden>Contract<select id="contract"></select></label><label id="from-field" hidden>Van<input id="from" type="date"></label><label id="to-field" hidden>Tot en met<input id="to" type="date"></label>${button('→','id="next" aria-label="Volgende periode"')}${button('Nu','id="current-period" title="Ga naar de huidige maand, het huidige jaar of contract"')}</div></div><div class="toggles"><label>Prijsweergave<select id="price-mode"><option value="allin">All-in + opslag (EB en btw)</option><option value="bare">Kaal + opslag (zonder EB/btw)</option></select></label><span id="basis" class="badge"></span><small id="filter-dates"></small></div></div>

        <div id="status" role="status" aria-live="polite" class="notice"></div>
        <div id="content"></div>
        <div id="settings" hidden><section class="panel appearance-settings"><div><h2>Weergave</h2><p class="help">Donkere modus voor het hele dashboard.</p></div><label for="cfg-dark">Donkere modus<select id="cfg-dark"><option value="uit">Uit</option><option value="aan">Aan</option></select></label><label for="cfg-dark-style">Dark mode stijl<select id="cfg-dark-style"><option value="bruingrijs">Bruingrijs</option><option value="grafiet">Grafiet</option></select></label><label for="cfg-afrr-market">Regelvermogen &amp; biedingen<select id="cfg-afrr-market"><option value="aan">Aan</option><option value="uit">Uit · geen API-aanvragen</option></select></label></section><section class="panel"><h2>Voorschotten en contract</h2><div id="settings-body"></div></section><section class="panel"><h2>Berekening van deze selectie</h2><div id="calculation"></div></section><details class="panel"><summary>Rekenregels en bronnen</summary><div id="rules" class="note-list"></div></details><div class="actions" style="margin-top:12px">${button('CSV downloaden','id="csv"')}</div></div>
      </div></div>`;
      theme();document.body.appendChild(root);
      var year = +monthNow.slice(0, 4), startYear = cfg.start.getFullYear();
      for (var y = startYear; y <= year + 1; y++) $('year').add(new Option(String(y), String(y)));
      $('year').value = String(year); $('contract').innerHTML = contractOptions(); $('contract').value = String(beOvContract(iso(new Date())).index);
      $('from').value = monthNow + '-01'; $('to').value = iso(new Date());
      var allin=beOvSettings.tax&&beOvSettings.vat;beOvSettings.tax=beOvSettings.vat=allin;$('price-mode').value=allin?'allin':'bare';
      state = {type:'contract'}; $('period').value='contract';
      ['period','month','year','contract','from','to'].forEach(function (id) { $(id).addEventListener('change', function () { updateFilters(); load(); }); });
      $('cfg-dark').value=beDarkOn?'aan':'uit';
      $('cfg-dark').onchange=function(){beDarkApply($('cfg-dark').value==='aan');};
      $('cfg-dark-style').value=window.BETheme.style();
      $('cfg-dark-style').onchange=function(){window.BETheme.setStyle($('cfg-dark-style').value);};
      $('cfg-afrr-market').value=beAfrrMarketEnabled()?'aan':'uit';
      $('cfg-afrr-market').onchange=function(){beAfrrMarketSet($('cfg-afrr-market').value==='aan');};

      $('price-mode').addEventListener('change',function(){var allin=$('price-mode').value==='allin';beOvSettings.tax=beOvSettings.vat=allin;save();updateFilters();if(latest)render();});
      shadow.querySelectorAll('[data-preset]').forEach(function(b){b.onclick=function(){
        $('period').value=b.dataset.preset;updateFilters();load();
      };});
      $('current-period').onclick=function(){
        $('month').value=iso(new Date()).slice(0,7);$('year').value=String(new Date().getFullYear());$('contract').value=String(beOvContract(iso(new Date())).index);
        updateFilters();load();
      };
      $('prev').onclick = function () { shift(-1); }; $('next').onclick = function () { shift(1); };
      $('options').onclick=function(){var open=$('settings').hidden;$('settings').hidden=!open;$('content').hidden=open;$('options').textContent=open?'Terug naar overzicht':'Instellingen & uitleg';$('options').setAttribute('aria-expanded',String(open));};
      $('rules').innerHTML=''+
        '<p>Stroom = verkoop − inkoop − energiebelasting na saldering. Vaste kosten = belastingvermindering − levering − netbeheer. Plus voorschotten geeft het saldo. Alle bedragen zijn voorlopig; maandbedragen worden op centen afgerond.</p>'+
        '<p>Voorschotten volgen je bedragen en ingangsdatums, verdeeld over kalenderdagen. Dit is geen bankafschrift. Je kunt ook werkelijke betalingen invullen. Vaste dagkosten en voorschotten lopen tot en met vandaag; de gemeten stroom van vandaag kan nog onvolledig zijn.</p>'+
        '<p>Balansdagen krijgen voorrang op de eigen cache. Een cachedag blijft voorlopig; bij ontbrekende prijzen telt uitsluitend het geprijsde deel mee. Vandaag wordt in de prognose vervangen door één geschatte hele dag. De bekende stand gebruikt het gemeten dagdeel. Daardoor tellen ze nooit dubbel.</p>'+
        '<p>De prognose gebruikt de seizoensfactoren voor afname en teruglevering uit 5.0, met maximaal 28 complete recente brondagen (minimaal 7). Een beschikbare volledige vergelijkbare maand van vorig jaar weegt 60% mee. Bronbedragen en kWh worden geraamd vóór toepassing van EB. Dit is geen weers- of prijsvoorspelling. De resterende stroompost bevat ook het verwachte effect op saldering. Bij ontbrekende historische dagen tonen we geen totaalprognose.</p>'+
        '<p>Tot 1 januari 2027 wordt EB per contractjaar verrekend binnen de ingestelde saldeerbare teruglevering, maximaal de afname. Zonder bevestigde herkomst/verrekening wordt maximaal 5.000 kWh teruglevering gebruikt. Bij jaarwisseling geldt de gekozen tijdsevenredige of afnamegewogen raming; je leveranciersnota kan een andere toegestane verdeling hanteren. Maandbedragen zijn een toerekening en kunnen veranderen.</p>'+
        '<p>Btw of EB uit is een vergelijking, geen factuurbedrag. Netto niet terugleveren maakt btw niet automatisch nul. De opslag van 2 cent inclusief btw is al verwerkt in de bron; we tellen hem niet nogmaals op. Ontbrekende jaartarieven of hogere verbruiksschijven geven geen verzonnen bedrag.</p>'+
        '<p><a href="https://consument.acm.nl/elektriciteit-en-gas/duurzame-energie/wat-is-salderen" target="_blank" rel="noopener noreferrer">ACM: salderen</a> · <a href="https://download.belastingdienst.nl/belastingdienst/docs/handboek_milieubelast_2026_ml0301z61fd.pdf" target="_blank" rel="noopener noreferrer">Belastingdienst: Handboek 2026, 7.4.2 en 7.8.14</a></p>';
      $('refresh').onclick = function () { cache.clear(); load(); };
      $('csv').onclick = exportCSV;
      $('mobile-menu').onclick=function(){
        var toggle=document.querySelector('[data-bs-target="#mobileSidebar"]');
        if(toggle&&toggle.getAttribute('aria-expanded')!=='true')toggle.click();
      };
      ['pointerover','pointermove','focusin'].forEach(function(event){$('content').addEventListener(event,function(e){
        var hit=e.target.closest('[data-chart-hit]');if(hit&&!tooltipPinned)showChartTip(+hit.dataset.chartHit,e);
      });});
      $('content').addEventListener('pointerout',function(e){if(!tooltipPinned&&e.target.closest('[data-chart-hit]')&&!(e.relatedTarget&&e.relatedTarget.closest('[data-chart-hit]')))hideChartTip();});
      $('content').addEventListener('focusout',function(e){if(!tooltipPinned&&e.target.closest('[data-chart-hit]'))hideChartTip();});
      $('content').addEventListener('keydown',function(e){var month=e.target.closest('[data-month]');if(month&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();toggleMonth(month.dataset.month);return;}var hit=e.target.closest('[data-chart-hit]');if(!hit)return;
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();tooltipPinned=false;hideChartTip();}
        else if(e.key==='Enter'||e.key===' '){e.preventDefault();tooltipPinned=!tooltipPinned;showChartTip(+hit.dataset.chartHit,e);}
        else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();var i=Math.max(0,Math.min(chartPoints.length-1,+hit.dataset.chartHit+(e.key==='ArrowRight'?1:-1)));tooltipPinned=false;var next=$('chart-point-'+i);if(next)next.focus();}
      });
      $('content').addEventListener('click', function (e) {
        var unit=e.target.closest('[data-chart-unit]');if(unit){chartUnit=unit.dataset.chartUnit;render();return;}
        var hit=e.target.closest('[data-chart-hit]');if(hit){tooltipPinned=!(tooltipPinned&&tooltipIndex===+hit.dataset.chartHit);showChartTip(+hit.dataset.chartHit,e);return;}
        tooltipPinned=false;hideChartTip();
        var month=e.target.closest('[data-month]');if(month){toggleMonth(month.dataset.month);return;}
        var b = e.target.closest('[data-contract-link]'); if (!b) return;
        $('period').value = 'contract'; $('contract').value = b.dataset.contractLink; updateFilters(); load();
      });
      settingsUI(); updateFilters(); theme();
    }
    function toggleMonth(key){
      var scroll=innerWidth<768?window.scrollY:root.scrollTop,closing=expandedMonth===key,token=++monthToggleSerial;
      expandedMonth=closing?null:key;
      if(monthAnimation){monthAnimation.cancel();monthAnimation=null;}
      function redraw(){render();var row=$('month-row-'+key);if(row)row.focus({preventScroll:true});if(innerWidth<768)window.scrollTo(window.scrollX,scroll);else root.scrollTop=scroll;}
      if(!closing)redraw();
      var detail=$('reveal-'+key),reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(!detail||!detail.animate||reduce){if(closing)redraw();return;}
      var height=detail.getBoundingClientRect().height;
      var animation=detail.animate(closing?[{height:height+'px',opacity:1},{height:'0px',opacity:0}]:[{height:'0px',opacity:0},{height:height+'px',opacity:1}],{duration:closing?180:260,easing:'cubic-bezier(.22,.7,.24,1)',fill:'both'});
      monthAnimation=animation;
      animation.finished.then(function(){if(token!==monthToggleSerial)return;monthAnimation=null;if(closing)redraw();animation.cancel();}).catch(function(){});
    }
    function statementRange(r){
      if($('period').value!=='month')return r;
      var today=iso(new Date()),anchor=today>=r.a&&today<=r.b?today:r.a,c=beOvContract(anchor);
      return {a:c.begin,b:c.end};
    }
    function theme() { if (root) {
      var dark=window.BETheme.isDark(),style=window.BETheme.style();
      root.toggleAttribute('data-dark',dark);root.setAttribute('data-dark-style',style);
      root.style.background=dark?(style==='grafiet'?'#111316':'#282723'):'#f6f7fb';
      if($('cfg-dark'))$('cfg-dark').value=dark?'aan':'uit';
      if($('cfg-dark-style'))$('cfg-dark-style').value=style;
    } }
    function shift(n) {
      var type = $('period').value;
      if (type === 'month') { var d = beOvDate($('month').value + '-01'); d.setUTCMonth(d.getUTCMonth() + n); $('month').value = beOvISO(d).slice(0, 7); }
      else { var select = $(type); if (select.selectedIndex + n < 0 || select.selectedIndex + n >= select.options.length) return; select.selectedIndex += n; }
      updateFilters(); load();
    }
    function range() {
      var type = $('period').value, a, b;
      if (type === 'month') { a = $('month').value + '-01'; var d = beOvDate(a); d.setUTCMonth(d.getUTCMonth() + 1); b = beOvAdd(beOvISO(d), -1); }
      if (type === 'year') { a = $('year').value + '-01-01'; b = $('year').value + '-12-31'; }
      if (type === 'contract') { a = beOvAnniversary(iso(cfg.start), +$('contract').value); b = beOvAdd(beOvAnniversary(iso(cfg.start), +$('contract').value + 1), -1); }
      if (type === 'custom') { a = $('from').value; b = $('to').value; }
      if (![a,b].every(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k || '') && Number.isFinite(+beOvDate(k)) && beOvISO(beOvDate(k)) === k; })) throw Error('Kies twee geldige datums.');
      if (a > b) throw Error('De einddatum moet op of na de begindatum liggen.');
      if (beOvDays(a, b) > 1096) throw Error('Kies maximaal drie jaar tegelijk.');
      if (b < iso(cfg.start)) throw Error('Deze periode ligt vóór de ingestelde contractstart. Kies een latere periode.');
      if (a < iso(cfg.start)) a = iso(cfg.start);
      return {a:a, b:b};
    }
    function updateFilters() {
      var type = $('period').value; state.type = type;
      shadow.querySelectorAll('[data-preset]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.preset===type));});
      $('prev').hidden=$('next').hidden=$('current-period').hidden=type==='custom';
      ['month','year','contract','from','to'].forEach(function (id) { $(id + '-field').hidden = type === 'custom' ? !['from','to'].includes(id) : id !== type; });
      $('prev').disabled = $('next').disabled = type === 'custom';
      $('basis').textContent=beOvSettings.tax?'All-in · met EB en btw':'Kaal · zonder EB en btw';
      try { var r = range(); $('filter-dates').textContent = date(r.a) + ' t/m ' + date(r.b); } catch (_) { $('filter-dates').textContent = ''; }
    }
    async function fetchMonth(id, month) {
      var key = id + ':' + month, saved = cache.get(key), now = Date.now();
      if (saved && now - saved.time < 60000) return saved.rows;
      var url = new URL('/customer/' + encodeURIComponent(id) + '/results-v2-api/', location.origin);
      url.searchParams.set('interval','month'); url.searchParams.set('period',month);
      url.searchParams.set('include_vat','1'); url.searchParams.set('include_delivery_cost','1');
      var res = await origFetch(url.href, {credentials:'same-origin'});
      if (!res.ok) throw Error(res.status === 429 ? 'Balans vraagt om even te wachten (429). Probeer over een minuut opnieuw.' : res.status === 401 || res.status === 403 ? 'Log opnieuw in bij Balans om je resultaten te lezen.' : 'Resultaten ' + month + ' konden niet worden geladen (HTTP ' + res.status + ').');
      var rows = beOvNormalize(await res.json(), month);
      cache.set(key, {time:now, rows:rows}); return rows;
    }
    async function load() {
      var ticket = ++serial, r, id;
      try { r = range(); id = verversKlantUitPad(); if (!geldigeKlant(id)) throw Error('Het installatie-id is nog niet bekend. Open eerst Actueel of Resultaten en daarna dit overzicht.'); }
      catch (e) { status(e.message, true); latest = null; $('content').innerHTML = ''; $('csv').disabled = true; return; }
      latest = null; $('csv').disabled = true; $('refresh').disabled = true;
      $('content').innerHTML = '<div class="panel empty"><span class="spinner"></span> Je brongegevens worden gelezen…</div>';
      var today = iso(new Date()), last = r.b < today ? r.b : today;
      var from = r.a <= last ? beOvContract(r.a).begin : beOvContract(today).begin;
      var end = r.a <= last ? beOvContract(last).end : today;
      if (end > today) end = today;
      if (from > beOvAdd(today, -28)) from = beOvAdd(today, -28);
      if (from < iso(cfg.start)) from = iso(cfg.start);
      var months = beOvMonths(from, end), sets = [], errors = [], cursor = 0, done = 0;
      status('Historie en salderingscontext ophalen: 0 / ' + months.length + ' maanden.');
      async function worker() {
        while (cursor < months.length) {
          if (ticket !== serial) return;
          var month = months[cursor++];
          try { sets.push(await fetchMonth(id, month)); } catch (e) { errors.push(e.message); }
          done++; if (ticket === serial) status('Historie en salderingscontext ophalen: ' + done + ' / ' + months.length + ' maanden.');
        }
      }
      await Promise.all([worker(), worker()]);
      if (ticket !== serial) return;
      if (id !== verversKlantUitPad()) { $('refresh').disabled = false; load(); return; }
      latest = {id:id, range:r, sourceRows:sets.reduce(function(a,b){return a.concat(b);},[]), rows:[], errors:errors, at:new Date(), from:from, to:end, day:today};
      mergeOwnCache();
      $('refresh').disabled = false; $('csv').disabled = false; render();
      refreshOwnCache();
    }
    function mergeOwnCache(){
      if(!latest)return;
      latest.rows=beOvMergeRows(latest.sourceRows,leesVoorlopigeDagen(),latest.id,latest.from,latest.to,Date.now());
      var yesterday=beOvAdd(iso(new Date()),-1),end=latest.to<yesterday?latest.to:yesterday;
      latest.contextMissing=Math.max(0,beOvDays(latest.from,end)-latest.rows.filter(function(d){return d.key<=end;}).length);
      latest.contextPartial=latest.rows.some(function(d){return d.key<=end&&d.deelresultaat;});
    }
    function refreshOwnCache(){
      if(ownRefreshPromise||!opened||document.hidden||!latest)return;
      var id=latest.id;
      ownRefreshAt=Date.now();
      ownRefreshPromise=Promise.resolve().then(function(){return resultatenHaalVoorlopigeDagen(true);}).catch(function(){return false;}).then(async function(){
        if(!opened||!latest||latest.id!==id||id!==verversKlantUitPad())return;
        // De bestaande cachecontrole ruimt een voorlopige dag op zodra Balans
        // hem heeft verwerkt. Lees daarom ook de bijbehorende echte dag opnieuw.
        var today=iso(new Date()),recent=beOvMonths(beOvAdd(today,-4),today);
        var sets=await Promise.all(recent.map(async function(month){
          try{cache.delete(id+':'+month);return {month:month,rows:await fetchMonth(id,month)};}catch(_){return null;}
        }));
        if(!opened||!latest||latest.id!==id||id!==verversKlantUitPad())return;
        sets.filter(Boolean).forEach(function(set){latest.sourceRows=latest.sourceRows.filter(function(r){return r.key.slice(0,7)!==set.month;}).concat(set.rows);});
      }).then(function(){
        ownRefreshPromise=null;
        if(!opened||!latest||latest.id!==verversKlantUitPad())return;
        var before=JSON.stringify(latest.rows);mergeOwnCache();
        if(before!==JSON.stringify(latest.rows))render();
      });
    }
    function selected(all, r) { return all.filter(function (d) { return d.key >= r.a && d.key <= r.b; }); }
    function aggregates(rows, monthly) {
      var groups = new Map(); rows.forEach(function (r) { var key = monthly ? r.key.slice(0, 7) : r.key; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); });
      return Array.from(groups.entries()).map(function (pair) { return Object.assign({key:pair[0], count:pair[1].length, provisional:pair[1].filter(function (r) { return r.voorlopig; }).length}, beOvTotal(pair[1])); });
    }
    function signedMoney(v){return v===null||!Number.isFinite(v)?'Nog onbekend':(v>.004?'+':'')+money(v);}
    function row(label,value,cls){return '<div class="row '+(cls||'')+'"><span>'+label+'</span><strong>'+value+'</strong></div>';}
    function streamMoney(v){return v===null||!Number.isFinite(v)?'Nog onbekend':(Math.abs(v)<.005?'':v>0?'+ ':'− ')+money(Math.abs(v));}
    function chartAmounts(t){return t?[t.ebGrossShown===null?null:t.buyShown+t.ebGrossShown,t.ebCreditShown===null?null:t.sellShown+t.ebCreditShown,t.result]:[null,null,null];}
    function showChartTip(index,event){
      var point=chartPoints[index],tip=$('chart-tooltip');if(!point||!tip||!point.known)return;
      var known=point.known,name=point.key.length===7?new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric',timeZone:'UTC'}).format(beOvDate(point.key+'-01')):date(point.key);
      var amounts=chartAmounts(known),html='<div class="tip-values"><strong>'+esc(name)+'</strong>';
      function averagePrice(amount,kwh){return Number.isFinite(amount)&&Number.isFinite(kwh)&&kwh>0?'€ '+(amount/kwh).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:3})+' / kWh':'—';}
      function item(label,value,color,rate){color=color||(label==='Inkoop'||label==='Afname'?'var(--blue)':label==='Verkoop'||label==='Export'?'var(--green)':'var(--purple)');var rateLabel=label==='Inkoop'||label==='Afname'?'Gem. importprijs':'Gem. exportprijs';return '<span'+(rate!==undefined?' class="has-rate"':'')+' style="--series-color:'+color+'"><i class="tip-dot"></i>'+label+' <strong>'+value+'</strong>'+(rate!==undefined?'<small class="tip-rate" title="'+rateLabel+'">gem. '+rate+'</small>':'')+'</span>';}
      html+=item('Afname',fmt(known.imp,2)+' kWh','var(--blue)',chartUnit==='kwh'?averagePrice(amounts[0],known.imp):undefined);
      if(chartUnit==='eur')html+=item('Inkoop',money(amounts[0]),'var(--blue)',averagePrice(amounts[0],known.imp));
      html+=item('Export',fmt(known.exp,2)+' kWh','var(--green)',chartUnit==='kwh'?averagePrice(amounts[1],known.exp):undefined);
      if(chartUnit==='eur')html+=item('Verkoop',money(amounts[1]),'var(--green)',averagePrice(amounts[1],known.exp));
      if(chartUnit==='eur')html+=item('Resultaat',streamMoney(amounts[2]));
      html+='</div>';
      if(chartUnit==='eur'){
        var result=amounts[2],daily=point.key.length===10,kind=result===null?'Nog onbekend':Math.abs(result)<.005?'Geen kosten of opbrengst':result<0?'Stroomkosten':'Stroomopbrengst';
        html+='<div class="stream-result"><span>Netto stroomresultaat '+(daily?'van deze dag':'van deze maand')+'</span><strong class="'+signedClass(result)+'">'+streamMoney(result)+' <small>'+kind.toLowerCase()+'</small></strong><span>Verkoop − inkoop</span></div>';
      }
      html+='<p class="tip-foot">'+(known.provisional?'Inclusief eigen cache · voorlopig. ':'')+'2 cent opslag inbegrepen · '+(beOvSettings.tax?'met EB na saldering':'zonder EB')+' · '+(beOvSettings.vat?'incl. btw':'excl. btw')+' · '+(tooltipPinned?'Vastgezet · klik opnieuw om los te maken.':'Klik om vast te zetten; ← → voor vorige/volgende.')+'</p>';
      tip.innerHTML=html;tip.hidden=false;tooltipIndex=index;var stage=$('chart-stage');if(stage){stage.setAttribute('data-active','true');stage.querySelectorAll('[data-chart-column]').forEach(function(g){g.toggleAttribute('data-selected',+g.dataset.chartColumn===index);});}var hint=$('chart-tip-hint');if(hint)hint.hidden=true;
    }
    function hideChartTip(){var stage=$('chart-stage');if(stage){stage.removeAttribute('data-active');stage.querySelectorAll('[data-chart-column]').forEach(function(g){g.removeAttribute('data-selected');});}var tip=$('chart-tooltip'),hint=$('chart-tip-hint');if(tip)tip.hidden=true;if(hint)hint.hidden=false;tooltipIndex=-1;}
    function barChart(points){
      chartPoints=points;tooltipPinned=false;tooltipIndex=-1;
      if(!points.length)return '<p class="empty">Nog geen brongegevens in deze periode.</p>';
      var w=1040,h=240,left=58,bottom=204,top=16,plot=w-left-12;
      function values(t){return chartUnit==='kwh'?(t?[t.imp,t.exp]:[null,null]):chartAmounts(t);}
      var numbers=[0];points.forEach(function(p){[p.known].forEach(function(t){values(t).forEach(function(v){if(v!==null)numbers.push(v);});});});
      var min=Math.min.apply(null,numbers),max=Math.max.apply(null,numbers);if(min===max)max=min+1;
      var padding=(max-min)*.06;max+=padding;if(min<0)min-=padding;
      var y=function(v){return top+(max-v)/(max-min)*(bottom-top);},zero=y(0),slot=plot/points.length,count=chartUnit==='kwh'?2:3,bar=Math.min(19,slot*.7/count),colors=['var(--blue)','var(--green)','var(--purple)'];
      var svg='<div class="chart-stage" id="chart-stage"><svg viewBox="0 0 '+w+' '+h+'" role="group" aria-label="'+(chartUnit==='kwh'?'Afname en teruglevering in kWh':'Inkoop, verkoop en stroomresultaat in euro')+'; beweeg over de grafiek voor details"><defs><pattern id="cache-hatch" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1 M0 5L5 0 M4 6L6 4" stroke="var(--paper)" opacity=".65" stroke-width="1.5"/></pattern></defs>';
      for(var i=0;i<5;i++){var v=min+(max-min)*i/4,py=y(v);svg+='<line x1="'+left+'" y1="'+py+'" x2="'+(w-12)+'" y2="'+py+'" stroke="var(--line)"/><text x="'+(left-8)+'" y="'+(py+3)+'" text-anchor="end" fill="var(--muted)" font-size="10">'+(chartUnit==='eur'?'€ ':'')+esc(fmt(v,0))+'</text>';}
      svg+='<line x1="'+left+'" y1="'+zero+'" x2="'+(w-12)+'" y2="'+zero+'" stroke="var(--muted)" opacity=".65"/>';
      points.forEach(function(p,i){
        var x=left+slot*(i+.5),label=p.key.length===7?p.key.slice(5)+'/'+p.key.slice(2,4):p.key.slice(8)+'/'+p.key.slice(5,7);p.x=x;
        svg+='<g class="chart-column" data-chart-column="'+i+'"><rect class="chart-backlight" x="'+(left+slot*i+2)+'" y="'+top+'" width="'+Math.max(1,slot-4)+'" height="'+(bottom-top)+'" rx="5" fill="var(--soft)"/>';
        [p.known].forEach(function(t){if(!t)return;var future=false;
          values(t).forEach(function(v,j){if(v===null)return;var py=y(v),rx=x+(j-(count-1)/2)*(bar+2)-bar/2,height=Math.max(.8,Math.abs(zero-py));
            var attrs=' x="'+rx+'" y="'+Math.min(zero,py)+'" width="'+bar+'" height="'+height+'" rx="2"';
            svg+='<rect class="chart-bar"'+attrs+' fill="'+colors[j]+'" fill-opacity="'+(future?'.10':'.8')+'"'+(future?' stroke="'+colors[j]+'" stroke-width="1.3" stroke-dasharray="3 2"':'')+'/>';
            if(chartUnit==='eur'&&j===2&&p.key.length===10&&points.length<=31)svg+='<text class="day-result-label" x="'+(rx+bar/2)+'" y="'+(v>=0?Math.max(10,py-5):Math.min(218,zero+height+12))+'" text-anchor="middle" font-size="9" font-weight="650" fill="'+(v<0?'var(--red)':'var(--green)')+'">'+esc((v>0?'+':'')+fmt(v,2))+'</text>';
            if(!future&&t.provisional&&p.key.length===10)svg+='<rect'+attrs+' fill="url(#cache-hatch)" pointer-events="none"/>';
          });
        });
        if(i%Math.max(1,Math.ceil(points.length/16))===0||i===points.length-1)svg+='<text x="'+x+'" y="228" text-anchor="middle" font-size="10" fill="var(--muted)">'+label+'</text>';
        var desc=(p.key.length===7?p.key:p.key)+' · '+(p.known?'bekend':'prognose')+' · '+(chartUnit==='eur'?'inkoop '+money(chartAmounts(p.known)[0])+', verkoop '+money(chartAmounts(p.known)[1]):'afname '+(p.known?fmt(p.known.imp,2):'—')+' kWh');
        svg+='<rect id="chart-point-'+i+'" class="chart-hit" data-chart-hit="'+i+'" x="'+(left+slot*i)+'" y="'+top+'" width="'+slot+'" height="'+(bottom-top)+'" tabindex="0" role="button" aria-label="'+esc(desc)+'" aria-describedby="chart-tooltip"/></g>';
      });
      return svg+'</svg></div><div class="chart-readout"><p class="help" id="chart-tip-hint">Tik of beweeg over een dag of maand voor de bedragen.</p><div class="chart-tooltip" id="chart-tooltip" role="tooltip" hidden></div></div>';
    }
    function chartData(rows,r){
      var monthly=$('period').value!=='month'&&beOvDays(r.a,r.b)>62;
      // Deze grafiek bevat uitsluitend gemeten/voorlopige bronresultaten.
      return aggregates(rows,monthly).map(function(t){return {key:t.key,known:t};});
    }
    function balanceParts(t,a,b){
      function round(v){return v===null?null:Math.round((v+Math.sign(v)*1e-10)*100)/100;}
      var f=beOvFixed(a,b,beOvSettings),buy=t.ebGrossShown===null?null:round(t.buyShown+t.ebGrossShown),sell=t.ebCreditShown===null?null:round(t.sellShown+t.ebCreditShown),fixed=round(f.net),advance=round(f.advance);
      return {buy:buy,sell:sell,stroom:buy===null||sell===null?null:round(sell-buy),fixed:fixed,advance:advance,saldo:buy===null||sell===null||fixed===null?null:round(sell-buy+fixed+advance)};
    }
    function provisionalDetail(m){
      var rows=m.provisionalRows||[];if(!rows.length)return '';
      var sum={buy:0,sell:0,stroom:0,fixed:0,advance:0,saldo:0};
      var h='<section class="cache-detail"><h3>Voorlopige dagen · eigen cache</h3><p class="help">Al opgenomen in de maandstand. Dagsaldo = verkoop − inkoop + vaste posten + voorschot.</p><div class="table-wrap"><table class="cache-table"><thead><tr><th>Datum</th><th>Inkoop −</th><th>Verkoop +</th><th>Netto stroom</th><th>Vaste posten</th><th>Voorschot +</th><th>Dagsaldo incl. voorschot</th></tr></thead><tbody>';
      rows.forEach(function(d){var v=balanceParts(beOvTotal([d]),d.key,d.key),label=date(d.key)+(d.deelresultaat?' · dagdeel':'');
        Object.keys(sum).forEach(function(k){sum[k]=sum[k]===null||v[k]===null?null:Math.round((sum[k]+v[k])*100)/100;});
        h+='<tr><td>'+esc(label)+(d.bijgewerkt?'<small>Bijgewerkt '+new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(d.bijgewerkt))+'</small>':'')+'</td>'+['buy','sell','stroom','fixed','advance','saldo'].map(function(k){var amount=k==='buy'?(v[k]===null?null:-v[k]):v[k];return '<td class="'+signedClass(amount)+(k==='stroom'?' net-stream':'')+'">'+signedMoney(amount)+'</td>';}).join('')+'</tr>';
      });
      h+='</tbody><tfoot><tr><td>Voorlopige dagen samen</td>'+['buy','sell','stroom','fixed','advance','saldo'].map(function(k){return '<td>'+signedMoney(k==='buy'?(sum[k]===null?null:-sum[k]):sum[k])+'</td>';}).join('')+'</tr></tfoot></table></div><p class="help">Positief dagsaldo = erbij op je te ontvangen saldo; negatief = eraf. Opslag en gekozen EB/btw inbegrepen. EB is een contractraming. Vandaag: stroom tot het cachetijdstip, vaste posten en voorschot voor de hele dag. Dagafronding kan 1 cent afwijken van de maandafronding.'+(rows.some(function(d){return d.prijsOnvolledig;})?' Alleen het geprijsde deel telt mee.':'')+'</p></section>';
      return h;
    }
    function monthDetail(m, projection){
      if(!m||!m.days)return '<p class="help">Voor deze maand zijn nog geen gemeten bedragen beschikbaar.</p>';
      var t=m.total,f=m.fixed,s=beOvSettings,factor=s.vat?1:1/BTW,fi=t.imp*.02*factor,fe=t.exp*.02*factor;
      var buy=t.ebGrossShown===null?null:t.buyShown+t.ebGrossShown,sell=t.ebCreditShown===null?null:t.sellShown+t.ebCreditShown;
      var h='<div class="month-detail"><p class="detail-period">'+date(m.from)+' t/m '+date(m.to)+' · '+(m.forecast?'prognose':m.provisional?'inclusief voorlopige eigen cache':'bekende brongegevens')+'</p><div class="detail-grid"><div><h3>1. Inkoop · '+fmt(t.imp,2)+' kWh</h3>'+
        row('Stroom zonder opslag',signedMoney(-t.buyShown+fi))+row('Opslag · '+(s.vat?'2 cent incl. btw':'1,65289 cent excl. btw')+' / kWh',signedMoney(-fi))+row('Energiebelasting afname',signedMoney(t.ebGrossShown===null?null:-t.ebGrossShown))+row('Totaal inkoop',signedMoney(buy===null?null:-buy),'total')+'<p class="help">Gemiddeld '+(buy===null||!t.imp?'—':'€ '+fmt(buy/t.imp,5))+' / kWh, inclusief gekozen EB/btw.</p></div><div><h3>2. Verkoop · '+fmt(t.exp,2)+' kWh</h3>'+
        row('Opbrengst vóór opslag',signedMoney(t.sellShown+fe))+row('Opslag · '+(s.vat?'2 cent incl. btw':'1,65289 cent excl. btw')+' / kWh',signedMoney(-fe))+row('EB terug door salderen / tariefverdeling',signedMoney(t.ebCreditShown))+row('Totaal verkoop',signedMoney(sell),'total')+'<p class="help">Gemiddeld '+(sell===null||!t.exp?'—':'€ '+fmt(sell/t.exp,5))+' / kWh. Saldering wordt over het contract berekend.</p></div><div><h3>3. Vaste posten en voorschot</h3>'+
        row('Vaste levering',signedMoney(-f.supplier))+row('Netbeheer',signedMoney(-f.network))+row('Vermindering energiebelasting',signedMoney(f.credit))+row('Vaste posten samen',signedMoney(m.vast),'total')+row(s.paymentMode==='actual'?'Ingevoerde betalingen':'Voorschot volgens ingangsdatums',signedMoney(m.advance))+'</div><div><h3>4. Effect op jouw saldo</h3>'+
        row('Stroom: verkoop − inkoop',signedMoney(m.stroom))+row('Vaste posten',signedMoney(m.vast))+row('Voorschot',signedMoney(m.advance))+row('Deze maand erbij / eraf',signedMoney(m.stroom===null||m.vast===null?null:Math.round((m.stroom+m.vast+m.advance)*100)/100),'total')+row('Opgeteld saldo',signedMoney(m.saldo),'total');
      if(projection)h+=row('Verwacht saldo na deze maand','~ '+signedMoney(projection.saldo));
      if(m.contractCorrection)h+='<p class="help">De geraamde EB-teruggaaf bevat '+signedMoney(m.contractCorrection)+' contractcorrectie voor eerdere maanden.</p>';
      if(projection&&projection.contractCorrection)h+='<p class="help">De maandprognose bevat '+signedMoney(projection.contractCorrection)+' verwachte EB-contractcorrectie voor eerdere maanden.</p>';
      h+='</div></div>'+provisionalDetail(m)+'<p class="help">'+(s.vat?'Alle bovenstaande bedragen zijn inclusief btw; btw over de bronbedragen en opslag wordt niet nogmaals opgeteld.':'Vergelijking zonder btw; dit is geen factuurbedrag.')+' De 2 cent opslag zit al in de bron. Maandtotalen zijn op centen afgerond.</p></div>';
      return h;
    }
    function projectedMonths(statement,forecast){
      var today=iso(new Date()),known={},projected={};
      statement.months.forEach(function(m){known[m.month]=m;});
      if(forecast)beOvForecastLines(statement,forecast,today).forEach(function(delta){
        var old=known[delta.month],target=forecast.months.find(function(m){return m.month===delta.month;}),p=Object.assign({},target);
        ['stroom','vast','advance'].forEach(function(k){p[k]=delta[k]===null?null:Math.round((delta[k]+(old&&old.days?old[k]:0))*100)/100;});
        p.saldo=delta.saldo;p.forecast=true;p.total=Object.assign({},target.total);
        p.contractCorrection=p.stroom===null||target.stroom===null?null:Math.round((p.stroom-target.stroom)*100)/100;
        if(p.total.ebCreditShown!==null&&p.contractCorrection!==null)p.total.ebCreditShown+=p.contractCorrection;
        projected[p.month]=p;
      });
      return projected;
    }
    function monthStatement(statement,forecast,r){
      var today=iso(new Date()),current=today.slice(0,7),projected=projectedMonths(statement,forecast),max=1;
      statement.months.concat(Object.values(projected)).forEach(function(m){if(m.stroom!==null)max=Math.max(max,Math.abs(m.stroom));});
      function entries(m){var t=m.total,b=t.ebGrossShown===null?null:-(t.buyShown+t.ebGrossShown),v=t.ebCreditShown===null?null:t.sellShown+t.ebCreditShown;return [m.stroom,m.advance,m.vast,m.saldo];}
      function cells(m,p,future){var vals=entries(m),pv=p?entries(p):null;return vals.map(function(v,i){
        return '<td class="'+signedClass(v)+'">'+(future?'~ ':'')+signedMoney(v)+(pv?'<small class="forecast-value" title="Verwacht aan het einde van deze maand">~ '+signedMoney(pv[i])+'</small>':'')+'</td>';
      }).join('');}
      var html='<p class="help">Klik op een maandregel voor de uitsplitsing. Donker = bekend, licht = nog verwacht, ~ = prognose.</p><div class="table-wrap"><table class="month-statement"><colgroup><col class="month-plot-col"><col span="4" class="amount-col"></colgroup><thead><tr><th>Maand / stroomresultaat</th><th>Stroom</th><th>Voorschot</th><th>Vaste posten</th><th>Saldo opgeteld</th></tr></thead><tbody>';
      statement.months.forEach(function(m){
        var p=projected[m.month],future=!m.days;if(future&&!p)return;
        var shown=future?p:m,name=new Intl.DateTimeFormat('nl-NL',{month:'short',year:'numeric',timeZone:'UTC'}).format(beOvDate(m.month+'-01'));
        var fill=shown.stroom===null?0:Math.abs(shown.stroom)/max*100;
        var meter='<span style="width:'+fill+'%;background:'+(shown.stroom>=0?'var(--green)':'var(--red)')+';opacity:'+(future?'.35':'1')+'"></span>';
        if(p&&!future&&m.stroom!==null&&p.stroom!==null&&m.stroom*p.stroom>=0){var rest=Math.max(0,Math.abs(p.stroom)/max*100-fill);if(rest)meter+='<span class="forecast-tail" style="width:'+rest+'%;background:'+(p.stroom>=0?'var(--green)':'var(--red)')+'"></span>';}
        var notes=future?'verwachting':m.month===current?'Berekend t/m '+date(m.lastKnown||m.to):'';
        if(m.days&&m.count<m.days)notes+=(notes?' · ':'')+m.count+'/'+m.days+' dagen beschikbaar';
        if(m.provisional)notes+=(notes?' · ':'')+'Voorlopig: '+m.provisionalRows.map(function(d){return date(d.key);}).join(', ');
        var nextMonth=beOvDate(m.month+'-01');nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
        var monthFrom=m.month+'-01';if(monthFrom<r.a)monthFrom=r.a;
        var monthTo=beOvAdd(beOvISO(nextMonth),-1);if(monthTo>r.b)monthTo=r.b;
        function shortDay(k){return k.slice(8)+'-'+k.slice(5,7);}
        var periodLabel=shortDay(monthFrom)+' t/m '+shortDay(monthTo);
        var contract=beOvContract(monthFrom),edge=monthFrom===contract.begin?'Start '+monthFrom.split('-').reverse().join('-'):monthTo===contract.end?'Einde '+monthTo.split('-').reverse().join('-'):'';
        html+='<tr id="month-row-'+m.month+'" data-month="'+m.month+'" tabindex="0" aria-expanded="'+(expandedMonth===m.month)+'" aria-controls="detail-'+m.month+'" class="month-summary '+(future?'forecast-row':m.month===current?'current-month':'')+'"><td><div class="month-cell"><div class="month-name">'+('<button class="month-link" type="button" tabindex="-1" data-month="'+m.month+'" aria-expanded="'+(expandedMonth===m.month)+'" aria-controls="detail-'+m.month+'">'+(expandedMonth===m.month?'▾ ':'▸ ')+esc(name)+'</button>')+'<small class="month-dates">'+esc(periodLabel)+'</small>'+(edge?'<small class="contract-edge">'+esc(edge)+'</small>':'')+'</div><div class="month-meter" aria-hidden="true">'+meter+'</div></div>'+(notes?'<small class="month-progress">'+esc(notes)+'</small>':'')+'</td>'+cells(shown,future?null:p,future)+'</tr>';
        if(expandedMonth===m.month)html+='<tr id="detail-'+m.month+'" class="detail-row"><td colspan="5"><div id="reveal-'+m.month+'" class="detail-reveal">'+monthDetail(shown,future?null:p)+'</div></td></tr>';
      });
      function footer(label,data,approx){return '<tr class="'+(approx?'end-row':'known-row')+'"><td>'+label+'</td>'+['stroom','advance','vast','saldo'].map(function(k){return '<td class="'+signedClass(data[k])+'">'+(approx?'~ ':'')+signedMoney(data[k])+'</td>';}).join('')+'</tr>';}
      html+='</tbody><tfoot>'+footer('Stand t/m nu',statement,false);
      if(forecast)html+=footer('Prognose einde periode',forecast,true);
      return html+'</tfoot></table></div>';
    }
    function render(){
      if(!latest)return;
      if(latest.id!==verversKlantUitPad()){load();return;}
      var s=beOvSettings,all=beOvCalculate(latest.rows,s),r=latest.range,rows=selected(all,r),t=beOvTotal(rows);
      var today=iso(new Date()),yesterday=beOvAdd(today,-1),end=r.b<today?r.b:today,n=beOvDays(r.a,end);
      var historicEnd=r.b<yesterday?r.b:yesterday,historic=rows.filter(function(d){return d.key<=historicEnd;});
      var missing=Math.max(0,beOvDays(r.a,historicEnd)-historic.length),provisional=rows.filter(function(d){return d.voorlopig;});
      var partial=rows.some(function(d){return d.key<today&&d.deelresultaat;});
      var statement=beOvStatementData(all,r,s,end),f=beOvFixed(r.a,end,s),comparison=!s.tax||!s.vat;
      var ledgerRange=statementRange(r),ledgerEnd=ledgerRange.b<today?ledgerRange.b:today,ledgerStatement=beOvStatementData(all,ledgerRange,s,ledgerEnd);
      var forecast=beOvForecast(all,ledgerRange,s,today),prediction=null;
      var blocked=missing||latest.contextMissing||partial||latest.contextPartial||latest.errors.length;
      if(forecast.rows&&!blocked)prediction=beOvStatementData(forecast.rows,ledgerRange,s,ledgerRange.b);
      var cacheDays=provisional.filter(function(d){return d.eigenCache;}).map(function(d){return d.key;});
      var cacheText=cacheDays.length?' · '+(cacheDays.length>3?cacheDays.length+' dagen':cacheDays.map(function(key){return key.slice(8)+'/'+key.slice(5,7);}).join(', '))+' uit eigen cache (voorlopig)':'';
      var todayRow=rows.find(function(d){return d.key===today;}),timeText='';
      if(todayRow&&todayRow.eigenCache)timeText=' · vandaag gedeeltelijk, cache bijgewerkt '+new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(todayRow.bijgewerkt));
      status((latest.errors.length?latest.errors.join(' ')+' ':'')+rows.length+' van '+n+' verstreken dagen bekend'+cacheText+timeText+(missing?' · '+missing+' '+(missing===1?'dag ontbreekt':'dagen ontbreken'):'')+(partial?' · onvolledig dagdeel':''),!!(missing||latest.errors.length||partial));
      var summary='<div class="summary"><div><small>'+esc(s.paymentMode==='actual'?'Betaalde voorschotten':'Voorschotten t/m nu')+'</small><strong>'+signedMoney(ledgerStatement.advance)+'</strong></div><div><small>Stroom + vaste kosten</small><strong class="'+signedClass(ledgerStatement.full)+'">'+signedMoney(ledgerStatement.full)+'</strong></div><div><small>'+esc(comparison?'Vergelijkingssaldo':ledgerStatement.saldo===null?'Saldo nog onbekend':missing||partial||latest.errors.length?'Voorlopig deelsaldo':ledgerStatement.saldo>=0?'Te ontvangen t/m nu':'Te betalen t/m nu')+'</small><strong class="'+signedClass(ledgerStatement.saldo)+'">'+signedMoney(ledgerStatement.saldo)+'</strong></div></div>';
      var chartRows=chartData(rows,r);
      var buy=t.ebGrossShown===null?null:t.buyShown+t.ebGrossShown,sell=t.ebCreditShown===null?null:t.sellShown+t.ebCreditShown;
      var html='<section class="panel"><div class="section-head"><h2>Inkoop en verkoop</h2><div class="unit-switch" role="group" aria-label="Grafiekeenheid"><button type="button" data-chart-unit="eur" aria-pressed="'+(chartUnit==='eur')+'">Euro</button><button type="button" data-chart-unit="kwh" aria-pressed="'+(chartUnit==='kwh')+'">kWh</button></div><span class="badge">'+esc((s.tax?'Met EB':'Zonder EB')+' · '+(s.vat?'met btw':'zonder btw'))+'</span></div><div class="purchase-summary"><span>Inkoop <strong>'+money(buy)+'</strong></span><span>Verkoop <strong>'+money(sell)+'</strong></span><span>Stroom <strong class="'+signedClass(t.result)+'">'+signedMoney(rows.length?t.result:null)+'</strong></span></div><div class="chart">'+barChart(chartRows)+'</div><div class="legend"><span><i class="dot" style="background:var(--blue)"></i>'+(chartUnit==='eur'?'Inkoop':'Afname')+'</span><span><i class="dot" style="background:var(--green)"></i>'+(chartUnit==='eur'?'Verkoop':'Teruglevering')+'</span>'+(chartUnit==='eur'?'<span><i class="dot" style="background:var(--purple)"></i>Stroomresultaat</span>':'')+'</div><div class="chart-legend"><span class="chart-hint">Tik op een balk · klik voor vastzetten</span></div><p class="help">2 cent opslag incl. btw per kWh is inbegrepen bij inkoop én verkoop. '+(provisional.length?(chartRows.some(function(p){return p.key.length===10;})?'Arcering = eigen cache / voorlopig. ':'Inclusief voorlopige cachedagen. '):'')+'EB na saldering volgens de gekozen contractinstellingen.</p></section>';
      html+='<section class="panel"><h2>'+($('period').value==='month'?'Jouw contractmaandstaat':'Jouw maandstaat')+'</h2><p class="ledger-dates">'+date(ledgerRange.a)+' t/m '+date(ledgerRange.b)+'</p>'+summary+monthStatement(ledgerStatement,prediction,ledgerRange)+'<p class="help">Stroom = verkoop − inkoop (inclusief gekozen EB/btw). Vaste k. = belastingvermindering − levering − netbeheer. Saldo = opgeteld vanaf het begin van deze selectie. '+(s.paymentMode==='actual'?'Voorschotten zijn je ingevoerde betalingen.':'Voorschotten volgen je ingangsdatums, naar rato van dagen; geen bevestigde bankbetalingen.')+'</p>';
      if(prediction)html+='<p class="help">~ Seizoensraming met de maandfactoren uit 5.0 en '+forecast.base+' recente complete dagen.'+(forecast.history?' Beschikbare volledige maanden van vorig jaar wegen 60% mee.':' Geen volledige vergelijkbare maand van vorig jaar beschikbaar.')+' De eerste prognosemaand verwerkt ook de verwachte contractcorrectie voor saldering; het eindsaldo sluit daarop aan. Geen weers- of prijsvoorspelling.</p>';
      else if(forecast.reason!=='afgelopen')html+='<p class="help">'+(blocked?'Geen totaalprognose: ontbrekende of onvolledige historie. Een totaalprognose zou ontbrekende historie verbergen.':'Prognose beschikbaar vanaf 7 complete brondagen in de laatste 28 dagen.')+'</p>';
      if(comparison)html+='<p class="help">Zonder EB of btw is het saldo een vergelijking, geen factuurbedrag.</p>';
      if(todayRow&&(todayRow.deelresultaat||todayRow.voorlopig))html+='<p class="help">Vandaag is nog onvolledig. Vaste dagkosten en voorschot lopen t/m vandaag.'+(todayRow.prijsOnvolledig?' Niet alle gemeten stroom heeft al een prijs; alleen het geprijsde deel telt mee.':'')+'</p>';
      html+='</section>';
      $('content').innerHTML=html;
      if(chartUnit==='eur'&&chartRows.length&&chartRows[0].key.length===10)showChartTip(chartRows.length-1);
      var feeFactor=s.vat?1:1/BTW,feeImport=t.imp*.02*feeFactor,feeExport=t.exp*.02*feeFactor;
      var detail=row('Inkoop stroom zonder opslag',signedMoney(-(t.buyShown-feeImport)))+row('Opslag inkoop · '+fmt(t.imp)+' kWh × '+(s.vat?'€ 0,02000':'€ 0,0165289'),signedMoney(-feeImport))+row('EB over afname',signedMoney(t.ebGrossShown===null?null:-t.ebGrossShown))+row('Totaal inkoop inclusief gekozen EB',signedMoney(buy===null?null:-buy),'total')+
        row('Verkoop stroom vóór opslag',signedMoney(t.sellShown+feeExport))+row('Opslag verkoop · '+fmt(t.exp)+' kWh × '+(s.vat?'€ 0,02000':'€ 0,0165289'),signedMoney(-feeExport))+row('EB-verrekening saldering / tariefverdeling',signedMoney(t.ebCreditShown))+row('Netto verkoop inclusief gekozen EB',signedMoney(sell),'total')+
        row('Stroomresultaat',signedMoney(rows.length?t.result:null),'total')+row('Vaste levering',signedMoney(-f.supplier))+row('Netbeheer',signedMoney(-f.network))+row('Belastingvermindering',signedMoney(f.credit))+row('Maandafronding',signedMoney(statement.full===null||t.result===null||f.net===null?null:statement.full-t.result-f.net))+row('Voorschotten',signedMoney(statement.advance))+row($('period').value==='month'?'Deze maand erbij / eraf':'Saldo van deze selectie',signedMoney(statement.saldo),'total');
      detail+='<p class="help">De opslag is al verwerkt: € 0,02 incl. btw, of € 0,02 / 1,21 excl. btw. Saldering: '+(s.salderen?'aan':'uit')+' · opgegeven aandeel '+fmt(s.eligible,0)+'% · EB-tariefverdeling '+(s.taxAllocation==='afname'?'afnamegewogen':'tijdsevenredig')+'. Deze verrekening is een raming; de leveranciersnota is bepalend.</p>';
      $('calculation').innerHTML=detail;
    }
    function settingsUI() {
      var years=new Set([2025,2026,new Date().getFullYear(),new Date().getFullYear()+1]);
      var html='<form id="settings-form"><div class="grid settings-grid"><label>Aansluit-/contractstart<input id="cfg-start" type="date" value="'+iso(cfg.start)+'" required></label><label>Basisvoorschot per maand (€)<input id="cfg-advance" type="number" min="0" step="0.01" value="'+cfg.voorschot+'" required></label><label>Saldering volgens jouw contract<select id="cfg-salderen"><option value="aan">Tot 2027 salderen (contractvoorwaarden)</option><option value="uit">Niet verrekenen</option></select></label><label>Teruglevering die mag meetellen (%)<input id="cfg-eligible" type="number" min="0" max="100" step="1" value="'+beOvSettings.eligible+'" required></label><label>Vaste levering per dag, incl. btw (€)<input id="cfg-supplier" type="number" min="0" step="0.0001" value="'+beOvSettings.supplier+'" required></label><label>Netbeheer per dag, incl. btw (€)<input id="cfg-network" type="number" min="0" step="0.0001" value="'+beOvSettings.network+'" required></label></div>'+
        '<p class="help">De contractstart en voorschotten komen uit je bestaande instellingen. De dagbedragen zijn overgenomen uit de huidige plugin; controleer ze met je contract. Salderingsinstellingen en jaartarieven hieronder gelden alleen voor dit nieuwe overzicht. De bron splitst batterij- en zonneteruglevering niet uit.</p>'+
        '<label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input id="cfg-eligible-confirmed" type="checkbox">Deze saldeerbare hoeveelheid is bevestigd door mijn contract/nota</label><p class="help">De bron splitst duurzame en niet-duurzame teruglevering niet uit. Zonder bevestiging rekent deze raming met maximaal 5.000 kWh. Voor EB-verrekening moet de leverancier daadwerkelijk salderen op dezelfde kleine aansluiting.</p>'+
        '<div id="advance-history"></div><div class="grid settings-grid"><label>Voorschotten in het saldo<select id="cfg-payment-mode"><option value="schema">Maandbedragen naar rato van dagen</option><option value="actual">Mijn ingevoerde werkelijke betalingen</option></select></label><label>EB-verdeling bij jaarwisseling<select id="cfg-tax-allocation"><option value="tijd">Tijdsevenredige raming</option><option value="afname">Afnamegewogen raming</option></select></label></div>'+
        '<details><summary>Werkelijke voorschotbetalingen invoeren</summary><p class="help">Vul ontvangen betaalbewijzen over. Deze lokale lijst verandert geen incasso of bedrag bij de leverancier. Kies hierboven werkelijke betalingen om ze in het saldo te gebruiken.</p><div id="actual-payments"></div><button type="button" id="add-payment">+ Betaling toevoegen</button></details>'+
        '<h3 style="margin-top:18px">Jaartarieven voor het rekenmodel</h3><div class="table-wrap"><table><thead><tr><th>Jaar</th><th>EB excl. btw, €/kWh</th><th>Vaste belastingvermindering excl. btw, €/jaar</th></tr></thead><tbody>';
      Array.from(years).sort().forEach(function(y){html+='<tr><td>'+y+'</td><td><input aria-label="EB '+y+'" data-rate="'+y+'" type="number" min="0" max="10" step="0.00001" placeholder="Nog invullen" value="'+(beOvFinite(beOvSettings.rates[y])?beOvSettings.rates[y]:'')+'"></td><td><input aria-label="Belastingvermindering '+y+'" data-credit="'+y+'" type="number" min="0" step="0.01" placeholder="Nog invullen" value="'+(beOvFinite(beOvSettings.credit[y])?beOvSettings.credit[y]:'')+'"></td></tr>';});
      html+='</tbody></table></div><p class="help">2025: EB 0,10154 en vermindering 524,95; 2026: EB 0,09161 en vermindering 519,80 (excl. btw). De jaartarieven en de grens op 1 januari 2027 worden gescheiden. Hogere verbruiksschijven geven “Nog onbekend” in plaats van een onjuist bedrag. Kies de tariefverdeling die op je contract/nota staat; standaard is de raming tijdsevenredig.</p><div class="actions" style="margin-top:16px"><button class="primary" type="submit">Instellingen opslaan</button><span id="save-status" role="status"></span></div></form>';
      $('settings-body').innerHTML=html; $('cfg-salderen').value=beOvSettings.salderen?'aan':'uit';
      $('cfg-eligible-confirmed').checked=!!beOvSettings.eligibleConfirmed;
      beVoorschotInstellingen($('advance-history'));
      $('cfg-payment-mode').value=beOvSettings.paymentMode||'schema';$('cfg-tax-allocation').value=beOvSettings.taxAllocation||'tijd';
      function paymentRow(p){
        var div=document.createElement('div');div.className='payment-row';div.style.cssText='display:flex;gap:8px;margin:8px 0;align-items:center';
        var day=document.createElement('input'),amount=document.createElement('input'),remove=document.createElement('button');
        day.type='date';day.value=p.datum;day.max=iso(new Date());day.setAttribute('aria-label','Betaaldatum voorschot');
        amount.type='number';amount.min='0';amount.step='.01';amount.value=p.bedrag;amount.setAttribute('aria-label','Betaald voorschot in euro');
        remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Betaling verwijderen');remove.onclick=function(){div.remove();};
        day.style.minWidth=amount.style.minWidth='0';day.style.width=amount.style.width='42%';div.append(day,amount,remove);$('actual-payments').appendChild(div);
      }
      (((beOvSettings.payments||{})[KLANT])||[]).forEach(paymentRow);
      $('add-payment').onclick=function(){paymentRow({datum:iso(new Date()),bedrag:cfg.voorschot});};
      $('settings-form').onsubmit=function(e){e.preventDefault();
        try {
          var start=$('cfg-start').value,advance=+$('cfg-advance').value,eligible=+$('cfg-eligible').value,supplier=+$('cfg-supplier').value,network=+$('cfg-network').value;
          if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||beOvISO(beOvDate(start))!==start||start>iso(new Date()))throw Error('Vul een geldige contractstart op of vóór vandaag in.');
          if(![advance,eligible,supplier,network].every(beOvFinite)||advance<0||eligible<0||eligible>100||supplier<0||network<0)throw Error('Controleer de ingevulde bedragen en het percentage.');
          var history=beVoorschotValideer(Array.from($('advance-history').querySelectorAll('.be-vs-rijen>div')).map(function(d){var inputs=d.querySelectorAll('input');return {datum:inputs[0].value,bedrag:inputs[1].value};}));
          var payments=Object.assign({},beOvSettings.payments||{});
          payments[KLANT]=Array.from($('actual-payments').querySelectorAll('.payment-row')).map(function(div){var inputs=div.querySelectorAll('input'),day=inputs[0].value,value=inputs[1].value,amount=Number(value);
            if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||beOvISO(beOvDate(day))!==day||day>iso(new Date())||value===''||!beOvFinite(amount)||amount<0)throw Error('Controleer de betaaldatums en bedragen van de werkelijke betalingen.');return {datum:day,bedrag:amount};});
          var rates=Object.assign({},beOvSettings.rates),credits=Object.assign({},beOvSettings.credit);
          shadow.querySelectorAll('[data-rate],[data-credit]').forEach(function(input){var map=input.hasAttribute('data-rate')?rates:credits,year=input.dataset.rate||input.dataset.credit;
            if(input.value===''){map[year]=null;return;}var value=+input.value;if(!beOvFinite(value)||value<0)throw Error('Een jaartarief moet nul of positief zijn.');map[year]=value;});
          cfg.start=new Date(start+'T00:00:00');cfg.voorschot=advance;cfg.voorschotHistorie=history;
          localStorage.setItem(LS.startdatum,start);localStorage.setItem(LS.voorschot,String(advance));localStorage.setItem('be_cfg_voorschot_historie',JSON.stringify(history));
          Object.assign(beOvSettings,{schema:2,eligible:eligible,eligibleConfirmed:$('cfg-eligible-confirmed').checked,supplier:supplier,network:network,salderen:$('cfg-salderen').value==='aan',rates:rates,credit:credits,payments:payments,paymentMode:$('cfg-payment-mode').value,taxAllocation:$('cfg-tax-allocation').value});save();
          $('save-status').textContent='Opgeslagen.';
          var selectedYear=$('year').value;$('year').innerHTML='';for(var y=cfg.start.getFullYear();y<=new Date().getFullYear()+1;y++)$('year').add(new Option(String(y),String(y)));$('year').value=selectedYear;
          if(!$('year').value)$('year').value=String(new Date().getFullYear());
          $('contract').innerHTML=contractOptions();$('contract').value=String(beOvContract(iso(new Date())).index);updateFilters();cache.clear();load();
        } catch(err){$('save-status').textContent=err.message;}
      };
    }
    function exportCSV() {
      if(!latest)return;
      var rows=selected(beOvCalculate(latest.rows,beOvSettings),latest.range),basis=(beOvSettings.tax?'met EB':'zonder EB')+'; '+(beOvSettings.vat?'met btw':'zonder btw');
      var out=[];
      rows.forEach(function(r){out.push({'Datum':r.key,'Afname kWh':r.imp,'Teruglevering kWh':r.exp,'Inkoop EUR':r.buyShown,'Verkoop EUR':r.sellShown,'EB model EUR':r.ebShown,'Variabel resultaat EUR':r.result,'Salderingscontract vanaf':r.contract,'Voorlopig':r.voorlopig?'ja':'nee','Eigen cache':r.eigenCache?'ja':'nee','Onvolledig dagdeel':r.deelresultaat?'ja':'nee','Prijzen onvolledig':r.prijsOnvolledig?'ja':'nee','Cache bijgewerkt':r.bijgewerkt?new Date(r.bijgewerkt).toISOString():'','Weergave':basis});});
      beCsvSlaOp('Balans-Energieoverzicht-'+latest.range.a+'-tot-'+latest.range.b+'.csv',out);
    }
    function restoreMobileNavigation(){
      mobileChrome.forEach(function(pair){var node=pair[0];pair[1].forEach(function(p){if(p[1])node.style.setProperty(p[0],p[1],p[2]);else node.style.removeProperty(p[0]);});});
      mobileChrome=[];mobileHeader=null;mobileSidebar=null;
    }
    function showBackground(show){
      inertNodes.forEach(function(pair){
        var style=pair[0].style;
        if(!show){
          if(!pair[2])pair[2]=[style.getPropertyValue('display'),style.getPropertyPriority('display')];
          style.setProperty('display','none','important');
        }else if(pair[2]){
          if(pair[2][0])style.setProperty('display',pair[2][0],pair[2][1]);else style.removeProperty('display');
          pair.pop();
        }
      });
    }
    function preserveMobileNavigation(){
      var toggle=innerWidth<768&&document.querySelector('[data-bs-target="#mobileSidebar"]');
      var header=toggle&&toggle.closest('header,nav,.navbar'),menu=toggle&&document.querySelector('#mobileSidebar');
      if(!header){restoreMobileNavigation();return false;}
      if(header!==mobileHeader||menu!==mobileSidebar){
        restoreMobileNavigation();mobileHeader=header;mobileSidebar=menu;
        [[header,['position','top','left','right','z-index']],[menu,['position','top','left','z-index','min-height','max-height','overflow-y']]].forEach(function(pair){
          if(pair[0])mobileChrome.push([pair[0],pair[1].map(function(key){return [key,pair[0].style.getPropertyValue(key),pair[0].style.getPropertyPriority(key)];})]);
        });
      }
      function set(node,key,value){if(node.style.getPropertyValue(key)!==value||node.style.getPropertyPriority(key)!=='important')node.style.setProperty(key,value,'important');}
      set(header,'position','static');set(header,'top','auto');set(header,'left','auto');set(header,'right','auto');set(header,'z-index','1042');
      if(menu){set(menu,'position','static');set(menu,'top','auto');set(menu,'left','auto');set(menu,'z-index','1043');set(menu,'min-height','0px');set(menu,'max-height','none');set(menu,'overflow-y','visible');}
      return true;
    }
    function makeBackgroundInert(node){
      var toggle=document.querySelector('[data-bs-target="#mobileSidebar"]');
      var protectedNodes=[root,mobileHeader,mobileSidebar,fallback,document.querySelector('#mobileSidebar'),toggle&&toggle.closest('header,nav,.navbar')].concat(navLinks.map(function(a){return a.closest('nav,aside,.sidebar,.sidenav,#sidebar,#mobileSidebar,.nav')||a;})).filter(Boolean);
      if(protectedNodes.includes(node)||inertNodes.some(function(pair){return pair[0]===node;}))return;
      if(protectedNodes.some(function(p){return node.contains(p);}))Array.from(node.children).forEach(makeBackgroundInert);
      else{inertNodes.push([node,node.inert]);node.inert=true;}
    }
    function layout() {
      if(!root||!opened)return;
      var anchor=navLinks.find(function(a){var r=a.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth;})||(navAnchor&&navAnchor.isConnected?navAnchor:null), container=anchor&&anchor.closest('nav,aside,.sidebar,.sidenav,#sidebar,.offcanvas,.nav');
      var left=0;
      while(innerWidth>=768&&container&&container!==document.body){var rect=container.getBoundingClientRect();if(rect.width>80&&rect.width<440&&rect.height>180&&rect.left<120&&rect.right<innerWidth*.6){left=Math.max(left,rect.right);}container=container.parentElement;}
      root.style.left=Math.round(left)+'px';
      var nativeMenu=preserveMobileNavigation();
      // Mobile uses the document's scroll so the real menu and our title leave together.
      var mobile=innerWidth<768,height=mobileHeader?Math.ceil(mobileHeader.getBoundingClientRect().height):0;
      root.style.position=mobile?'relative':'fixed';root.style.top=mobile?'auto':'0px';root.style.bottom=mobile?'auto':'0px';
      root.style.overflow=mobile?'visible':'auto';root.style.minHeight=mobile?'calc(100dvh - '+height+'px)':'0px';
      root.style.overscrollBehavior=mobile?'auto':'contain';
      showBackground(!mobile);
      $('mobile-menu').hidden=nativeMenu||innerWidth>=768||!document.querySelector('[data-bs-target="#mobileSidebar"]');
      if(fallback)fallback.style.display=opened?'none':'';
    }
    function open(push,source) {
      if(source)navAnchor=source;
      if(!root)mount();
      var mobileToggle=document.querySelector('[data-bs-target="#mobileSidebar"][aria-expanded="true"]');
      if(innerWidth<768&&mobileToggle)mobileToggle.click();
      if(opened){layout();return;}
      previousFocus=document.activeElement;pageScrollBefore=[window.scrollX,window.scrollY];oldHash=location.hash===HASH?'':location.hash;
      if(push&&location.hash!==HASH)history.pushState({beEnergyOverview:true},'',location.pathname+location.search+HASH);
      root.hidden=false;opened=true;theme();layout();
      document.querySelectorAll('main,[role="main"],.main-content,.content-wrapper').forEach(makeBackgroundInert);
      var nativeCard=document.querySelector('.results-summary-card,.energy-chart-legend');
      if(nativeCard&&!nativeCard.contains(root)&&!nativeCard.contains(navAnchor)){
        var nativeContent=nativeCard;
        while(nativeContent.parentElement&&nativeContent.parentElement!==document.body&&!nativeContent.parentElement.contains(root)&&!nativeContent.parentElement.contains(navAnchor))nativeContent=nativeContent.parentElement;
        makeBackgroundInert(nativeContent);
      }
      if(navAnchor){
        menuActiveBefore=Array.from(document.querySelectorAll('a.active')).filter(function(a){return !navLinks.includes(a)&&a.closest('nav,aside,.sidebar,.sidenav,#sidebar,.nav');}).map(function(a){var old=a.className;a.className=old.replace(/\bactive\b/g,'').trim();return [a,old];});
        navLinks.forEach(function(a){a.className=a.className.replace(/\bactive\b/g,'').trim()+' active';a.setAttribute('aria-current','page');});
      }
      showBackground(innerWidth>=768);
      if(innerWidth<768){$('title').focus({preventScroll:true});window.scrollTo(0,0);}else $('title').focus();
      load();
    }
    function close() {
      if(!opened)return;
      serial++;opened=false;root.hidden=true;
      restoreMobileNavigation();
      showBackground(true);
      inertNodes.forEach(function(pair){pair[0].inert=pair[1];});inertNodes=[];
      if(location.hash===HASH)history.replaceState(history.state,'',location.pathname+location.search+oldHash);
      navLinks.forEach(function(a){a.removeAttribute('aria-current');a.className=a.className.replace(/\bactive\b/g,'').trim();});
      menuActiveBefore.forEach(function(pair){if(pair[0].isConnected)pair[0].className=pair[1];});menuActiveBefore=[];
      if(fallback)fallback.style.display='';
      var mobileToggle=innerWidth<768&&document.querySelector('[data-bs-target="#mobileSidebar"]');
      if(mobileToggle)mobileToggle.focus({preventScroll:true});else if(previousFocus&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
      if(pageScrollBefore){window.scrollTo(pageScrollBefore[0],pageScrollBefore[1]);pageScrollBefore=null;}
    }
    function addMenu() {
      var candidates=Array.from(document.querySelectorAll('a[href*="/results"]')).filter(function(a){return !a.closest('#be-energieoverzicht');});
      if(!geldigeKlant(KLANT))verversKlantUitPad();
      navLinks=navLinks.filter(function(a){return a.isConnected;});
      candidates.forEach(function(anchor){
        var list=anchor.closest('ul,ol,nav,aside,.sidebar,.sidenav,#sidebar,#mobileSidebar,.nav')||anchor.parentElement;
        if(navLinks.some(function(a){return list.contains(a);}))return;
        var link=document.createElement('a');link.id='be-energieoverzicht-link'+(menuSerial?'-'+menuSerial:'');menuSerial++;
        link.href=HASH;link.setAttribute('data-be-financial-link','');
        link.className=anchor.className.replace(/\bactive\b/g,'').trim();
        var icon=anchor.querySelector&&anchor.querySelector('svg');
        link.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="M17 6.5a6 6 0 1 0 0 11M4 10h9M4 14h8"/></svg><span>Financieel</span>';
        if(icon){var ownIcon=link.querySelector('svg');ownIcon.setAttribute('class',icon.getAttribute('class')||'');ownIcon.setAttribute('width',icon.getAttribute('width')||'24');ownIcon.setAttribute('height',icon.getAttribute('height')||'24');}
        link.title='Inkoop, verkoop, saldering en prognose in begrijpelijke taal';link.style.cssText='display:flex;align-items:center;gap:12px;white-space:normal';
        link.addEventListener('click',function(e){e.preventDefault();open(true,link);});
        if(anchor.parentElement.tagName==='LI'){var li=document.createElement('li');li.className=anchor.parentElement.className.replace(/\bactive\b/g,'').trim();li.appendChild(link);anchor.parentElement.insertAdjacentElement('afterend',li);}
        else anchor.insertAdjacentElement('afterend',link);
        navLinks.push(link);if(!navAnchor||!navAnchor.isConnected)navAnchor=link;
        if(opened){link.setAttribute('aria-current','page');link.className+=' active';}
      });
      if(navLinks.length&&fallback){fallback.remove();fallback=null;}layout();
    }
    function maintain() {
      addMenu();
      if(location.hash===HASH&&!opened)open(false);
      else if(location.hash!==HASH&&opened)close();
      if(opened){
        layout();
        if(latest&&(latest.id!==verversKlantUitPad()||latest.day!==iso(new Date())))load();
        else if(latest&&!document.hidden&&Date.now()-ownRefreshAt>=60000)refreshOwnCache();
      }
    }
    // Een link blijft beschikbaar wanneer de site een ander menu gebruikt.
    setTimeout(function(){
      addMenu();if(!navAnchor&&!fallback){fallback=document.createElement('a');fallback.href=HASH;fallback.textContent='€ Financieel';fallback.style.cssText='position:fixed;z-index:1041;left:12px;bottom:20px;padding:12px 16px;border-radius:10px;background:#65419d;color:#fff;font:600 14px system-ui;text-decoration:none;box-shadow:0 3px 12px #0003';fallback.onclick=function(e){e.preventDefault();open(true);};document.body.appendChild(fallback);}
    },1500);
    document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(opened&&a&&!navLinks.includes(a)&&a!==fallback&&!root.contains(a)&&a.getAttribute('href')!==HASH)close();},true);
    document.addEventListener('wheel',function(e){
      if(!opened||!root||e.ctrlKey||!e.deltaY||e.clientX>=root.getBoundingClientRect().left)return;
      var factor=e.deltaMode===1?18:e.deltaMode===2?(root.clientHeight||innerHeight):1;
      root.scrollTop+=e.deltaY*factor;e.preventDefault();
    },{passive:false});
    window.addEventListener('hashchange',maintain);window.addEventListener('popstate',maintain);
    window.addEventListener('resize',function(){clearTimeout(layoutTimer);layoutTimer=setTimeout(layout,50);});
    document.addEventListener('be-dark-change',theme);
    setInterval(maintain,1500);maintain();
  }
