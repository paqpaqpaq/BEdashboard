// ==UserScript==
// @name         Balansenergie All-in v6.1.5
// @namespace    paq.balansenergie
// @version      6.1.5
// @description  Financieel overzicht, onafhankelijke Coulombtelling in/uit met instelbare accucapaciteit, BID-historie, EPEX, darkmode en kwartier-CSV voor het Balansenergie-dashboard.
// @homepageURL  https://github.com/paqpaqpaq/BEdashboard
// @updateURL    https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.meta.js
// @downloadURL  https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js
// @supportURL   https://github.com/paqpaqpaq/BEdashboard/issues
// @match        *://dashboard.balansenergie.nl/*
// @run-at       document-start
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      public.api.energyzero.nl
// ==/UserScript==
(function () {
  'use strict';
  if (window.__beSocDisplayGuard615) return;
  window.__beSocDisplayGuard615 = true;
  const id = 'be-soc-display-guard-615';
  const duplicate = '[data-be-soc-legend="soc-chart"]';
  // Run before Chart.js, cached SOC data, or the mobile layout is ready.
  // The second selector also overrides the legacy display:contents rule.
  const css = 'html ' + duplicate + ',html [data-be-soc-compact]>' + duplicate +
    '{display:none!important}';
  let queued = false;
  function repair() {
    queued = false;
    const host = document.head || document.documentElement;
    if (!host) return;
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      host.appendChild(style);
    } else if (style.textContent !== css) style.textContent = css;
    document.querySelectorAll(duplicate).forEach(row => row.remove());
  }
  function schedule() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(repair);
  }
  new MutationObserver(records => {
    if (!document.getElementById(id) || records.some(record =>
      record.type === 'attributes' || Array.from(record.addedNodes).some(node =>
        node.nodeType === 1 && (node.matches?.(duplicate) || node.querySelector?.(duplicate))
      )
    )) schedule();
  }).observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-be-soc-legend']});
  document.addEventListener('DOMContentLoaded', repair, {once: true});
  window.addEventListener('pageshow', repair);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) repair(); });
  repair();
})();


(function () {
  'use strict';

  // Leesbare dashboardcode; injectie behoudt toegang tot de paginagrafieken.
  // De EPEX-uitbreiding hieronder behoudt zijn Userscripts-rechten.
  function dashboardCode() {
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
    '6.1.5'
  );

  // Colour-only theme: never alter dimensions, typography, positioning or SVG paths.
  var BE_DARK_KEY = 'be_cfg_darkmode';
  var beDarkOn = localStorage.getItem(BE_DARK_KEY) === 'aan';
  var beDarkSheet, beDarkObserver, beDarkTimer, beDarkPending = new Set();
  var beDarkRules = new Map();
  function beDarkColor(value, kind) {
    if (typeof value !== 'string') return value;
    value=value.trim();
    if(value==='white')value='rgb(255,255,255)';
    if(value==='black')value='rgb(0,0,0)';
    if(/^#[0-9a-f]{3,8}$/i.test(value)){
      var hex=value.slice(1);if(hex.length===3||hex.length===4)hex=hex.split('').map(function(c){return c+c;}).join('');
      value='rgba('+[0,2,4].map(function(i){return parseInt(hex.slice(i,i+2),16);}).join(',')+','+(hex.length===8?parseInt(hex.slice(6,8),16)/255:1)+')';
    }
    var srgb=value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
    if(srgb)value='rgba('+[1,2,3].map(function(i){return Math.round(+srgb[i]*255);}).join(',')+','+(srgb[4]||1)+')';
    var m=value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
    if(!m)return value;
    var r=+m[1],g=+m[2],b=+m[3],a=m[4]==null?1:+m[4];
    if(!a)return value;
    var hi=Math.max(r,g,b),lo=Math.min(r,g,b),light=(r+g+b)/3;
    var neutral=hi-lo<48;
    var out;
    if(kind==='background') {
      if(r>b*.85&&b>r*.75&&b>g*1.12&&hi-lo>48)out=[139,115,78];
      else if(light>180)out=light>245?[55,50,43]:[69,64,54];
      else if(neutral&&light>95)out=[78,71,60];
    } else if(kind==='border') {
      if(light>150)out=[103,94,79];
    } else {
      if(neutral)out=light<90?[232,225,213]:light<205?[191,182,165]:null;
      else if(r>b*.85&&b>r*.75&&b>g*1.12){out=[203,181,143];}
      else if(g>r*1.15&&g>b*1.05){out=[51,192,113];}
      else if(r>g*1.4&&r>b*1.2){out=[242,79,91];}
      else if(light<190) {
        // Lift existing hue rather than replacing status/series colours.
        var t=light<80?.55:.40;
        out=[r,g,b].map(function(v){return Math.round(v+(255-v)*t);});
      }
    }
    return out?'rgba('+out.join(',')+','+a+')':value;
  }
  function beDarkRefresh() {
    if(!beDarkOn||!beDarkSheet)return;
    var roots=Array.from(beDarkPending);beDarkPending.clear();
    // Read the site's original colours synchronously; no unthemed frame is painted.
    beDarkSheet.disabled=true;
    var updates=[];
    try {
      var seen=new Set();
      roots.forEach(function(root){
        if(!root.isConnected)return;
        [root].concat(Array.from(root.querySelectorAll('*'))).forEach(function(e){
          if(seen.has(e)||/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|CANVAS)$/.test(e.tagName))return;
          seen.add(e);
          var c=getComputedStyle(e),rules=[];
          function add(prop,val,kind){var next=beDarkColor(val,kind);if(next!==val)rules.push(prop+':'+next+'!important');}
          add('color',c.color,'text');add('background-color',c.backgroundColor,'background');
          ['Top','Right','Bottom','Left'].forEach(function(side){add('border-'+side.toLowerCase()+'-color',c['border'+side+'Color'],'border');});
          if(e.namespaceURI==='http://www.w3.org/2000/svg') {add('fill',c.fill,'text');add('stroke',c.stroke,'text');}
          // Preserve gradients and dotted patterns; change only their colour stops.
          if(c.backgroundImage&&c.backgroundImage!=='none'){
            var bg=c.backgroundImage.replace(/(?:rgba?|color)\([^)]*\)|#[0-9a-f]{3,8}\b|\bwhite\b/gi,function(v){return beDarkColor(v,'background');});
            if(bg!==c.backgroundImage)rules.push('background-image:'+bg+'!important');
          }
          if(c.boxShadow&&c.boxShadow!=='none')rules.push('box-shadow:'+c.boxShadow.replace(/rgba?\([^)]*\)/g,'rgba(0,0,0,.18)')+'!important');
          // Keep toggle thumbs white; track hue and position communicate state.
          var width=parseFloat(c.width),height=parseFloat(c.height),radius=parseFloat(c.borderRadius);
          if(c.position==='absolute'&&width<=24&&height<=24&&radius>=6&&e.parentElement){
            var pc=getComputedStyle(e.parentElement);
            if(pc.position==='relative'&&parseFloat(pc.width)>=28&&parseFloat(pc.width)<=60&&parseFloat(pc.height)<=32)
              rules.push('background-color:#eee7da!important','box-shadow:0 1px 3px #0008!important');
          }
          if(c.position==='relative'&&width>=28&&width<=60&&height>=16&&height<=32&&radius>=8&&e.firstElementChild){
            var tc=getComputedStyle(e.firstElementChild);
            if(tc.position==='absolute'){
              var child=e.firstElementChild, explicit=e.getAttribute('aria-checked');
              var targetTransform=child.style.transform, targetLeft=child.style.left;
              var shift=targetTransform.match(/translateX\(\s*([-\d.]+)/);
              var on=explicit!==null?explicit==='true':shift?+shift[1]>5:targetLeft?parseFloat(targetLeft)>5:parseFloat(tc.left)>5||(/matrix\(/.test(tc.transform)&&parseFloat(tc.transform.split(',')[4])>5);
              rules.push('background-color:'+(on?'#9d8764':'#59554e')+'!important','border-color:#b3a58d!important');
            }
          }
          if(parseFloat(c.borderRadius)>=6&&parseFloat(c.borderTopWidth)>0&&width>160&&height>45)
            rules.push('background-color:#454036!important','background-image:none!important');
          updates.push([e,rules.join(';'),'']);
          ['::before','::after'].forEach(function(pseudo){
            var pc=getComputedStyle(e,pseudo);if(pc.content==='none'||pc.content==='normal')return;
            var pr=[],pb=beDarkColor(pc.backgroundColor,'background');
            if(pb!==pc.backgroundColor)pr.push('background-color:'+pb+'!important');
            var pi=pc.backgroundImage.replace(/(?:rgba?|color)\([^)]*\)|#[0-9a-f]{3,8}\b|\bwhite\b/gi,function(v){return beDarkColor(v,'background');});
            if(pi!==pc.backgroundImage)pr.push('background-image:'+pi+'!important');
            updates.push([e,pr.join(';'),pseudo]);
          });
        });
      });
    } finally {beDarkSheet.disabled=false;}
    updates.forEach(function(pair){
      var e=pair[0],rule=pair[1],pseudo=pair[2]||'',attr='data-be-dark-colors'+pseudo.replace('::','-');if(!rule){e.removeAttribute(attr);return;}
      var id=beDarkRules.get(pseudo+rule);
      if(!id){id='c'+beDarkRules.size;beDarkRules.set(pseudo+rule,id);beDarkSheet.sheet.insertRule('html[data-be-dark="aan"] ['+attr+'="'+id+'"]'+pseudo+'{'+rule+'}',beDarkSheet.sheet.cssRules.length);}
      if(e.getAttribute(attr)!==id)e.setAttribute(attr,id);
    });
  }
  function beDarkQueue(root){
    if(!beDarkOn||!root||root.nodeType!==1||/^(SCRIPT|STYLE)$/.test(root.tagName))return;
    beDarkPending.add(root);
    if(!beDarkTimer){beDarkTimer=true;queueMicrotask(function(){beDarkTimer=null;beDarkRefresh();});}
  }
  function beDarkApply(on){
    beDarkOn=!!on;localStorage.setItem(BE_DARK_KEY,on?'aan':'uit');
    document.documentElement.setAttribute('data-be-dark',on?'aan':'uit');
    if(on&&document.body){beDarkPending.add(document.body);beDarkRefresh();}
    document.dispatchEvent(new Event('be-dark-change'));
  }
  function beDarkInit(){
    beDarkSheet=document.createElement('style');beDarkSheet.id='be-dark-style';
    beDarkSheet.textContent='html[data-be-dark="aan"]{color-scheme:dark;background:#2c2924!important}html[data-be-dark="aan"] body{background-color:#2c2924!important;color:#dddfe3!important}html[data-be-dark="aan"] .summary-compact-metric{background:#454036!important;background-image:none!important;border-color:#675e4f!important}html[data-be-dark="aan"] .summary-compact-label{color:#bfb6a5!important}html[data-be-dark="aan"] body .summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric{background:#454036!important;background-image:none!important;border-color:#675e4f!important;color:#e8e1d5!important}html[data-be-dark="aan"] body .summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric.summary-compact-metric .summary-compact-label{color:#bfb6a5!important}html[data-be-dark="aan"] body :is(nav,.sidebar,.sidenav){background:#211e1a!important}html[data-be-dark="aan"] #be-panelen table tr:nth-child(odd){background:#37332c!important}html[data-be-dark="aan"] #be-panelen table tr:nth-child(even){background:#454035!important}html[data-be-dark="aan"] #be-panelen details{background:#373229!important}html[data-be-dark="aan"] #be-panelen summary{color:#bfb6a5!important}html[data-be-dark="aan"] #be-panelen details>div:first-of-type>div:nth-child(odd){background:#37332c!important}html[data-be-dark="aan"] #be-panelen details>div:first-of-type>div:nth-child(even){background:#454035!important}html[data-be-dark="aan"] body :is(nav,.sidebar,.sidenav) a{color:#e8e1d5!important}html[data-be-dark="aan"] body :is(nav,.sidebar,.sidenav) a:hover{background:#514838!important;color:#f0e8da!important}html[data-be-dark="aan"] body :is(nav,.sidebar,.sidenav) a:is(.active,[aria-current="page"]),html[data-be-dark="aan"] body :is(.nav-link.active,.btn-primary,.btn-check:checked+.btn,[aria-pressed="true"],[aria-selected="true"]){background:#8b734e!important;border-color:#ad946b!important;color:#fff3dd!important}html[data-be-dark="aan"] body :is(.btn-light,.btn-outline-primary){background:#454036!important;border-color:#675e4f!important;color:#e8e1d5!important}';
    document.documentElement.appendChild(beDarkSheet);
    beDarkObserver=new MutationObserver(function(records){records.forEach(function(r){
      if(r.type==='attributes')beDarkQueue(r.target.parentElement||r.target);
      else r.addedNodes.forEach(beDarkQueue);
    });});
    beDarkObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
    window.addEventListener('resize',function(){beDarkQueue(document.body);});
    var bridge=document.createElement('script');bridge.textContent="(function(){\n if(window.__beDarkCanvas)return;window.__beDarkCanvas=true;\nfunction beDarkColor(value, kind) {\n    if (typeof value !== 'string') return value;\n    value=value.trim();\n    if(value==='white')value='rgb(255,255,255)';\n    if(value==='black')value='rgb(0,0,0)';\n    if(/^#[0-9a-f]{3,8}$/i.test(value)){\n      var hex=value.slice(1);if(hex.length===3||hex.length===4)hex=hex.split('').map(function(c){return c+c;}).join('');\n      value='rgba('+[0,2,4].map(function(i){return parseInt(hex.slice(i,i+2),16);}).join(',')+','+(hex.length===8?parseInt(hex.slice(6,8),16)/255:1)+')';\n    }\n    var srgb=value.match(/^color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\)$/);\n    if(srgb)value='rgba('+[1,2,3].map(function(i){return Math.round(+srgb[i]*255);}).join(',')+','+(srgb[4]||1)+')';\n    var m=value.match(/^rgba?\\(\\s*([\\d.]+)[, ]+([\\d.]+)[, ]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+))?\\s*\\)$/);\n    if(!m)return value;\n    var r=+m[1],g=+m[2],b=+m[3],a=m[4]==null?1:+m[4];\n    if(!a)return value;\n    var hi=Math.max(r,g,b),lo=Math.min(r,g,b),light=(r+g+b)/3;\n    var neutral=hi-lo<48;\n    // Data colours retain their identity; theme only neutral chart surfaces.\n    if(hi-lo>=48){\n      var data;\n      if(r>g*1.4&&r>b*1.2)data=g>75&&g>b*1.5?[236,165,36]:[242,79,91];\n      else if(g>r*1.15&&g>b*1.05)data=[51,192,113];\n      else if(b>r*1.15&&g>r*1.1)data=[49,173,222];\n      else if(r>b*.85&&b>r*.75&&b>g*1.12)data=[203,181,143];\n      if(data)return 'rgba('+data.join(',')+','+(kind==='background'?Math.max(a,.72):a)+')';\n    }\n    var out;\n    if(kind==='background') {\n      if(light>180)out=light>245?[55,50,43]:[69,64,54];\n      else if(neutral&&light>95)out=[78,71,60];\n    } else if(kind==='border') {\n      if(light>150)out=[103,94,79];\n    } else {\n      if(neutral)out=light<90?[232,225,213]:light<205?[191,182,165]:null;\n      else if(r>b*.85&&b>r*.75&&b>g*1.12){out=[203,181,143];}\n      else if(g>r*1.15&&g>b*1.05){out=[51,192,113];}\n      else if(r>g*1.4&&r>b*1.2){out=[242,79,91];}\n      else if(light<190) {\n        // Lift existing hue rather than replacing status/series colours.\n        var t=light<80?.55:.40;\n        out=[r,g,b].map(function(v){return Math.round(v+(255-v)*t);});\n      }\n    }\n    return out?'rgba('+out.join(',')+','+a+')':value;\n  }\n function map(v,kind){\n  if(typeof v!=='string')return v;\n  if(/^#[0-9a-f]{6}$/i.test(v))v='rgb('+[1,3,5].map(function(i){return parseInt(v.slice(i,i+2),16);}).join(',')+')';\n  if(/^#[0-9a-f]{3}$/i.test(v))v='rgb('+[1,2,3].map(function(i){return parseInt(v[i]+v[i],16);}).join(',')+')';\n  return beDarkColor(v,kind);\n }\n var p=CanvasRenderingContext2D.prototype;\n ['fill','fillRect','fillText','stroke','strokeRect','strokeText'].forEach(function(name){\n  var original=p[name];if(!original)return;\n  p[name]=function(){\n   if(document.documentElement.getAttribute('data-be-dark')!=='aan')return original.apply(this,arguments);\n   var prop=name.indexOf('stroke')===0?'strokeStyle':'fillStyle',old=this[prop];\n   var kind=name.indexOf('Text')!==-1?'text':name.indexOf('stroke')===0?(this.lineWidth<1.5?'border':'text'):'background';\n   this[prop]=map(old,kind);\n   try{return original.apply(this,arguments);}finally{this[prop]=old;}\n  };\n });\n document.addEventListener('be-dark-change',function(){\n  if(typeof Chart==='undefined'||!Chart.getChart)return;\n  document.querySelectorAll('canvas').forEach(function(cv){var c=Chart.getChart(cv);if(c)c.draw();});\n });\n})();\n";
    document.documentElement.appendChild(bridge);bridge.remove();
    beDarkApply(beDarkOn);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',beDarkInit,{once:true});else beDarkInit();

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
    voorschotHistorie: (function(){try{return beVoorschotValideer(JSON.parse(localStorage.getItem('be_cfg_voorschot_historie')||'[]'));}catch(e){return [];}})(),
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
    allin: localStorage.getItem(LS.allin) === 'aan',
    resultaatBelastingen: localStorage.getItem('be_cfg_resultaat_belastingen') !== 'uit'
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

  function datumPlusMaanden(d, aantal) {
    var jaar =
      d.getFullYear();

    var maand =
      d.getMonth() + aantal;

    var laatsteDag =
      new Date(
        jaar,
        maand + 1,
        0
      ).getDate();

    return new Date(
      jaar,
      maand,
      Math.min(
        d.getDate(),
        laatsteDag
      )
    );
  }

  function datumDagNummer(d) {
    return Math.floor(
      Date.UTC(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
      ) /
      86400000
    );
  }

  function contractVoortgang(start, nu) {
    var begin =
      new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate()
      );

    var vandaag =
      new Date(
        nu.getFullYear(),
        nu.getMonth(),
        nu.getDate()
      );

    var grens =
      datumPlusMaanden(
        begin,
        12
      );

    var totaalDagen =
      datumDagNummer(grens) -
      datumDagNummer(begin);

    var verstrekenDagen =
      Math.max(
        0,
        Math.min(
          totaalDagen,
          datumDagNummer(vandaag) -
          datumDagNummer(begin)
        )
      );

    var maanden =
      (
        vandaag.getFullYear() -
        begin.getFullYear()
      ) *
      12 +
      vandaag.getMonth() -
      begin.getMonth();

    maanden =
      Math.max(
        0,
        Math.min(
          12,
          maanden
        )
      );

    var maandAnker =
      datumPlusMaanden(
        begin,
        maanden
      );

    if (
      maanden > 0 &&
      datumDagNummer(maandAnker) >
        datumDagNummer(vandaag)
    ) {
      maanden--;
      maandAnker =
        datumPlusMaanden(
          begin,
          maanden
        );
    }

    var restDagen =
      vandaag < begin ||
      vandaag >= grens
        ? 0
        : Math.max(
            0,
            datumDagNummer(vandaag) -
            datumDagNummer(maandAnker)
          );

    var pctExact =
      totaalDagen > 0
        ? verstrekenDagen /
          totaalDagen *
          100
        : 0;

    return {
      grens: grens,
      totaalDagen: totaalDagen,
      verstrekenDagen: verstrekenDagen,
      contractDag:
        vandaag < begin
          ? 0
          : Math.min(
              totaalDagen,
              verstrekenDagen + 1
            ),
      maanden: maanden,
      restDagen: restDagen,
      pctExact: pctExact,
      gestart: vandaag >= begin,
      voltooid: vandaag >= grens
    };
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
  // Historical quotes are recovered from this browser’s own archive.
  var beLokalePrijsHistorie = {};
  function beHistorieMetingen(j) {
    var coarse = (j && j.rows || []).filter(function(r){return r && Number.isFinite(r.t) && Number.isFinite(r.po);});
    var fine = (j && j.priceSamples || []).filter(function(r){return r && Number.isFinite(r.x) && Number.isFinite(r.y);})
      .map(function(r){return {t:r.x,po:r.y,detail:2};});
    return beVoegMetingenSamen(coarse, fine);
  }
  function beVoegMetingenSamen(oud, nieuw) {
    var map = new Map();
    [].concat(oud || [], nieuw || []).forEach(function(r){
      if (!r || !Number.isFinite(r.t) || !Number.isFinite(r.po)) return;
      var old = map.get(r.t);
      if (!old || (r.detail || 1) >= (old.detail || 1))
        map.set(r.t, {t:r.t,po:r.po,detail:r.detail || 1});
    });
    var rows = Array.from(map.values()).sort(function(a,b){return a.t-b.t;});
    var fine = rows.filter(function(r){return r.detail === 2;}), intervals=[];
    for(var i=1;i<fine.length;i++) if(fine[i].t-fine[i-1].t<=300000)
      intervals.push([fine[i-1].t,fine[i].t]);
    var n=0;
    return rows.filter(function(r){
      if(r.detail===2)return true;
      while(n<intervals.length && intervals[n][1]<r.t)n++;
      return !(n<intervals.length && intervals[n][0]<=r.t && r.t<=intervals[n][1]);
    });
  }
  function beVoegPrijzenSamen(oud, nieuw, events, discovery) {
    var map = new Map((oud || []).map(function (p) { return [p.start, p]; }));
    var richtingen = {};
    (discovery || []).forEach(function (d) { richtingen[d.start] = d; });
    (nieuw || []).forEach(function (p) {
      if (!p || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.end <= p.start) return;
      var vorig = map.get(p.start);
      // An explicitly final source cannot be downgraded by an older provisional response.
      if (vorig && vorig.provisional === false && p.provisional === true) return;
      var oudT = vorig && Date.parse(vorig.updatedAt);
      var nieuwT = Date.parse(p.updatedAt);
      if (vorig && vorig.provisional === p.provisional && Number.isFinite(oudT) && Number.isFinite(nieuwT) && nieuwT < oudT) return;
      var d = richtingen[p.start];
      var afrr = Array.isArray(events) ? events.indexOf(p.start) !== -1 : !!p.afrr;
      // Replace this snapshot, including nulls and corrections; do not mix tariff revisions.
      var snapshot = Object.assign({}, p, {
        values: Object.assign({}, p.values || {}), afrr: afrr,
        directions: d && Array.isArray(d.directions) ? d.directions.slice() :
          (Array.isArray(p.directions) ? p.directions.slice() : null)
      });
      // Preserve last finite same-quarter quotes separately from source nulls.
      snapshot.bewaardeTarieven = Object.assign({},
        beLokalePrijsHistorie[p.start] || {}, vorig && vorig.bewaardeTarieven || {}, p.bewaardeTarieven || {});
      [vorig && vorig.values || {}, p.values || {}].forEach(function(values){
        Object.keys(values).forEach(function(key){
          if(Number.isFinite(values[key])) snapshot.bewaardeTarieven[key]=values[key];
        });
      });
      // Keep observations separately from the latest quarter settlement snapshot.
      var verloop = Array.from(new Map([].concat(vorig && vorig.verloop || [], p.verloop || []).map(function(v){return [v.t,v];})).values()).sort(function(a,b){return a.t-b.t;});
      var nu = Date.now();
      if (p.start <= nu && nu < p.end) {
        var r = actueelPrijsRij(snapshot);
        if (Number.isFinite(r.ki) && Number.isFinite(r.ke)) {
          var last = verloop[verloop.length - 1];
          if (!last || last.ki !== r.ki || last.ke !== r.ke ||
              last.marktImport !== r.marktImport || last.marktExport !== r.marktExport) {
            // Observation time: never invent a historical transition from a revised snapshot.
            verloop.push({ t:nu, ki:r.ki, ke:r.ke,
              marktImport:r.marktImport, marktExport:r.marktExport });
          }
        }
      }
      snapshot.verloop = verloop;
      map.set(p.start, snapshot);
    });
    return Array.from(map.values()).sort(function (a,b) { return a.start-b.start; });
  }

  function actueelPrijsRij(p) {
    var v = p.values || {}, ds = p.directions;
    var ai = Array.isArray(ds) ? ds.indexOf('import') !== -1 : !!p.afrr;
    var ae = Array.isArray(ds) ? ds.indexOf('export') !== -1 : !!p.afrr;
    var saved=Object.assign({},beLokalePrijsHistorie[p.start]||{},p.bewaardeTarieven||{});
    var ik=ai?'afrr_import':'onbalans_import',ek=ae?'afrr_export':'onbalans_export';
    var ki=v[ik],ke=v[ek],hi=false,he=false;
    if(!Number.isFinite(ki) && Number.isFinite(saved[ik])){ki=saved[ik];hi=true;}
    if(!Number.isFinite(ke) && Number.isFinite(saved[ek])){ke=saved[ek];he=true;}
    // Recorded live observations can repair a same-market quote as well.
    (p.verloop || []).slice().reverse().forEach(function(o){
      if(!Number.isFinite(ki) && o.marktImport===(ai?'aFRR':'onbalans') && Number.isFinite(o.ki)){ki=o.ki;hi=true;}
      if(!Number.isFinite(ke) && o.marktExport===(ae?'aFRR':'onbalans') && Number.isFinite(o.ke)){ke=o.ke;he=true;}
    });
    return {start:p.start,end:p.end,afrr:ai||ae,
      marktImport:ai?'aFRR':'onbalans',marktExport:ae?'aFRR':'onbalans',ki:ki,ke:ke,
      historischImport:hi,historischExport:he,
      provisional:hi||he?true:p.provisional,fresh:p.fresh,updatedAt:p.updatedAt,
      carried:!!p.carried,sourceStart:p.sourceStart,verloop:p.verloop||[],values:Object.assign({},v)};
  }

  async function beVerwerkBron(u, j) {
    var prijs = u.pathname.indexOf('current-prices') !== -1;
    if (prijs) {
      var oud = await beLeesBron('prijzen');
      var rows = beVoegPrijzenSamen(oud.rows, j && j.prices, j && j.afrrEventIsps, j && j.afrrDiscovery);
      if (j && Array.isArray(j.prices)) await beSchrijfBron('prijzen', { rows: rows });
      return { generatedAt:j && j.generatedAt, prices: rows, afrrEventIsps: rows.filter(function (p) { return p.afrr; }).map(function (p) { return p.start; }) };
    }
    var vanaf = Number(u.searchParams.get('start')), tot = Number(u.searchParams.get('end'));
    if (!Number.isFinite(vanaf) || !Number.isFinite(tot) || tot <= vanaf) throw new Error('Ongeldig archiefbereik');
    var nieuwPerDag = {};
    beHistorieMetingen(j).forEach(function (r) {
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
    if (!KLANT || KLANT === 'account' || beArchiefBezig || document.hidden) return;
    var onderhoudKey='be_onderhoud_laatst:'+KLANT;
    if(Date.now()-Number(sessionStorage.getItem(onderhoudKey)||0)<300000)return;
    sessionStorage.setItem(onderhoudKey,String(Date.now()));
    beArchiefBezig = true;
    try {
      if (!beArchiefImportKlaar) {
        var migratie = await beLeesBron('console-import');
        var oudRapport = localStorage.getItem('be_brononderzoek_v1:' + KLANT);
        if (oudRapport) {
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
      var rijPrijzen = prijzen.prices.map(actueelPrijsRij);
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
    // Reject truncated measurement windows, not a reduced availability of prices.
    var gemetenMs = Number.isFinite(res.gemetenMs) ? res.gemetenMs : res.gedekt;
    if (eerder && ((Number.isFinite(eerder.gemetenTot) && tot < eerder.gemetenTot) ||
        (Number.isFinite(eerder.gemetenMs) && gemetenMs < eerder.gemetenMs))) return false;
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

      deelresultaat: !!res.prijsOnvolledig || res.gedekt < volleDag * 0.995,
      prijsOnvolledig: !!res.prijsOnvolledig,
      gemetenMs: gemetenMs,
      geprijsdeImportKwh: Number.isFinite(res.geprijsdeImportKwh) ? res.geprijsdeImportKwh : res.importKwh,
      geprijsdeExportKwh: Number.isFinite(res.geprijsdeExportKwh) ? res.geprijsdeExportKwh : res.exportKwh,
      historischKwh: res.historischKwh || 0,

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
    return true;
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

  // Kalenderdagen rekenen voorkomt afwijkingen bij zomer- en wintertijd.
  function beVoorschotValideer(rows) {
    if(!Array.isArray(rows))throw Error('Ongeldige voorschothistorie.');
    var gezien=new Set();
    return rows.map(function(r){
      var datum=String(r.datum||''),bedrag=Number(r.bedrag);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(datum)||!Number.isFinite(Date.parse(datum))||new Date(datum).toISOString().slice(0,10)!==datum||gezien.has(datum)||!Number.isFinite(bedrag)||bedrag<0||r.bedrag==='')throw Error('Vul een geldige, unieke ingangsdatum en een bedrag vanaf € 0 in.');
      gezien.add(datum);return {datum:datum,bedrag:bedrag};
    }).sort(function(a,b){return a.datum.localeCompare(b.datum);});
  }
  function beVoorschotSom(van,aantal) {
    var totaal=0,start=Date.parse(van),historie=cfg.voorschotHistorie||[];
    for(var i=0;i<Math.max(0,aantal);i++){
      var dag=new Date(start+i*86400000).toISOString().slice(0,10),bedrag=cfg.voorschot;
      historie.forEach(function(r){if(r.datum<=dag)bedrag=r.bedrag;});
      totaal+=bedrag/dagenInMaand(dag.slice(0,7));
    }
    return totaal;
  }
  function voorschotVoor(mk,dagen,geschat) {
    if(!/^\d{4}-\d{2}$/.test(String(mk)))return cfg.voorschot;
    var totaal=dagenInMaand(mk);
    return beVoorschotSom(mk+'-01',geschat?totaal:Math.max(0,Math.min(totaal,Number(dagen)||0)));
  }
  function beVoorschotInstellingen(host) {
    host.innerHTML='<div style="font-weight:600;margin:12px 0 6px">Wijzigingen maandbedrag</div><div style="font-size:11px;margin-bottom:8px">Het basisbedrag geldt tot de eerste wijziging. Het nieuwe bedrag geldt vanaf de ingangsdatum, inclusief die dag, naar rato van kalenderdagen.</div><div class="be-vs-rijen"></div><button type="button" class="be-vs-toevoegen">+ Wijziging toevoegen</button>';
    var lijst=host.querySelector('.be-vs-rijen');
    var toevoegen=host.querySelector('.be-vs-toevoegen');
    toevoegen.style.cssText='border:1px solid '+D.paarsLicht+';border-radius:6px;padding:8px 12px;background:transparent;color:'+D.paars+';font:600 11px system-ui;cursor:pointer;margin:4px 0 8px';
    function rij(r){
      var el=document.createElement('div');el.style.cssText='display:flex;gap:6px;margin:6px 0;align-items:center';
      var datum=document.createElement('input'),bedrag=document.createElement('input'),weg=document.createElement('button');
      datum.type='date';datum.value=r.datum;datum.setAttribute('aria-label','Ingangsdatum voorschot');
      bedrag.type='number';bedrag.min='0';bedrag.step='.01';bedrag.value=r.bedrag;bedrag.setAttribute('aria-label','Nieuw maandbedrag');
      [datum,bedrag].forEach(function(i){i.style.cssText='min-width:0;width:44%;padding:7px;border:1px solid '+D.rand+';border-radius:6px';});
      weg.type='button';weg.style.cssText='border:1px solid '+D.rand+';border-radius:6px;background:transparent;color:'+D.paars+';padding:5px 9px;font:600 16px system-ui;cursor:pointer';weg.textContent='×';weg.setAttribute('aria-label','Wijziging verwijderen');weg.onclick=function(){el.remove();};
      el.append(datum,bedrag,weg);lijst.appendChild(el);
    }
    (cfg.voorschotHistorie||[]).forEach(rij);
    toevoegen.onclick=function(){rij({datum:iso(new Date()),bedrag:cfg.voorschot});};
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

  // De aansluitdatum blijft vast; het zichtbare contractjaar schuift op de jaardag door.
  function huidigContract(nu) {
    nu = nu || new Date();
    var index = Math.max(0, nu.getFullYear() - cfg.start.getFullYear());
    var begin = datumPlusMaanden(cfg.start, index * 12);
    if (index > 0 && datumDagNummer(nu) < datumDagNummer(begin)) {
      index--;
      begin = datumPlusMaanden(cfg.start, index * 12);
    }
    var grens = datumPlusMaanden(cfg.start, (index + 1) * 12);
    var einde = new Date(grens); einde.setDate(einde.getDate() - 1);
    var delen = [], cursor = new Date(begin.getFullYear(), begin.getMonth(), 1);
    while (cursor < grens) {
      var volgend = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      var van = new Date(Math.max(+cursor, +begin));
      var tot = new Date(Math.min(+volgend, +grens));
      var laatste = new Date(tot); laatste.setDate(laatste.getDate() - 1);
      delen.push({ key: iso(cursor).slice(0,7), van: iso(van), tot: iso(laatste),
        dagen: datumDagNummer(tot) - datumDagNummer(van),
        eerste: delen.length === 0, laatste: +tot === +grens });
      cursor = volgend;
    }
    var termijnen = [];
    for (var i = 0; i < 12; i++) termijnen.push(iso(datumPlusMaanden(begin, i)));
    return {index:index, begin:begin, grens:grens, einde:einde, delen:delen, termijnen:termijnen};
  }

  function contractVoorschot(deel, dagen) {
    return beVoorschotSom(deel.van, Math.max(0, Math.min(deel.dagen, dagen)));
  }

  function contractDatumTekst(key) { return key.split('-').reverse().join('-'); }

  function contractSomDagen(dagen, deel) {
    var velden = ['imp','exp','inkoop','verkoop','laden','ontladen','pv','afrrImp','afrrExp','afrrVergoeding','dealsAantal'];
    var op = {};
    dagen.forEach(function(r) {
      if (r && r.bronAanwezig !== false && r.key >= deel.van && r.key <= deel.tot) op[r.key] = r;
    });
    var keys = Object.keys(op).sort(), totaal = {key:deel.key, leeg:!keys.length, contractDeel:deel, contractDagKeys:keys};
    velden.forEach(function(k){totaal[k]=keys.reduce(function(n,key){return n+getal(op[key][k]);},0);});
    totaal.contractBekendeDagen = keys.length;
    return totaal;
  }

  function contractPrognose(r, historie, ank, aantalVolledig) {
    var deel = r.contractDeel, fractie = deel.dagen / dagenInMaand(r.key);
    var basis = prognoseBedrag(r.key, ank) * fractie;
    var oud = historie.find(function(h){return h.key===String(+r.key.slice(0,4)-1)+r.key.slice(4) && !h.leeg && h.bronAanwezig!==false;});
    if (!oud) return basis;
    // Hergebruik kWh en kale opbrengsten; pas de huidige rekenregels toe op het doeljaar.
    var vergelijkbaar = Object.assign({}, oud, {key:r.key});
    var vorig = bereken(vergelijkbaar, naSaldering(r.key) ? oud.exp : Math.max(0,oud.exp-oud.imp), 0).stroom * fractie;
    return aantalVolledig >= 2 ? vorig * 0.60 + basis * 0.40 : vorig;
  }

  function contractMaanden() { return huidigContract().delen.map(function(d){return d.key;}); }

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

  window.BEInstallation = {
    resolve: function () {
      var id = verversKlantUitPad();
      return geldigeKlant(id) ? id : null;
    },
    wait: async function () {
      for (var attempt = 0; attempt < 120; attempt++) {
        var id = this.resolve();
        if (id) return id;
        await new Promise(function (done) { setTimeout(done, 500); });
      }
      return null;
    }
  };

  var beNativeFetch = window.fetch.bind(window);
  var beApiPending = new Map(), beApiCache = new Map();
  function beApiFetch(input, init) {
    var u=new URL(typeof input==='string'?input:input.url||input.href,location.origin);
    var method=(init&&init.method)||input.method||'GET';
    if(method.toUpperCase()!=='GET'||u.origin!==location.origin||!u.pathname.includes('api'))return beNativeFetch(input,init);
    u.searchParams.sort();var key=u.href;
    var ttl=u.pathname.includes('current-prices')?15000:u.pathname.includes('current-history')?30000:60000;
    var now=Date.now(),cached=beApiCache.get(key);
    var diskKey='be_api_cache:'+key;
    if(!cached&&u.pathname.includes('results')){
      try{var saved=JSON.parse(sessionStorage.getItem(diskKey)||'null');
        if(saved&&now-saved.time<ttl)cached={time:saved.time,response:new Response(saved.body,{status:200,headers:{'Content-Type':'application/json'}})};
      }catch(e){}
    }
    if(cached&&now-cached.time<ttl)return Promise.resolve(cached.response.clone());
    if(beApiPending.has(key))return beApiPending.get(key).then(function(r){return r.clone();});
    var until=Number(localStorage.getItem('be_api_retry_until')||0);
    if(now<until)return Promise.resolve(new Response('',{status:429,headers:{'Retry-After':String(Math.ceil((until-now)/1000))}}));
    var request=beNativeFetch(input,init).then(function(r){
      if(r.status===429){
        var retry=r.headers.get('Retry-After'),seconds=Number(retry);
        var delay=retry?(Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()):60000;
        if(!Number.isFinite(delay)||delay<1000)delay=60000;
        localStorage.setItem('be_api_retry_until',String(Date.now()+delay));
      }
      if(r.ok&&u.pathname.includes('results'))r.clone().text().then(function(body){
      if(body.length>300000)return;
      try{sessionStorage.setItem(diskKey,JSON.stringify({time:Date.now(),body:body}));}catch(e){}
    }).catch(function(){});
    if(r.ok){beApiCache.set(key,{time:Date.now(),response:r.clone()});if(beApiCache.size>40)beApiCache.delete(beApiCache.keys().next().value);}
      return r;
    }).finally(function(){beApiPending.delete(key);});
    beApiPending.set(key,request);
    return request.then(function(r){return r.clone();});
  }
  var origFetch = beApiFetch;


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
    "(function startBEActueel(){\n" +
    " if(typeof Chart==='undefined'||!Chart.getChart||!Chart.getChart('battery-chart')){setTimeout(startBEActueel,150);return;}\n" +
    "\n" +
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
    " var TG_KW=900000;\n" +
    " var TG={rijen:[],aan:false,allin:true};\n" +
    " function tgBedrag(v){return (v<0?'\\u2212 ':'+ ')+Math.abs(v).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}\n" +
    " Chart.register({id:'beTariefBanden',beforeDatasetsDraw:function(c){\n" +
    "  if(!c.canvas||c.canvas.id!=='be-tarief-chart')return;\n" +
    "  var x=c.scales.x,a=c.chartArea,t=c.ctx; if(!x||!a)return;\n" +
    "  t.save(); t.beginPath(); t.rect(a.left,a.top,a.right-a.left,a.bottom-a.top); t.clip();\n" +
    "  t.fillStyle='#ffffff'; t.fillRect(a.left,a.top,a.right-a.left,a.bottom-a.top);\n" +
    "  t.textAlign='center';\n" +
    "  (c.$beKwartieren||[]).forEach(function(q){\n" +
    "   var p1=Math.max(a.left,x.getPixelForValue(q.start));\n" +
    "   var p2=Math.min(a.right,x.getPixelForValue(q.end));\n" +
    "   if(p2<=p1)return;\n" +
    "   if(Math.floor(q.start/TG_KW)%2){t.fillStyle='#f1f2f4';t.fillRect(p1,a.top,p2-p1,a.bottom-a.top);}\n" +
    "   var mid=(p1+p2)/2;\n" +
    "   var lab=q.wacht?'geen prijs':q.carried?'laatst bekend':(q.afrr?'aFRR':'onbalans');\n" +
    "   var live=q.start<=Date.now()&&Date.now()<q.end;\n" +
    "   \n" +
    "   t.font='600 9.5px system-ui,-apple-system,sans-serif';\n" +
    "   t.fillStyle=q.wacht?'#8a8f98':(q.afrr?'#6B3FA0':'#2f6f9f');\n" +
    "   var ruimte=p2-p1-4;\n" +
    "   if(ruimte>=t.measureText(lab).width){\n" +
    "    t.fillText(lab,mid,a.top+11);\n" +
    "   }else if(ruimte>=24){\n" +
    "    t.font='600 8px system-ui,-apple-system,sans-serif';\n" +
    "    t.fillText(q.wacht?'wacht':(q.afrr?'aFRR':'onb.'),mid,a.top+11);\n" +
    "   }else if(ruimte>=8){\n" +
    "    t.save();t.translate(mid,a.top+4);t.rotate(-Math.PI/2);t.textAlign='right';\n" +
    "    t.fillText(lab,0,3);t.restore();\n" +
    "   }\n" +
    "   if(ruimte<24)return;\n" +
    "   if(q.res==null||Math.abs(q.res)<0.005)return;\n" +
    "   var bt=tgBedrag(q.res)+(q.deel?'\\u2026':'');\n" +
    "   t.font='700 12px system-ui,-apple-system,sans-serif';\n" +
    "   if(p2-p1<t.measureText(bt).width+8)return;\n" +
    "   t.fillStyle=q.deel?'#8a8f98':(q.res<0?'#dc3545':'#198754');\n" +
    "   t.fillText(bt,mid,a.top+25);\n" +
    "  });\n" +
    "  t.restore();\n" +
    " }});\n" +
    " var tgChart=null;\n" +
    " function tgMaak(){\n" +
    "  if(tgChart&&tgChart.canvas&&tgChart.canvas.isConnected)return tgChart;\n" +
    "  var cv=document.getElementById('be-tarief-chart'); if(!cv)return null;\n" +
    "  var o=Chart.getChart(cv); if(o)o.destroy();\n" +
    "  tgChart=new Chart(cv,{type:'line',data:{datasets:[\n" +
    "   {label:'Afname',borderColor:'#dc3545',borderWidth:2,pointRadius:0,stepped:'before',fill:false,tension:0,segment:{borderDash:[],borderWidth:function(s){return s.p0.raw.beLive?1:2;},borderColor:function(s){return s.p0.raw.beLive?'#dc354588':'#dc3545';}}},\n" +
    "   {label:'Invoeding',borderColor:'#198754',borderWidth:2,pointRadius:0,stepped:'before',fill:false,tension:0,segment:{borderDash:[],borderWidth:function(s){return s.p0.raw.beLive?1:2;},borderColor:function(s){return s.p0.raw.beLive?'#19875488':'#198754';}}}]},\n" +
    "   options:{responsive:true,maintainAspectRatio:false,animation:false,locale:'nl-NL',\n" +
    "    layout:{padding:{top:6}},interaction:{mode:'index',intersect:false},\n" +
    "    scales:{y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{font:{size:11},callback:function(v){return v.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}}}},\n" +
    "    plugins:{legend:{display:true,position:'top',align:'end',labels:{boxWidth:12,boxHeight:2,padding:6,font:{size:11}}},\n" +
    "     tooltip:{callbacks:{title:function(i){\n" +
    "       if(!i.length)return '';\n" +
    "       var tm=i[0].parsed.x;\n" +
    "       var q=(i[0].chart.$beKwartieren||[]).find(function(r){return r.start<=tm&&tm<r.end;});\n" +
    "       return new Date(tm).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})+(q?' \u00b7 afname '+q.marktImport+' / invoeding '+q.marktExport:'');\n" +
    "      },afterBody:function(i){\n" +
    "       if(!i.length)return [];\n" +
    "       var tm=i[0].parsed.x, q=(i[0].chart.$beKwartieren||[]).find(function(r){return r.start<=tm&&tm<r.end;});\n" +
    "       if(!q)return [];\n" +
    "       var out=[q.carried?'Laatst bekende prijs':Date.now()<q.end?'Lopend \u00b7 voorlopig':q.provisional===false?'Definitief':'Voorlopig'];\n" +
    "       return out;\n" +
    "      },\n" +
    "      label:function(z){return z.dataset.label+': '+z.parsed.y.toLocaleString('nl-NL',{minimumFractionDigits:3,maximumFractionDigits:3})+' / kWh';}}}}}});\n" +
    "  return tgChart;\n" +
    " }\n" +
    " function tgVul(){\n" +
    "  var rij=document.getElementById('be-tarief-row');\n" +
    "  if(rij)rij.hidden=!TG.aan;\n" +
    "  if(!TG.aan)return;\n" +
    "  var ch=tgMaak(); if(!ch)return;\n" +
    "  var bv=chart();\n" +
    "  if(bv&&bv.options.scales&&bv.options.scales.x){\n" +
    "   var bx=bv.options.scales.x;\n" +
    "   ch.options.scales.x=JSON.parse(JSON.stringify({type:bx.type,time:bx.time,bounds:bx.bounds,offset:bx.offset,grid:{display:false},\n" +
    "    ticks:{maxRotation:bx.ticks.maxRotation,autoSkip:bx.ticks.autoSkip,source:bx.ticks.source,font:bx.ticks.font,color:bx.ticks.color,autoSkipPadding:bx.ticks.autoSkipPadding,padding:bx.ticks.padding}}));\n" +
    "   if(bv.scales.x){ch.options.scales.x.min=bv.scales.x.min;ch.options.scales.x.max=bv.scales.x.max;}\n" +
    "  }\n" +
    "  var mn=ch.options.scales.x.min,mx=ch.options.scales.x.max;\n" +
    "  var imp=[],exp=[],kw=[],gezien={}; var nu=Date.now();\n" +
    "  (TG.rijen||[]).forEach(function(r){\n" +
    "   if(mn!=null&&r.end<mn)return;\n" +
    "   if(mx!=null&&r.start>mx)return;\n" +
    "   if(gezien[r.start])return; gezien[r.start]=true;\n" +
    "   kw.push(r);\n" +
    "   if(r.wacht)return;\n" +
    "   var live=r.start<=nu&&nu<r.end;\n" +
    "   if(live){\n" +
    "    // Never connect a settled quarter to a later first observation: stepped\n" +
    "    // interpolation would falsely backdate its price to the quarter boundary.\n" +
    "    imp.push({x:r.start,y:null}); exp.push({x:r.start,y:null});\n" +
    "    var samples=(r.verloop||[]).filter(function(v){return v.t>=r.start&&v.t<=nu;});\n" +
    "    if(samples.length){\n" +
    "     samples.forEach(function(v){\n" +
    "      imp.push({x:v.t,y:v.pi,beLive:true});\n" +
    "      exp.push({x:v.t,y:v.pe,beLive:true});\n" +
    "     });\n" +
    "     var last=samples[samples.length-1];\n" +
    "     imp.push({x:nu,y:last.pi,beLive:true});\n" +
    "     exp.push({x:nu,y:last.pe,beLive:true});\n" +
    "    }else{\n" +
    "     imp.push({x:nu,y:r.pi,beLive:true});\n" +
    "     exp.push({x:nu,y:r.pe,beLive:true});\n" +
    "    }\n" +
    "   }else{\n" +
    "    imp.push({x:r.start,y:r.pi,beLive:false},{x:r.end,y:r.pi,beLive:false});\n" +
    "    exp.push({x:r.start,y:r.pe,beLive:false},{x:r.end,y:r.pe,beLive:false});\n" +
    "   }\n" +
    "  });\n" +
    "  ch.data.datasets[0].data=imp; ch.data.datasets[1].data=exp;\n" +
    "  // Match both plot edges in screen coordinates, including differing canvas offsets.\n" +
    "  if(bv&&bv.chartArea&&bv.scales.x){\n" +
    "   var srcRect=bv.canvas.getBoundingClientRect(),dstRect=ch.canvas.getBoundingClientRect();\n" +
    "   var srcRatio=srcRect.width/bv.width,dstRatio=dstRect.width/ch.width;\n" +
    "   if(srcRatio>0&&dstRatio>0){\n" +
    "    var left=(srcRect.left+bv.chartArea.left*srcRatio-dstRect.left)/dstRatio;\n" +
    "    var right=(srcRect.left+bv.chartArea.right*srcRatio-dstRect.left)/dstRatio;\n" +
    "    ch.options.layout.padding={top:6,left:0,right:Math.max(0,ch.width-right)};\n" +
    "    ch.options.scales.y.afterFit=function(axis){axis.width=Math.max(0,left);};\n" +
    "    var ticks=bv.scales.x.ticks.map(function(t){return {value:t.value};});\n" +
    "    ch.options.scales.x.afterBuildTicks=function(axis){axis.ticks=ticks;};\n" +
    "    ch.options.scales.x.ticks.autoSkip=false;\n" +
    "   }\n" +
    "  }\n" +
    "  ch.$beKwartieren=kw; ch.update('none');\n" +
    " }\n" +
    " document.addEventListener('be-tarief-update',function(){\n" +
    "  var n=document.getElementById('be-tarief-data'); if(!n)return;\n" +
    "  try{TG=Object.assign(TG,JSON.parse(n.textContent||'{}'));tgVul();}\n" +
    "  catch(e){console.error('[BE tariefgrafiek bridge]',e);}\n" +
    " });\n" +
    " var initial=document.getElementById('be-actueel-allin-data');\n" +
    " try{if(initial)st=Object.assign(st,JSON.parse(initial.textContent||'{}'));}catch(e){}\n" +
    " var initialTarief=document.getElementById('be-tarief-data');\n" +
    " try{if(initialTarief)TG=Object.assign(TG,JSON.parse(initialTarief.textContent||'{}'));}catch(e){}\n" +
    " wikkel();tgVul();\n" +
    " setInterval(function(){ if(TG.aan) tgVul(); },3000);\n" +
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

  /* ──────────────────────────────────────────────────────────────────
   *  Tariefgrafiek (v5.0)
   *
   *  Een tweede grafiek tussen de vermogensgrafiek en de SOC-rij, met het
   *  afname- en invoedtarief per kwartier. Dezelfde kwartiervakken, dezelfde
   *  tijdas en hetzelfde witte tekenvlak als de grafiek erboven; per vak het
   *  etiket onbalans of aFRR en het resultaat van dat kwartier in euro.
   *
   *  Twee dingen die eerder fout gingen en hier bewust anders staan:
   *
   *  - Het etiket komt uit afrrEventIsps, nooit uit een prijsvergelijking.
   *    Bij gewone onbalans verschillen afname en invoeding ook, want
   *    opregelen en afregelen zijn twee tarieven. Over 141 kwartieren zat
   *    een test op "de prijzen lopen uiteen" er 69 keer naast.
   *
   *  - Het bedrag komt uit actueelProjectieBereken, dezelfde motor als het
   *    dagresultaat. Een eigen integratie met een gatgrens van twee minuten
   *    haalde bijna de helft van de energie uit een kwartier; deze functie
   *    gebruikt vijf minuten en interpoleert bovendien netjes.
   * ────────────────────────────────────────────────────────────────── */

  var TARIEF_SLEUTEL = 'be_cfg_tariefgrafiek';

  var tariefAan =
    localStorage.getItem(TARIEF_SLEUTEL) !== 'uit';

  function tariefZorgBlok() {
    if (!isActueelPagina()) {
      return null;
    }

    var bestaand =
      document.getElementById('be-tarief-row');

    if (bestaand && bestaand.parentElement) {
      return bestaand;
    }

    var soc =
      document.querySelector('.energy-chart-soc-row');

    if (!soc || !soc.parentElement) {
      return null;
    }

    var rij =
      document.createElement('div');

    rij.id = 'be-tarief-row';
    rij.className = 'energy-chart-soc-row';

    rij.innerHTML =
      '<div class="chart-frame" style="height:340px;">' +
        '<canvas id="be-tarief-chart"></canvas>' +
      '</div>' +
      '<p class="charging-chart-note" id="be-tarief-noot"></p>';

    soc.parentElement.insertBefore(rij, soc);

    return rij;
  }

  function tariefStuur() {
    if (!isActueelPagina()) {
      return;
    }

    var blok = tariefZorgBlok();

    if (blok) {
      blok.hidden = !tariefAan;
    }

    var n =
      document.getElementById('be-tarief-data');

    if (!n) {
      n = document.createElement('script');
      n.type = 'application/json';
      n.id = 'be-tarief-data';
      document.documentElement.appendChild(n);
    }

    n.textContent =
      JSON.stringify({
        rijen: tariefAan ? tariefKwartieren() : [],
        aan: tariefAan,
        allin: actueelAan
      });

    document.dispatchEvent(
      new Event('be-tarief-update')
    );

    tariefZetNoot();
  }

  /* Per kwartier de prijzen en het resultaat. Het resultaat loopt via
     actueelProjectieBereken zodat het exact dezelfde regels volgt als het
     dagbedrag in de bedieningsrij. */
  function tariefKwartieren() {
    var KW = 15 * 60 * 1000;
    var nu = Date.now();
    if (beLivePrijsRows && beLivePrijsRows.length) {
      beLivePrijsRows=beOverbrugPrijzen(beLivePrijsRows,nu);
      actueelRijen=beLivePrijsRows.map(actueelPrijsRij).filter(function(r){return Number.isFinite(r.ki)||Number.isFinite(r.ke);});
    }
    var uit = [];

    var bekend = {};

    actueelRijen.forEach(function (r) {
      bekend[r.start] = r;
    });

    /* Balans publiceert een kwartier pas twee a drie minuten na het begin.
       De lege kwartieren gaan toch mee, zodat het vak en het etiket
       "prijs volgt" er alvast staan. */
    var starts = Object.keys(bekend).map(Number);

    var laatste = Math.floor(nu / KW) * KW;

    if (starts.length) {
      var vroegste = Math.min.apply(null, starts);

      for (var k = vroegste; k <= laatste; k += KW) {
        if (!bekend[k]) {
          bekend[k] = { start: k, end: k + KW, ki: null, ke: null, afrr: false };
        }
      }
    }

    Object.keys(bekend).map(Number).sort(function (a, b) {
      return a - b;
    }).forEach(function (k) {
      var r = bekend[k];

      var heeftPrijs =
        Number.isFinite(r.ki) &&
        Number.isFinite(r.ke);

      var res = null;
      var deel = false;
      var breakEven = null;

      if (!r.carried && actueelDagPunten.length) {
        var b =
          actueelProjectieBereken(
            actueelDagPunten,
            [r],
            r.start,
            r.end,
            nu
          );

        if (b && !b.ongeldig && b.gemetenMs > 0) {
          // Match Resultaat vandaag: sum known prices without inventing missing ones.
          // Keep meter coverage separate from tariff coverage.
          breakEven = {
            bedrag: b.bedrag,
            gemetenMs: b.gemetenMs,
            prijsOnvolledig: !!b.prijsOnvolledig,
            tot: Math.min(r.end, nu, actueelDagPunten[actueelDagPunten.length - 1].x)
          };
          if (b.stukken) {
            res = b.bedrag;
            deel = b.gedekt < (r.end - r.start) * 0.97;
          }
        }
      }

      uit.push({
        start: r.start,
        end: r.end,
        afrr: !!r.afrr,
        marktImport:r.marktImport, marktExport:r.marktExport,
        carried:!!r.carried, sourceStart:r.sourceStart,
        provisional:r.provisional, fresh:r.fresh, updatedAt:r.updatedAt,
        values:r.values,
        verloop:(r.verloop || []).map(function (v) {
          return { t:v.t, carried:!!v.carried,
            pi:actueelAan ? actueelAllin(v.ki, false) : v.ki,
            pe:actueelAan ? actueelAllin(v.ke, true) : v.ke };
        }),
        wacht: !heeftPrijs,
        res: res,
        breakEven: breakEven,
        deel: deel,

        pi: heeftPrijs
          ? (actueelAan ? actueelAllin(r.ki, false) : r.ki)
          : null,

        pe: heeftPrijs
          ? (actueelAan ? actueelAllin(r.ke, true) : r.ke)
          : null
      });
    });

    return uit;
  }

  function tariefZetNoot() {
    var n =
      document.getElementById('be-tarief-noot');

    if (!n) {
      return;
    }

    n.textContent = (actueelAan
      ? 'All-in, incl. btw, leverkosten en energiebelasting. '
      : 'Kale tarieven, excl. btw, leverkosten en energiebelasting. ') +
      'Dunne, lichtere lijn = lopend kwartier. Details in de tooltip.';
  }

  /* De schakelaar hoort naast de All-in knop in de bedieningsrij. In de
     grafiek zelf zou hij mee verdwijnen zodra je hem uitzet. */
  function tariefZorgKnop() {
    if (!isActueelPagina()) {
      return;
    }

    var rij =
      document.getElementById('be-actueel-bedieningsrij') ||
      document.querySelector('.energy-chart-legend');

    if (!rij) {
      return;
    }

    var b =
      document.getElementById('be-tariefgrafiek-knop');

    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'be-tariefgrafiek-knop';

      b.style.cssText =
        'appearance:none;-webkit-appearance:none;display:flex;' +
        'align-items:center;gap:8px;border:0;border-left:1px solid #e8e2f0;' +
        'background:transparent;padding:3px 14px;cursor:pointer;font:inherit;' +
        'font-size:12px;color:#2b2733;white-space:nowrap;flex:0 0 auto;' +
        'margin-left:auto;box-shadow:none;';

      b.innerHTML =
        '<span>Tariefgrafiek</span>' +
        '<span data-be-tg-track style="position:relative;display:inline-block;' +
          'width:34px;height:18px;border-radius:999px;flex-shrink:0;' +
          'transition:background .18s ease;">' +
          '<span data-be-tg-thumb style="position:absolute;left:2px;top:2px;' +
            'width:14px;height:14px;border-radius:50%;background:#fff;' +
            'box-shadow:0 1px 3px rgba(0,0,0,.35);' +
            'transition:transform .18s ease;"></span>' +
        '</span>' +
        '<span data-be-tg-status style="min-width:24px;font-size:10px;' +
          'font-weight:700;line-height:1;"></span>';

      b.addEventListener('click', function () {
        tariefAan = !tariefAan;

        try {
          localStorage.setItem(
            TARIEF_SLEUTEL,
            tariefAan ? 'aan' : 'uit'
          );
        } catch (e) {}

        tariefTekenKnop();
        tariefStuur();
      });
    }

    var allin =
      rij.querySelector('[data-be-actueel-allin]');

    if (allin) {
      if (b.nextElementSibling !== allin) {
        rij.insertBefore(b, allin);
      }
    } else if (b.parentElement !== rij) {
      rij.appendChild(b);
    }

    tariefTekenKnop();
  }

  function tariefTekenKnop() {
    var b =
      document.getElementById('be-tariefgrafiek-knop');

    if (!b) {
      return;
    }

    b.setAttribute(
      'aria-pressed',
      tariefAan ? 'true' : 'false'
    );

    b.title =
      tariefAan
        ? 'Tariefgrafiek verbergen'
        : 'Tariefgrafiek tonen';

    var track = b.querySelector('[data-be-tg-track]');
    var thumb = b.querySelector('[data-be-tg-thumb]');
    var status = b.querySelector('[data-be-tg-status]');

    if (track) {
      track.style.background = tariefAan ? '#6B3FA0' : '#9ca3af';
    }

    if (thumb) {
      thumb.style.transform =
        tariefAan ? 'translateX(16px)' : 'translateX(0)';
    }

    if (status) {
      status.textContent = tariefAan ? 'AAN' : 'UIT';
    }
  }

  function actueelPasPrijzenToe(j) {
        if (
          !j ||
          !Array.isArray(
            j.prices
          )
        ) {
          return;
        }

        actueelRijen = j.prices.map(actueelPrijsRij).filter(function (r) {
          return Number.isFinite(r.ki) || Number.isFinite(r.ke);
        });

        actueelStuur();

        tariefStuur();

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
  }

  var beLivePrijsRows = [];
  var bePrijsHydratie = null;
  function beHerstelPrijsVerloop(){
    if(bePrijsHydratie)return;
    bePrijsHydratie=beLeesBron('prijzen').then(function(saved){
      beLivePrijsRows=beVoegPrijzenSamen(saved.rows||[],beLivePrijsRows);
      beLivePrijsRows=beOverbrugPrijzen(beLivePrijsRows,Date.now());
      if(isActueelPagina())actueelPasPrijzenToe({prices:beLivePrijsRows});
    }).catch(function(e){console.warn('[BE prijsarchief lezen]',e.message);});
  }
  function beOverbrugPrijzen(rows, nu) {
    var start=Math.floor(nu/900000)*900000;
    var current=rows.find(function(p){return p.start===start;});
    var prior=rows.filter(function(p){return p.end===start;}).pop();
    if(!prior)return rows;
    var previous=actueelPrijsRij(prior),r=current&&actueelPrijsRij(current);
    if(!Number.isFinite(previous.ki)||!Number.isFinite(previous.ke))return rows;
    var seed={t:start,ki:previous.ki,ke:previous.ke,marktImport:previous.marktImport,marktExport:previous.marktExport,carried:true};
    var history=(current&&current.verloop||[]).slice();
    if(!history.length||history[0].t>start)history.unshift(seed);
    var usable=r&&Number.isFinite(r.ki)&&Number.isFinite(r.ke);
    var replacement=usable?Object.assign({},current,{verloop:history}):
      Object.assign({},prior,{start:start,end:start+900000,provisional:true,carried:true,sourceStart:prior.start,verloop:history});
    return rows.filter(function(p){return p.start!==start;}).concat([replacement]).sort(function(a,b){return a.start-b.start;});
  }
  function beOntvangLivePrijzen(j) {
    if(!j||!Array.isArray(j.prices))return;
    document.dispatchEvent(new CustomEvent('be-afrr-source',{detail:j}));
    beLivePrijsRows=beOverbrugPrijzen(beLivePrijsRows,Date.now());
    beLivePrijsRows=beVoegPrijzenSamen(beLivePrijsRows,j.prices,j.afrrEventIsps,j.afrrDiscovery);
    beLivePrijsRows=beOverbrugPrijzen(beLivePrijsRows,Date.now());
    actueelPasPrijzenToe({prices:beLivePrijsRows});
  }
  function beBewaarPrijzenLater(j) {
    var werk=beArchiefWachtrij.then(function(){return beVerwerkBron(new URL('/customer/current-prices/api/',location.origin),j);});
    beArchiefWachtrij=werk.catch(function(e){console.warn('[BE prijsarchief]',e.message);});
  }
  var actueelPrijsBezig = false;
  function actueelHaal() {
    if (
      !isActueelPagina()
    ) {
      return Promise.resolve();
    }

    if (actueelPrijsBezig) return Promise.resolve();
    actueelPrijsBezig = true;
    beHerstelPrijsVerloop();
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    return origFetch(
      location.origin +
      '/customer/current-prices/api/',
      {
        credentials:
          'same-origin',

        signal: controller.signal,
        cache:
          'no-store'
      }
    )

      .then(function (r) {
        return r.ok
          ? r.json()
          : null;
      })

      .then(function(j){beOntvangLivePrijzen(j);if(j)beBewaarPrijzenLater(j);})

      .catch(
        function (e) {
          console.warn(
            '[BE Actueel all-in] ophalen mislukt:',
            e.message
          );
        }
      ).finally(function () {
        clearTimeout(timeout);
        actueelPrijsBezig = false;
      });
  }

  var actueelDagOphaling = null;
  var actueelDagPuntenScope = '';
  var actueelDagRevisie = 0;
  function actueelHaalDagPunten() {
    if (!isActueelPagina() || !KLANT) return Promise.resolve();
    var klant = KLANT, beginVandaag = new Date();
    beginVandaag.setHours(0,0,0,0);
    var vanaf = beginVandaag.getTime(), tot = Date.now(), dagKey = iso(beginVandaag);
    var scope = klant + ':' + dagKey;
    if (actueelDagOphaling && actueelDagOphaling.scope === scope) return actueelDagOphaling.promise;
    if (actueelDagPuntenScope !== scope) {
      actueelDagPunten = [];
      actueelDagPuntenScope = scope;
    }
    var revisie = ++actueelDagRevisie;
    function ontvang(rows) {
      if (revisie !== actueelDagRevisie) return;
      if (KLANT !== klant || iso(new Date()) !== dagKey || actueelDagPuntenScope !== scope) return;
      var map = new Map(actueelDagPunten.map(function(p){return [p.x,p];}));
      (rows || []).forEach(function(r){
        if(r && Number.isFinite(r.t) && Number.isFinite(r.po) && r.t >= vanaf && r.t <= tot)
          map.set(r.t,{x:r.t,y:r.po});
      });
      actueelDagPunten = Array.from(map.values()).sort(function(a,b){return a.x-b.x;});
      actueelProjectieToon();
      tariefStuur();
    }
    // Render existing day measurements without waiting for network or archive writes.
    var versOntvangen = false;
    beLeesBron(dagKey).then(function(dag){
      // An older storage snapshot must not overwrite a fresh response.
      if (!versOntvangen) ontvang(dag.rows);
    }).catch(function(e){console.warn('[BE Actueel] dagcache:',e.message);});
    var u = new URL('/customer/current-history/api/',location.origin);
    u.searchParams.set('installation',klant);
    u.searchParams.set('start',String(vanaf));
    u.searchParams.set('end',String(tot));
    var controller = new AbortController();
    var timeout = setTimeout(function(){controller.abort();},12000);
    var taak = {scope:scope,promise:null};
    actueelDagOphaling = taak;
    taak.promise = Promise.resolve().then(function(){
      return origFetch(u.href,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    }).then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.json();
    }).then(function(j){
      if(KLANT!==klant || iso(new Date())!==dagKey)return;
      // Publish raw measurements first; storage latency cannot hide the result.
      versOntvangen = true;
      ontvang(beHistorieMetingen(j));
      var werk = beArchiefWachtrij.then(function(){
        if(KLANT!==klant)return null;
        return beVerwerkBron(u,j);
      });
      beArchiefWachtrij = werk.catch(function(e){console.warn('[BE Actueel] dagarchief:',e.message);});
      werk.then(function(archief){if(archief)ontvang(archief.rows);}).catch(function(){});
    }).catch(function(e){
      console.warn('[BE Actueel] daghistorie ophalen mislukt:',e.message);
    }).finally(function(){
      clearTimeout(timeout);
      if(actueelDagOphaling===taak)actueelDagOphaling=null;
    });
    return taak.promise;
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
      "#be-actueel-resultaat { flex-wrap:wrap; row-gap:8px!important; }\n.be-dag-label { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#9274bb; background:rgba(107,63,160,.06); border-radius:6px; padding:4px 7px; }\n.be-dag-saldo { font-size:16px; font-weight:700; white-space:nowrap; }\n.be-dag-info { position:relative; min-width:0; color:#6c757d; font-size:11px; }\n.be-dag-info summary { cursor:pointer; list-style:none; white-space:normal; line-height:1.5; border-radius:4px; }\n.be-dag-info summary::-webkit-details-marker { display:none; }\n.be-dag-info summary:focus-visible { outline:2px solid #9274bb; outline-offset:4px; }\n.be-dag-info-icoon { color:#9274bb; margin-left:3px; }\n.be-dag-popup { display:none; position:absolute; top:100%; right:0; z-index:1000; width:280px; max-width:calc(100vw - 48px); padding:14px 16px; background:#fff; color:#302c36; border:1px solid #e6ddef; border-radius:10px; box-shadow:0 6px 22px #30203a24; white-space:normal; text-align:left; }\n.be-dag-info[open]>.be-dag-popup { display:block; }\n@media(hover:hover) and (pointer:fine) { .be-dag-info:not([data-dismissed]):hover>.be-dag-popup { display:block; } }\n.be-dag-popup-kop { font-size:11px; font-weight:600; color:#9274bb; margin-bottom:10px; }\n.be-dag-stroom { display:flex; flex-direction:column; gap:4px; }\n.be-dag-stroom+.be-dag-stroom { margin-top:10px; padding-top:10px; border-top:1px solid #e6ddef; }\n.be-dag-volume { font-size:12px; color:#6c757d; }\n.be-dag-detail { display:flex; flex-wrap:wrap; align-items:baseline; gap:3px 8px; font-size:13px; }\n.be-dag-bedrag { font-weight:600; white-space:nowrap; }\n.be-dag-prijs { color:#6c757d; font-size:11px; white-space:nowrap; }\n.be-dag-onvolledig { font-size:10px; color:#6c757d; }\n@media(max-width:700px) {\n  #be-actueel-resultaat { white-space:normal!important; width:100%; }\n  #be-actueel-resultaat .be-dag-info { flex:1 1 100%; }\n  .be-dag-popup { left:0; right:auto; }\n}\n" +
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

    /* De tariefgrafiek toont dezelfde prijzen, dus die kantelt mee. */
    tariefStuur();

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
      resultaatImportEur: 0, resultaatExportEur: 0,
      ouder: 0, recent: 0, huidig: 0, stukken: 0,
      bronVanaf: vanaf, bronTot: tot, gaten: 0, ongeldig: false };
    var kwartier = 15 * 60 * 1000;
    var huidigStart = Math.floor(nu / kwartier) * kwartier;
    var reeks = punten.filter(function (p) {
      return p && Number.isFinite(p.x) && Number.isFinite(p.y);
    }).slice().sort(function (a, b) { return a.x - b.x; });
    // Meter totals are independent of tariff availability. Split sign changes
    // before integrating, so simultaneous daily import/export never cancel out.
    var gemetenImport = 0, gemetenExport = 0, gemetenMs = 0;
    for (var mi = 1; mi < reeks.length; mi++) {
      var ma = reeks[mi - 1], mb = reeks[mi], md = mb.x - ma.x;
      if (md <= 0 || md > 300000) continue;
      var ml = Math.max(ma.x, vanaf), mr = Math.min(mb.x, tot, nu);
      if (mr <= ml) continue;
      gemetenMs += mr - ml;
      var mc = [ml, mr];
      if (ma.y * mb.y < 0) {
        var mz = ma.x + md * (-ma.y) / (mb.y - ma.y);
        if (mz > ml && mz < mr) mc.splice(1, 0, mz);
      }
      for (var mk = 1; mk < mc.length; mk++) {
        var mx = mc[mk - 1], my = mc[mk];
        var mw1 = ma.y + (mb.y - ma.y) * (mx - ma.x) / md;
        var mw2 = ma.y + (mb.y - ma.y) * (my - ma.x) / md;
        var me = (mw1 + mw2) / 2 * (my - mx) / 3600000000;
        gemetenImport += Math.max(0, me);
        gemetenExport += Math.max(0, -me);
      }
    }
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
          if(exp ? prijsRij.historischExport : prijsRij.historischImport)
            uit.historischKwh=(uit.historischKwh||0)+Math.abs(energie);
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
          if (exp) {
            uit.resultaatExportEur += bedrag;
          } else {
            uit.resultaatImportEur -= bedrag;
          }
          uit.importKwh += Math.max(0, energie);
          uit.exportKwh += Math.max(0, -energie);
          if (gedektTot !== null && x > gedektTot) uit.gaten++;
          gedektTot = y;
          uit.gedekt += y - x;
          uit.stukken++;
        }
      }
    }
    uit.geprijsdeImportKwh = uit.importKwh;
    uit.geprijsdeExportKwh = uit.exportKwh;
    uit.ongeprijsdeImportKwh = Math.max(0, gemetenImport - uit.importKwh);
    uit.ongeprijsdeExportKwh = Math.max(0, gemetenExport - uit.exportKwh);
    uit.importKwh = gemetenImport;
    uit.exportKwh = gemetenExport;
    uit.gemetenMs = gemetenMs;
    uit.prijsOnvolledig = uit.ongeprijsdeImportKwh + uit.ongeprijsdeExportKwh > 0.000001;
    return uit;
  }

  // Bedragen en gemiddelden gebruiken dezelfde tariefstand als het dagsaldo.
  function actueelResultaatHtml(res, aan) {
    function getal(n, decimalen) {
      return n.toLocaleString('nl-NL', {
        minimumFractionDigits: decimalen,
        maximumFractionDigits: decimalen
      });
    }
    function geld(n) {
      return (n < 0 ? '− ' : '+ ') + '€ ' + getal(Math.abs(n), 2);
    }
    function kleur(n) {
      return n < 0 ? '#dc3545' : '#198754';
    }
    function stroom(exportStroom) {
      var kwh = exportStroom ? res.exportKwh : res.importKwh;
      var geprijsd = exportStroom ? res.geprijsdeExportKwh : res.geprijsdeImportKwh;
      var ongeprijsd = exportStroom ? res.ongeprijsdeExportKwh : res.ongeprijsdeImportKwh;
      var kosten = exportStroom ? res.resultaatExportEur : res.resultaatImportEur;
      var bedrag = exportStroom ? kosten : -kosten;
      var bekend = geprijsd > 0 || kwh === 0;
      var gedeeltelijk = ongeprijsd > 0.000001;
      var gemiddelde = geprijsd > 0 ? '€ ' + getal(kosten / geprijsd, 3) : '—';
      return '<span class="be-dag-stroom">' +
        '<span class="be-dag-volume">' + getal(kwh, 1) + ' kWh ' +
          (exportStroom ? 'export' : 'import') + '</span>' +
        '<span class="be-dag-detail">' +
          '<span class="be-dag-bedrag" style="color:' + (bekend ? kleur(bedrag) : '#6c757d') + '">' +
            (bekend ? geld(bedrag) : '—') + '</span>' +
          '<span class="be-dag-prijs">gem. ' + gemiddelde + '/kWh</span>' +
        '</span>' +
        (gedeeltelijk ? '<span class="be-dag-onvolledig">' +
          (bekend ? 'deels geprijsd' : 'prijzen ontbreken') + '</span>' : '') +
      '</span>';
    }
    return '<span class="be-dag-label">Resultaat vandaag</span>' +
      '<span class="be-dag-saldo" style="color:' + kleur(res.bedrag) + '">' +
        (res.stukken ? geld(res.bedrag) : '— · prijzen ontbreken') + '</span>' +
      '<details class="be-dag-info">' +
        '<summary aria-label="Details import en export">' +
          getal(res.importKwh, 1) + ' kWh import · ' + getal(res.exportKwh, 1) +
          ' kWh export <span class="be-dag-info-icoon" aria-hidden="true">ⓘ</span>' +
        '</summary>' +
        '<div class="be-dag-popup">' +
          '<div class="be-dag-popup-kop">Vandaag · ' + (aan ? 'all-in' : 'kaal') + '</div>' +
          stroom(false) + stroom(true) +
        '</div>' +
      '</details>';
  }

  // Native details ondersteunt tikken en Enter/Spatie, hover is alleen voor muizen.
  function actueelResultaatInfoBediening() {
    if (document.__beDagInfoBediening) return;
    document.__beDagInfoBediening = true;
    document.addEventListener('pointerdown', function (event) {
      var info = document.querySelector('#be-actueel-resultaat .be-dag-info');
      if (info && !info.contains(event.target)) { info.open = false; delete info.dataset.pinned; }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var info = document.querySelector('#be-actueel-resultaat .be-dag-info');
      if (!info) return;
      info.open = false;
      delete info.dataset.pinned;
      info.setAttribute('data-dismissed', '1');
    });
    document.addEventListener('pointerover', function (event) {
      var info = event.target.closest && event.target.closest('.be-dag-info');
      if (info && !info.contains(event.relatedTarget)) {
        info.removeAttribute('data-dismissed');
        if (event.pointerType === 'mouse' && matchMedia('(hover:hover)').matches) info.open = true;
      }
    });
    document.addEventListener('pointerout', function (event) {
      var info = event.target.closest && event.target.closest('.be-dag-info');
      if (info && event.pointerType === 'mouse' && !info.dataset.pinned && !info.contains(event.relatedTarget)) info.open = false;
    });
    document.addEventListener('click', function (event) {
      var info = event.target.closest && event.target.closest('.be-dag-info');
      if (!info || !event.target.closest('summary')) return;
      event.preventDefault();
      var openen = info.dataset.pinned !== '1';
      info.open = openen;
      if (openen) {
        info.dataset.pinned = '1';
        info.removeAttribute('data-dismissed');
      } else {
        delete info.dataset.pinned;
        info.setAttribute('data-dismissed', '1');
      }
    });
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
        info.__beResultaatTekst = null;
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

    if (res.ongeldig || !(res.gemetenMs > 0)) {
      info.__beResultaatTekst = null;
      info.textContent = 'Resultaat vandaag — nog geen passende metingen en prijzen';
      return;
    }

    var tekst = actueelResultaatHtml(res, actueelAan);

    info.title = res.prijsOnvolledig
      ? 'Voorlopig bedrag. Tarief ontbreekt voor ' +
        (res.ongeprijsdeImportKwh + res.ongeprijsdeExportKwh).toLocaleString('nl-NL', {maximumFractionDigits:2}) + ' kWh.'
      : res.historischKwh > 0.000001 ? 'Voorlopig bedrag met herstelde historische tarieven.' : '';

    if (
      info.__beResultaatTekst !== tekst
    ) {
      var vorigeInfo = info.querySelector('.be-dag-info');
      var wasOpen = vorigeInfo && vorigeInfo.open;
      var wasPinned = vorigeInfo && vorigeInfo.dataset.pinned;
      var hadFocus = vorigeInfo && vorigeInfo.contains(document.activeElement);
      info.innerHTML = tekst;
      var nieuweInfo = info.querySelector('.be-dag-info');
      if (nieuweInfo) {
        nieuweInfo.open = !!wasOpen;
        if (wasPinned) nieuweInfo.dataset.pinned = wasPinned;
        if (hadFocus) nieuweInfo.querySelector('summary').focus({ preventScroll: true });
      }
      actueelResultaatInfoBediening();
      info.__beResultaatTekst = tekst;
      if(beDarkOn){beDarkPending.add(info);beDarkRefresh();}
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

    tariefZorgKnop();

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

      tariefStuur();
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

    setInterval(function () {
      if (isActueelPagina()) actueelHaal();
    }, 15000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && isActueelPagina()) actueelHaal();
    });
    actueelHaalTimer =
      setInterval(
        function () {
          if (
            isActueelPagina()
          ) {
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

  function resultatenHaalVoorlopigeDagen(voorOverzicht) {
    if (
      (!voorOverzicht && location.pathname.indexOf(
        '/results'
      ) === -1) ||
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

                    var prijsRijen = jp.prices.map(actueelPrijsRij)
                      .filter(function(r){return Number.isFinite(r.ki)||Number.isFinite(r.ke);});

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
  var contractCacheSleutel = '';
  var contractHistorie = [];

  function haalContractjaar() {
    var periode = huidigContract(), vandaag = iso(new Date());
    var sleutel = KLANT + ':' + iso(periode.begin) + ':' + vandaag;
    if (contractCache && contractCacheSleutel === sleutel) return Promise.resolve(contractCache);
    var jaren = {};
    periode.delen.forEach(function(d){jaren[d.key.slice(0,4)]=true;});
    // Vorige kalenderjaren leveren de vergelijkbare maand; originele historie blijft intact.
    periode.delen.forEach(function(d){if(periode.index>0)jaren[String(+d.key.slice(0,4)-1)]=true;});
    return Promise.all(Object.keys(jaren).map(haalJaar)).then(function(sets){
      var op = {};
      sets.forEach(function(rs){rs.forEach(function(r){op[r.key]=r;});});
      contractHistorie = Object.keys(op).sort().filter(function(k){
        return k < vandaag.slice(0,7) && k+'-01' >= iso(cfg.start);
      }).map(function(k){return op[k];});
      return Promise.all(periode.delen.map(function(deel){
        var r = op[deel.key];
        if (deel.van > vandaag) return contractSomDagen([],deel);
        // Alleen gehele afgesloten maanden kunnen veilig uit maandtotalen komen.
        if (deel.dagen === dagenInMaand(deel.key) && deel.key < vandaag.slice(0,7) && r && !r.leeg && r.bronAanwezig!==false) {
          return Object.assign({},r,{contractDeel:deel,contractBekendeDagen:deel.dagen});
        }
        return haalMaandDagen(deel.key).then(function(dagen){return contractSomDagen(dagen.filter(function(d){return d.key<=vandaag;}),deel);});
      }));
    }).then(function(rijen){
      if (iso(huidigContract().begin) === iso(periode.begin)) {
        contractCache=rijen; contractCacheSleutel=sleutel;
      }
      return rijen;
    });
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

          if (geschat && metPrognose && r.contractDeel) {
            var fractie = r.contractDeel.dagen / dagenInMaand(r.key);
            imp *= fractie; exp *= fractie;
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

    // Match the priced portion used by Actueel, while retaining all measured kWh.
    var ebImp = r.voorlopig && Number.isFinite(r.geprijsdeImportKwh) ? r.geprijsdeImportKwh : imp;
    var ebExp = r.voorlopig && Number.isFinite(r.geprijsdeExportKwh) ? r.geprijsdeExportKwh : exp;
    var ebInk = -ebImp * EB;
    var ebVerk = Math.max(0, ebExp - onges) * EB;

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

    var stroomKosten =
      a.allinInk +
      a.allinVerk +
      (perMaand ? (ctx.voorlopigStroom || 0) : 0);

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

        (
          perMaand && ctx.voorlopigAantal > 0
            ? rij(
                'Voorlopige kosten / opbrengsten',
                ctx.voorlopigAantal + ' dag(en) · nog niet definitief',
                ctx.voorlopigStroom
              )
            : ''
        ) +

        (
          perMaand
            ? ''
            : rij(
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
              )
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
                'Volgens ingangsdata · naar rato van dagen',
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
            ? 'Stroomkosten'
            : (
                contractPeriode
                  ? 'Huidig contractsaldo'
                  : 'Totaal'
              ),
          '',
          perMaand
            ? stroomKosten
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
        ? stroomKosten
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
            perMaand
              ? (
                  num(
                    a.dagen,
                    0
                  ) +
                  (
                    deelPeriode
                      ? ' van ' +
                        volDagen
                      : ''
                  ) +
                  ' dagen \u00b7 alleen afname en teruglevering'
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
            perMaand
              ? 'stroomkosten'
              : contractPeriode
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
          'Dit stroomkostenblok bevat alleen afname en teruglevering. ' +
          'Netbeheer, voorschotten en de vaste belastingvermindering ' +
          'zijn hier niet meegerekend.'
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

    if (a.zonderBelastingen) {
      c.appendChild(el('div', 'display:flex;gap:24px;flex-wrap:wrap;line-height:1.6',
        kolom('Afname', eur(a.prijsInk,3) + ' / kWh', 'kaal + € 0,02/kWh opslag', D.rood) +
        kolom('Teruglevering', eur(a.prijsVerk,3) + ' / kWh', 'kaal − € 0,02/kWh opslag', D.groen)));
      c.appendChild(el('div','font-size:11px;margin-top:10px;color:'+D.grijs,
        'EB en btw uitgeschakeld voor deze stroomkostenweergave. Het contractoverzicht hieronder behoudt zijn volledige berekening.'));
      return c;
    }
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
    ' minmax(60px,1fr) 104px 84px 84px 96px;min-width:650px;' +
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
      o.even
        ? 'rgba(107,63,160,.02)'
        : 'transparent';

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
        '<span style="display:inline-block;position:relative;white-space:nowrap;">' +
        maandLabel(
          o.key
        ) +
        (o.contractLabel ? '<span style="position:absolute;left:0;top:100%;font-size:8px;font-weight:400;font-style:normal;line-height:1;margin-top:1px;white-space:nowrap;color:' +
          D.grijs + ';">' + o.contractLabel + '</span>' : '') +
        '</span></div>' +

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

  function bouwMaandstaat(rijen, sald, saldProg, huidigeKey, voorlopigeRijen, voorlopigeKey) {
    var c = sectie('be-staat', 'Voorschot &amp; verrekening');
    var periode = huidigContract(), vandaag = iso(new Date());
    var contractStart = periode.begin;
    // Voeg uitsluitend nog niet definitief verwerkte dagen binnen dit contractjaar toe.
    var echt = rijen.map(function(r){
      var copy = Object.assign({},r), deel=r.contractDeel;
      var keys=new Set(r.contractDagKeys||[]), extra=[];
      (voorlopigeRijen||[]).forEach(function(d){
        if(d && d.voorlopig && d.key>=deel.van && d.key<=deel.tot && d.key<=vandaag &&
          !keys.has(d.key) && !(r.contractBekendeDagen===deel.dagen)) {keys.add(d.key);extra.push(d);}
      });
      var velden=['imp','exp','inkoop','verkoop','laden','ontladen','pv','afrrImp','afrrExp','afrrVergoeding','dealsAantal'];
      extra.forEach(function(d){velden.forEach(function(k){copy[k]=getal(copy[k])+getal(d[k]);});});
      copy.contractVoorlopig=extra; copy.contractBekendeDagen=(r.contractBekendeDagen||0)+extra.length;
      copy.leeg=!(copy.contractBekendeDagen>0);
      if(extra.length){
        copy.voorlopig=true;
        copy.geprijsdeImportKwh=getal(r.imp)+extra.reduce(function(n,d){return n+(Number.isFinite(d.geprijsdeImportKwh)?d.geprijsdeImportKwh:d.imp);},0);
        copy.geprijsdeExportKwh=getal(r.exp)+extra.reduce(function(n,d){return n+(Number.isFinite(d.geprijsdeExportKwh)?d.geprijsdeExportKwh:d.exp);},0);
      }
      return copy;
    });
    var saldEcht=salderingReeks(echt,false), saldDefinitief=salderingReeks(rijen,false), bekendBedrag={}, werkelijkPer={};
    echt.forEach(function(r,i){
      if(r.leeg)return;
      var a=bereken(r,saldEcht[i].ongesaldeerd,r.contractBekendeDagen);
      var origineel=rijen[i];
      a.stroomEcht=origineel.leeg?0:bereken(origineel,saldDefinitief[i].ongesaldeerd,origineel.contractBekendeDagen||0).stroom;
      a.voorlopigStroom=a.stroom-a.stroomEcht;
      werkelijkPer[r.key]=a;
      if(r.contractBekendeDagen===dagenInMaand(r.key) && r.key<vandaag.slice(0,7))bekendBedrag[r.key]=a.stroom;
    });
    var ank=ankers(bekendBedrag), aantalVolledig=Object.keys(bekendBedrag).length;
    var cum=0,betaald=0,werkelijk=0,vastTot=0,maandenBekend=0,jaarStroom=0,jaarVast=0;
    var html=staatKop();
    echt.forEach(function(r,i){
      var deel=r.contractDeel,a=werkelijkPer[r.key];
      var verwacht=contractPrognose(r,contractHistorie,ank,aantalVolledig);
      var nog=Math.max(0,deel.dagen-r.contractBekendeDagen);
      var prog=a ? a.stroom+verwacht*nog/deel.dagen : verwacht;
      var verstreken=Math.max(0,Math.min(deel.dagen,datumDagNummer(new Date(vandaag+'T12:00:00'))-datumDagNummer(new Date(deel.van+'T12:00:00'))+1));
      var betaaldMaand=contractVoorschot(deel,verstreken);
      var vs=contractVoorschot(deel,deel.van>vandaag?deel.dagen:verstreken);
      betaald+=betaaldMaand;
      if(verstreken>0)maandenBekend++;
      var vastWerkelijk=verstreken*VAST_DAG;
      werkelijk+=a?a.stroom:0; vastTot+=vastWerkelijk;
      jaarStroom+=prog; jaarVast+=deel.dagen*VAST_DAG;
      var stroom=a?a.stroom:prog;
      var vast=a?vastWerkelijk:deel.dagen*VAST_DAG;
      cum+=stroom+vast+vs;
      var sub=null;
      if(r.key===vandaag.slice(0,7)) {
        var definitieveKeys=(rijen[i].contractDagKeys||[]).slice().sort();
        var laatsteDefinitief=definitieveKeys.length?definitieveKeys[definitieveKeys.length-1]:null;
        if(!laatsteDefinitief && rijen[i].contractBekendeDagen===deel.dagen)laatsteDefinitief=deel.tot;
        sub=laatsteDefinitief?'berekend t/m '+parseInt(laatsteDefinitief.slice(8),10)+' '+maandNaam(r.key):'nog geen definitieve dagen';
      }
      var voorlopigTekst=voorlopigeDagenTekst(r.contractVoorlopig,r.key);
      if(voorlopigTekst)sub=(sub?sub+' · ':'')+voorlopigTekst;
      if(verstreken>r.contractBekendeDagen)sub=(sub?sub+' · ':'')+(verstreken-r.contractBekendeDagen)+' dagen zonder resultaat';
      html+=staatRij({key:r.key,nu:r.key===vandaag.slice(0,7),even:i%2===0,geschat:!a,
        stroom:stroom,stroomEcht:a?a.stroomEcht:stroom,voorlopigStroom:a?a.voorlopigStroom:0,vast:vast,voorschot:vs,cum:cum,
        sub:sub,subKleur:verstreken>r.contractBekendeDagen?D.oranje:null,naast:a&&nog>0?prog:null,
        contractLabel:deel.eerste?'Start '+contractDatumTekst(deel.van):deel.laatste?'Einde '+contractDatumTekst(deel.tot):null,
        contractLaatste:deel.laatste});
    });
    var jaarVoorschot = periode.delen.reduce(function(totaal, deel) {
      return totaal + contractVoorschot(deel, deel.dagen);
    }, 0);

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

    var voortgang =
      contractVoortgang(
        contractStart,
        new Date()
      );

    var pct =
      Math.max(
        0,
        Math.min(
          100,
          voortgang.pctExact
        )
      );

    var pctTekst =
      (
        Math.round(
          pct * 10
        ) /
        10
      )
        .toFixed(1)
        .replace('.', ',');

    var eind =
      new Date(
        voortgang.grens.getTime()
      );

    eind.setDate(
      eind.getDate() - 1
    );

    var duurTekst =
      !voortgang.gestart
        ? 'nog niet gestart'
        : voortgang.voltooid
          ? '12 mnd · voltooid'
          : voortgang.maanden +
            ' mnd' +
            (
              voortgang.restDagen > 0
                ? ' + ' +
                  voortgang.restDagen +
                  (
                    voortgang.restDagen === 1
                      ? ' dag'
                      : ' dgn'
                  )
                : ''
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
          'Voorschotten t/m nu',
          '+' +
          eur(
            betaald
          ),
          'Volgens ingangsdata · naar rato van dagen',
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
          contractStart.getDate() +
          ' ' +
          MND_LANG[
            contractStart.getMonth()
          ] +
          ' ' +
          contractStart.getFullYear() +
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
        'height:16px;' +
        'position:relative;' +
        'font-size:10px;' +
        'color:' +
        D.paars +
        ';font-weight:600;' +
        '">' +

          '<span style="' +
          'position:absolute;' +
          'left:clamp(64px,' +
          pct +
          '%,calc(100% - 64px));' +
          'transform:translateX(-50%);' +
          'white-space:nowrap;' +
          '">' +
          '\u25cf nu (' +
          duurTekst +
          ')' +
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
        'Contractdag ' +
        voortgang.contractDag +
        ' van ' +
        voortgang.totaalDagen +
        ' \u00b7 ' +
        pctTekst +
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

      '<div style="margin-top:11px;overflow-x:auto;">' +
      html +
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

    if (a.zonderBelastingen) {
      ['summary-stroom-voordeel','summary-deal-result','summary-buy-price','summary-sell-price'].forEach(function(id) {
        zetPopover(id, 'Zonder EB en btw', 'Kale stroomprijs, met € 0,02/kWh opslag bij inkoop en € 0,02/kWh aftrek bij verkoop. Energiebelasting en btw zijn uit deze weergave gelaten.');
      });
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

    if (a.zonderBelastingen) {
      zetSubInfo('summary-stroom-voordeel', kwh(a.imp) + ' · zonder EB en btw · + € 0,02/kWh opslag');
      zetSubInfo('summary-deal-result', kwh(a.exp) + ' · zonder EB en btw · − € 0,02/kWh opslag');
    }
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

  // BE noemt de vergelijkingsreeks sinds 15 oktober anders. Alleen All-in
  // vervangt deze reeks door het eigen stroomresultaat; UIT herstelt de bron.
  // Presentatiefilter voor grafiek en geselecteerde stroomkostenperiode.
  // Het contractoverzicht en de opgeslagen bronresultaten blijven bruto.
  function beResultaatWeergave(a) {
    if (!a || cfg.resultaatBelastingen !== false || a.zonderBelastingen) return a;
    var b = Object.assign({}, a);
    b.zonderBelastingen = true;
    // De bron is inclusief btw en de bestaande 2 ct opslag. Eerst die
    // opslag terugdraaien, dan de btw, dan exact 2 ct per kant toepassen.
    b.allinInk = (a.balansInk + a.imp * OPSLAG) / BTW - a.imp * OPSLAG;
    b.allinVerk = (a.balansVerk + a.exp * OPSLAG) / BTW - a.exp * OPSLAG;
    b.balansInk = b.allinInk;
    b.balansVerk = b.allinVerk;
    b.eb = b.ebInk = b.ebVerk = 0;
    b.stroom = b.balansNetto = b.allinInk + b.allinVerk;
    b.prijsInk = b.prijsInkBalans = a.imp ? -b.allinInk / a.imp : 0;
    b.prijsVerk = b.prijsVerkBalans = a.exp ? b.allinVerk / a.exp : 0;
    return b;
  }

  function beCsvCel(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function beCsvMaak(rijen) {
    var keys = Array.from(new Set(rijen.flatMap(function(r) { return Object.keys(r); })));
    return '\ufeff' + [keys.map(beCsvCel).join(';')].concat(rijen.map(function(r) {
      return keys.map(function(k) { return beCsvCel(r[k]); }).join(';');
    })).join('\r\n');
  }
  function beCsvDatums(van, tot) {
    if (![van,tot].every(function(d) {return /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;}) || van > tot)
      throw Error('Kies een geldige begin- en einddatum.');
    var dagen=[];
    for(var t=Date.parse(van); t<=Date.parse(tot); t+=86400000) dagen.push(new Date(t).toISOString().slice(0,10));
    return dagen;
  }
  function beCsvRijen(j, dag) {
    var lijst = j && j.day_detail && j.day_detail.intervals;
    if (!j || j.period !== dag || j.interval !== 'day' || !j.pricing ||
        j.pricing.include_vat !== false || j.pricing.include_delivery_cost !== false)
      throw Error('Bron bevestigt de gevraagde dag en kale prijzen niet.');
    if (!Array.isArray(lijst) || !lijst.length) return [{datum:dag,export_status:'geen kwartierdata beschikbaar'}];
    var seen=new Set();
    return lijst.map(function(r) {
      if (!r.timestamp || !Number.isFinite(Date.parse(r.timestamp)) || seen.has(r.timestamp))
        throw Error('Ontbrekende of dubbele kwartiertijd in de bron.');
      seen.add(r.timestamp);
      return Object.assign({datum:dag,tijdzone:'Europe/Amsterdam',
        lokale_start:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',dateStyle:'short',timeStyle:'long'}).format(new Date(r.timestamp)),
        export_status:'brondata',include_vat:false,include_delivery_cost:false,
        bron_status:j.data_quality && j.data_quality.status || ''},r);
    });
  }
  function beCsvSlaOp(naam, rijen) {
    var a=document.createElement('a'),u=URL.createObjectURL(new Blob([beCsvMaak(rijen)],{type:'text/csv;charset=utf-8'}));
    a.href=u;a.download=naam;a.click();setTimeout(function(){URL.revokeObjectURL(u);},60000);
  }
  var beCsvBezig = false;
  function beResultaatExtraBediening(wrap) {
    wrap.style.flexWrap='wrap';
    var belastingKnop=document.createElement('button');
    belastingKnop.type='button';belastingKnop.id='be-resultaat-belastingen';
    belastingKnop.setAttribute('role','switch');
    belastingKnop.setAttribute('aria-label','EB & btw');
    belastingKnop.style.cssText='display:flex;align-items:center;gap:9px;border:0;padding:0;background:transparent;color:'+D.paars+';font:600 13px system-ui;letter-spacing:.03em;cursor:pointer';
    var belastingLabel=document.createElement('span');belastingLabel.textContent='EB & btw';
    var belastingTrack=document.createElement('span');belastingTrack.setAttribute('aria-hidden','true');
    belastingTrack.style.cssText='position:relative;display:inline-block;box-sizing:border-box;width:44px;height:24px;border-radius:12px;flex-shrink:0;border:1.5px solid '+D.paarsLicht+';transition:background .25s';
    var belastingThumb=document.createElement('span');
    belastingThumb.style.cssText='position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:transform .25s';
    belastingTrack.appendChild(belastingThumb);belastingKnop.append(belastingLabel,belastingTrack);
    function update(){
      belastingKnop.hidden=!cfg.allin;
      belastingKnop.style.display=cfg.allin?'flex':'none';
      belastingKnop.setAttribute('aria-checked',String(cfg.resultaatBelastingen));
      belastingLabel.style.color=cfg.resultaatBelastingen?D.paars:D.paarsLicht;
      belastingTrack.style.background=cfg.resultaatBelastingen?D.paars:D.rand;
      belastingThumb.style.transform=cfg.resultaatBelastingen?'translateX(20px)':'translateX(0)';
      belastingKnop.title='Grafiek en stroomkosten: energiebelasting en btw. De opslag van € 0,02 per kWh blijft aan beide kanten staan.';
    }
    belastingKnop.addEventListener('click',function(){
      cfg.resultaatBelastingen=!cfg.resultaatBelastingen;
      localStorage.setItem('be_cfg_resultaat_belastingen',cfg.resultaatBelastingen?'aan':'uit');
      update();herteken();
    });
    wrap.appendChild(belastingKnop);
    wrap.querySelector('label').addEventListener('click',function(){update();});
    update();
  }
  var beCsvPaneel;
  function beKwartierExportBediening(wrap) {
    if(beCsvPaneel){wrap.appendChild(beCsvPaneel);return;}
    var det=document.createElement('details');beCsvPaneel=det;det.open=true;det.style.cssText='font-size:12px;max-width:100%;color:'+D.paars;
    var sum=document.createElement('summary');sum.textContent='Download kwartierdata';sum.style.cursor='pointer';det.appendChild(sum);
    var box=document.createElement('div');box.style.cssText='display:flex;gap:8px;align-items:end;flex-wrap:wrap;padding:10px 0';
    var vandaag=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
    function datum(naam,waarde){var l=document.createElement('label');l.textContent=naam+' ';var i=document.createElement('input');i.type='date';i.value=waarde;i.max=vandaag;i.style.cssText='max-width:150px;padding:5px;border:1px solid '+D.rand+';border-radius:6px;font:inherit';l.appendChild(i);box.appendChild(l);return i;}
    var van=datum('Vanaf',iso(cfg.start)),tot=datum('Tot en met',vandaag);
    var start=document.createElement('button'),stop=document.createElement('button'),status=document.createElement('div');
    start.type=stop.type='button';start.textContent='Download CSV';stop.textContent='Stoppen';stop.hidden=true;
    [start,stop].forEach(function(b){b.style.cssText='border:1px solid '+D.paarsLicht+';border-radius:8px;padding:8px 12px;background:transparent;color:'+D.paars+';font:inherit;cursor:pointer';box.appendChild(b);});
    var voortgang=document.createElement('progress');voortgang.max=1;voortgang.value=0;voortgang.hidden=true;voortgang.style.cssText='width:100%;height:10px;accent-color:'+D.paars;voortgang.setAttribute('aria-label','Voortgang kwartierexport');box.appendChild(voortgang);
    status.setAttribute('role','status');status.style.cssText='flex-basis:100%;line-height:1.5';
    status.textContent='Alle bronvelden per kwartier. Prijzen zonder btw, energiebelasting en opslag; lege bronwaarden blijven leeg. UTC-tijden blijven behouden.';
    box.appendChild(status);det.appendChild(box);wrap.appendChild(det);
    var afgebroken=false,controller;
    stop.onclick=function(){afgebroken=true;if(controller)controller.abort();};
    start.onclick=async function(){
      if(beCsvBezig)return;
      var dagen;
      try{dagen=beCsvDatums(van.value,tot.value);if(tot.value>vandaag)throw Error('De einddatum mag niet in de toekomst liggen.');}
      catch(e){status.textContent=e.message;return;}
      var begin=van.value,eind=tot.value,rijen=[],fouten=0,leeg=0,klaar=0;
      afgebroken=false;beCsvBezig=true;status.textContent='Export voorbereiden · 0/'+dagen.length+' dagen';voortgang.hidden=false;voortgang.max=dagen.length;voortgang.value=0;start.disabled=van.disabled=tot.disabled=true;stop.hidden=false;
      function wacht(ms){return new Promise(function(resolve){var t=Date.now();function tick(){if(afgebroken||Date.now()-t>=ms)resolve();else setTimeout(tick,200);}tick();});}
      try {
        for(var dag of dagen){
          if(afgebroken)break;
          var gelukt=false;
          for(var poging=0;poging<4&&!afgebroken;poging++){
            await wacht(1250);if(afgebroken)break;
            status.textContent='Ophalen '+dag+' · '+klaar+'/'+dagen.length+' dagen';
            controller=new AbortController();var timeout=setTimeout(function(){controller.abort();},45000);
            try {
              var u=new URL('/customer/'+encodeURIComponent(KLANT)+'/results-v2-api/',location.origin);
              u.search=new URLSearchParams({interval:'day',period:dag,include_vat:'0',include_delivery_cost:'0'});
              var r=await origFetch(u.href,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
              if(r.status===429&&poging<3){
                clearTimeout(timeout);var delay=Math.max(60000,(Number(r.headers.get('Retry-After'))||0)*1000);
                var hervat=Date.now()+delay;
                while(!afgebroken&&Date.now()<hervat){
                  status.textContent=klaar+'/'+dagen.length+' dagen · BE vraagt om een pauze · verder over '+Math.ceil((hervat-Date.now())/1000)+' s';
                  await wacht(Math.min(1000,hervat-Date.now()));
                }
                continue;
              }
              if(!r.ok)throw Error('HTTP '+r.status);
              var jr=beCsvRijen(await r.json(),dag);rijen.push.apply(rijen,jr);
              if(jr.length===1&&jr[0].export_status!=='brondata')leeg++;
              gelukt=true;break;
            } catch(e) {
              if(afgebroken)break;
              if(poging===3){rijen.push({datum:dag,export_status:'ophalen mislukt',fout:e.message});fouten++;}
            } finally {clearTimeout(timeout);controller=null;}
          }
          if(!afgebroken){klaar++;voortgang.value=klaar;}
        }
        if(rijen.length)beCsvSlaOp('BE-kwartierdata-'+begin+'-tot-'+eind+(afgebroken||fouten?'-gedeeltelijk':'')+'.csv',rijen);
        status.textContent=(afgebroken?'Gestopt. Deelbestand gedownload. ':'CSV gedownload. ')+klaar+'/'+dagen.length+' dagen; '+fouten+' mislukt; '+leeg+' zonder kwartierdata.';
      } catch(e){status.textContent='Export onderbroken: '+e.message;if(rijen.length)beCsvSlaOp('BE-kwartierdata-'+begin+'-gedeeltelijk.csv',rijen);}
      finally {beCsvBezig=false;start.disabled=van.disabled=tot.disabled=false;stop.hidden=true;}
    };
  }

  function beGrafiekRol(label) {
    return label === 'Totaal voordeel t.o.v. vast' ? 'Totaal' : label;
  }

  function beGrafiekDataSignatuur(chart) {
    return JSON.stringify([chart.data.labels, chart.data.datasets.map(function (d) {
      return [d.label, d.data];
    })]);
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
    if (laatste && laatste.interval === 'all_time') { pasAllTimeGrafiekAan(chart, rijen && rijen.beAllTime, allin); return; }
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
      var a = item && item.rij ? beResultaatWeergave(bereken(item.rij, naSaldering(key) ? item.rij.exp : 0, 1)) : null;
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
      laatste !== bron ||
      !pastBijActievePeriode(bron, actievePeriode())
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
      // Een nieuwe native render kan ook dezelfde maand opnieuw aanleveren.
      // Bewaar die actuele bron, nooit de vorige All-in-projectie als origineel.
      var externGewijzigd = chart.$beAllinSignatuur &&
        chart.$beAllinSignatuur !== beGrafiekDataSignatuur(chart);
      if (externGewijzigd) {
        chart.$beVoorlopig = null;
        chart.$beVoorlopigIndices = [];
        chartOrig = null;
      }
      herstelVoorlopigeGrafiek(chart);
      if (!externGewijzigd && chartOrig && chartOrig.chart === chart) {
        chart.data.datasets = chart.data.datasets.filter(function (d) {
          return d.label !== 'Energiebelasting';
        });
        chartOrig.sets.forEach(function (o) {
          var d = chart.data.datasets.find(function (v) {
            return beGrafiekRol(v.label) === beGrafiekRol(o.label);
          });
          if (d) { d.label = o.label; d.data = o.data.slice(); }
        });
      }

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
                  beGrafiekRol(d.label)
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
              beGrafiekRol(ds.label) ===
              'Totaal'
            ) {
              ds.label = 'Totaal';
              ds.data =
                perPeriode.map(
                  function (a) {
                    return a.stroom;
                  }
                );
            }
          }
        );

      if (cfg.resultaatBelastingen !== false) chart.data.datasets.push({
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
    if (aan && perPeriode && perPeriode.length === n) {
      pasVoorlopigeMaandGrafiekAan(chart, voorlopigeRijen || [], true);
    }
    // De toelichting hoort bij de weergegeven berekening, niet bij BE's vergelijking.
    var toelichting = document.querySelector('.results-summary-card .card-header small');
    if (toelichting) {
      if (toelichting.$beOrigineel === undefined) toelichting.$beOrigineel = toelichting.textContent;
      toelichting.textContent = aan && perPeriode && perPeriode.length === n
        ? (cfg.resultaatBelastingen !== false
          ? 'Totaal: verkoopopbrengst min inkoopkosten, inclusief all-in-correcties. Zonder besparingen ten opzichte van een vast contract.'
          : 'Totaal: verkoop min inkoop, zonder EB en btw. Met € 0,02/kWh opslag bij inkoop en € 0,02/kWh aftrek bij verkoop.')
        : toelichting.$beOrigineel;
    }
    chart.$beAllinSignatuur = beGrafiekDataSignatuur(chart);

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

  // All time spans the installation's first recorded day through today.
  // Confirmed data wins; recent missing days may be supplemented by measured
  // provisional records. Missing measurements are never replaced by forecasts.
  function maakAllTime(bron, opslag, g, nu) {
    var vandaag = iso(nu), begin = g && g.min_day;
    var verwerkt = g && g.max_day;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(begin || '') || !/^\d{4}-\d{2}-\d{2}$/.test(verwerkt || '')) return null;
    var dagen = Math.max(0, datumDagNummer(nu) - datumDagNummer(new Date(begin + 'T12:00:00')) + 1);
    var velden = ['imp','exp','inkoop','verkoop','laden','ontladen','pv','afrrImp','afrrExp','afrrVergoeding','dealsAantal'];
    var maanden = {}, extra = [], ontbreekt = [], onvolledig = [];
    (bron.rijen || []).forEach(function(r) {
      var m = Object.assign({}, r, {geprijsdeImportKwh:r.imp,geprijsdeExportKwh:r.exp});
      maanden[r.key] = m;
    });
    Object.keys(opslag).sort().forEach(function(key) {
      var r = opslag[key];
      if (key <= verwerkt || key < begin || key > vandaag || !r || !r.voorlopig ||
          !['imp','exp','inkoop','verkoop'].every(function(k){return Number.isFinite(r[k]);})) return;
      extra.push(r);
      if (r.deelresultaat || r.prijsOnvolledig) onvolledig.push(key);
      var mk = key.slice(0,7), m = maanden[mk];
      if (!m) { m = {key:mk,bronAanwezig:true,geprijsdeImportKwh:0,geprijsdeExportKwh:0}; velden.forEach(function(k){m[k]=0;}); maanden[mk]=m; }
      velden.forEach(function(k){m[k]=getal(m[k])+getal(r[k]);});
      m.voorlopig = true;
      m.geprijsdeImportKwh += Number.isFinite(r.geprijsdeImportKwh) ? r.geprijsdeImportKwh : r.imp;
      m.geprijsdeExportKwh += Number.isFinite(r.geprijsdeExportKwh) ? r.geprijsdeExportKwh : r.exp;
    });
    var heeft = new Set(extra.map(function(r){return r.key;}));
    var cursor = new Date(verwerkt+'T12:00:00'); cursor.setDate(cursor.getDate()+1);
    while (iso(cursor) <= vandaag) { if (!heeft.has(iso(cursor))) ontbreekt.push(iso(cursor)); cursor.setDate(cursor.getDate()+1); }
    var rijen = Object.keys(maanden).sort().map(function(k){return maanden[k];});
    // Preserve annual settlement boundaries instead of netting separate years.
    var groepen = {}, saldMap = {};
    rijen.forEach(function(r){
      var y=+r.key.slice(0,4), m=+r.key.slice(5,7);
      var groep=y-(m<cfg.start.getMonth()+1?1:0);
      (groepen[groep]||(groepen[groep]=[])).push(r);
    });
    Object.keys(groepen).forEach(function(k){salderingReeks(groepen[k],false).forEach(function(r){saldMap[r.key]=r.ongesaldeerd;});});
    var totaal=Object.assign({},bron.totaal), geprijsdImp=bron.totaal.imp, geprijsdExp=bron.totaal.exp;
    extra.forEach(function(r){
      velden.forEach(function(k){totaal[k]=getal(totaal[k])+getal(r[k]);});
      geprijsdImp+=Number.isFinite(r.geprijsdeImportKwh)?r.geprijsdeImportKwh:r.imp;
      geprijsdExp+=Number.isFinite(r.geprijsdeExportKwh)?r.geprijsdeExportKwh:r.exp;
    });
    if(extra.length){totaal.voorlopig=true;totaal.geprijsdeImportKwh=geprijsdImp;totaal.geprijsdeExportKwh=geprijsdExp;}
    var onges=rijen.reduce(function(n,r){return n+(saldMap[r.key]||0);},0);
    var berekend=rijen.map(function(r){return bereken(r,saldMap[r.key]||0,0);});
    return {a:bereken(totaal,onges,dagen), rijen:rijen, berekend:berekend, extra:extra,
      begin:begin, einde:vandaag, verwerkt:verwerkt, ontbreekt:ontbreekt, onvolledig:onvolledig,
      ruw:{inkoop:totaal.inkoop,verkoop:totaal.verkoop,prijsInk:totaal.imp?totaal.inkoop/totaal.imp:0,prijsVerk:totaal.exp?totaal.verkoop/totaal.exp:0}};
  }

  function pasAllTimeGrafiekAan(chart, info, aan) {
    if (!chart || !info || !aan) return;
    var labels=chart.data.labels.slice(),sets=chart.data.datasets.map(function(d){return {ref:d,data:d.data.slice()};});
    var nativeKeys=laatste.rijen.map(function(r){return r.key;});
    chart.data.labels=info.rijen.map(function(r){var i=nativeKeys.indexOf(r.key);return i>=0?labels[i]:'~'+maandLabel(r.key);});
    chart.data.datasets.forEach(function(d){
      var field={'Inkoop kosten':'allinInk','Verkoop opbrengsten':'allinVerk','Totaal':'stroom','Energiebelasting':'eb'}[d.label];
      if(field)d.data=info.berekend.map(function(a){a=beResultaatWeergave(a);return field==='allinInk'?-a[field]:a[field];});
    });
    chart.$beVoorlopig={basisLabels:labels,datasets:sets,projectedLabels:chart.data.labels.slice()};
    chart.$beVoorlopigIndices=info.rijen.map(function(r,i){return r.voorlopig?i:-1;}).filter(function(i){return i>=0;});
  }

  function isJaarInterval(interval) {
    return interval === 'year' || interval === 'rolling_year';
  }

  function actievePeriode() {
    var knop = document.querySelector('.summary-granularity.active');
    var g = knop ? knop.textContent.trim().toLowerCase() : 'maand';

    // All time has its own API period; never fall back to the hidden month picker.
    if ((knop && knop.getAttribute('data-granularity') === 'all_time') || g === 'all time') {
      return { interval: 'all_time', periode: 'all' };
    }

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

        // Observe dashboard price refreshes immediately, without changing its response.
        if (url.indexOf('/customer/current-prices/api/') !== -1) {
          p.then(function (resp) {
            if (!resp.ok) return;
            return resp.clone().json().then(function (j) {
              if (isActueelPagina()) beOntvangLivePrijzen(j);
              beBewaarPrijzenLater(j);
            });
          }).catch(function () {});
        }

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
    return; // v6: Resultaten blijft native; het eigen overzicht leest zijn eigen data.
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
    if (laatste && laatste.interval === 'all_time') return 'All time';
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

  // Bewaar de oorspronkelijke BE-cellen per DOM-rij; herladen maakt nieuwe rijen.
  var beTabelOrigineel = new WeakMap();
  function beResultatenTabel(perPeriode, bron) {
    var wrapper=document.getElementById('summary-table-wrapper');
    var heading=document.getElementById('summary-table-heading');
    var panelen=document.getElementById('be-panelen');
    if(!wrapper||!panelen||!panelen.parentNode)return;
    var host=document.getElementById('be-resultatentabel');
    if(!host){
      host=document.createElement('div');host.id='be-resultatentabel';
      host.style.cssText='margin-top:18px;padding:18px;border:1px solid '+D.rand+';border-radius:12px;min-width:0';
      panelen.parentNode.insertBefore(host,panelen.nextSibling);
    }
    // Buiten be-panelen: hertekenen van onze kaarten mag de BE-rijen niet wissen.
    if(heading&&heading.parentNode!==host)host.appendChild(heading);
    if(wrapper.parentNode!==host)host.appendChild(wrapper);
    var body=document.getElementById('summary-table-body');
    if(!body)return;
    var rows=Array.from(body.rows),headers=Array.from(wrapper.querySelectorAll('thead th'));
    var aan=cfg.allin&&bron&&bron.interval!=='day';
    host.hidden=!bron||bron.interval==='day'||!rows.length;
    var note=document.getElementById('be-resultatentabel-uitleg');
    if(!note){note=document.createElement('p');note.id='be-resultatentabel-uitleg';note.style.cssText='font-size:12px;color:'+D.grijs+';margin:10px 0';host.insertBefore(note,wrapper);}
    var uitleg=aan?'Totaal = verkoopopbrengsten − inkoopkosten. '+(cfg.resultaatBelastingen?'Inclusief btw en energiebelasting na saldering.':'Zonder btw en energiebelasting.')+' Opslag aan beide kanten inbegrepen. Beschikbare bronperioden; prognoses en losse voorlopige aanvullingen staan in het overzicht erboven.':'';
    if(note.textContent!==uitleg)note.textContent=uitleg;
    note.hidden=!aan;
    function herstel(node){
      var oud=beTabelOrigineel.get(node);
      if(oud&&node.innerHTML!==oud)node.innerHTML=oud;
    }
    headers.forEach(function(th,i){
      if(!beTabelOrigineel.has(th))beTabelOrigineel.set(th,th.innerHTML);
      th.hidden=aan&&(i===5||i===6);
      if(i===1){
        if(!th.dataset.beOrigTitle)th.dataset.beOrigTitle=th.title||' ';
        th.title=aan?'Verkoopopbrengsten min inkoopkosten, volgens de gekozen belastingstand.':th.dataset.beOrigTitle.trim();
      }
    });
    rows.forEach(function(row,index){
      if(!beTabelOrigineel.has(row))beTabelOrigineel.set(row,row.innerHTML);
      if(!aan){herstel(row);return;}
      var a=perPeriode&&perPeriode[index],r=bron.rijen&&bron.rijen[index];
      // Nooit resultaten op een andere bronperiode plakken.
      var geldig=rows.length===bron.rijen.length&&a&&r&&a.key===r.key&&r.bronAanwezig!==false;
      var cells=Array.from(row.cells);if(cells.length<9)return;
      [5,6].forEach(function(i){cells[i].hidden=true;});
      function zet(i,value,decimalen){
        var tekst=Number.isFinite(value)?new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:decimalen,maximumFractionDigits:decimalen}).format(value):'—';
        if(cells[i].textContent!==tekst)cells[i].textContent=tekst;
        cells[i].removeAttribute('title');
      }
      zet(1,geldig?a.stroom:NaN,2);zet(2,geldig?-a.allinInk:NaN,2);zet(3,geldig?a.allinVerk:NaN,2);
      cells[1].classList.remove('text-success','text-danger');
      cells[1].style.color=geldig?(a.stroom<0?D.rood:D.groen):D.grijs;
      var prijs=function(n){return Number.isFinite(n)?new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:3,maximumFractionDigits:3}).format(n)+' / kWh':'—';};
      var prijzen=prijs(geldig&&a.imp>0?-a.allinInk/a.imp:NaN)+'<br>'+prijs(geldig&&a.exp>0?a.allinVerk/a.exp:NaN);
      if(cells[4].innerHTML!==prijzen)cells[4].innerHTML=prijzen;
    });
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
        if (laatste !== renderBron || !pastBijActievePeriode(renderBron, actievePeriode())) return;
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
            laatste.interval === 'all_time' ? 'de gehele beschikbare periode' : 'deze periode';
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

        var allTimeInfo = laatste.interval === 'all_time'
          ? maakAllTime(laatste, leesVoorlopigeDagen(), grenzen(), new Date()) : null;
        if (allTimeInfo) {
          a = allTimeInfo.a;
          voorlopigeRijen = allTimeInfo.extra.slice();
          voorlopigeRijen.beAllTime = allTimeInfo;
          perPeriode = laatste.rijen.map(function(r){return allTimeInfo.berekend.find(function(x){return x.key===r.key;});});
        }
        a = beResultaatWeergave(a);
        perPeriode = perPeriode.map(beResultaatWeergave);
        beResultatenTabel(perPeriode, laatste);
        pasBalansKaartenAan(
          a,
          allTimeInfo ? allTimeInfo.ruw : laatste.ruw,
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

        if (laatste.interval === 'month') {
          kaartCtx.voorlopigStroom = 0;
          kaartCtx.voorlopigAantal = voorlopigeRijen.length;
          voorlopigeRijen.forEach(function (r) {
            kaartCtx.voorlopigStroom += beResultaatWeergave(bereken(
              r, naSaldering(r.key) ? r.exp : 0, 1
            )).stroom;
          });
        }

        var kaartEl =
          bouwHoofdkaart(
            a,
            kaartCtx
          );

        if (allTimeInfo) {
          var fmt = function(key) { var p=key.split('-');return p[2]+'-'+p[1]+'-'+p[0]; };
          var melding = document.createElement('div');
          melding.id='be-all-time-bereik';
          melding.style.cssText='font-size:12px;color:'+D.grijs+';margin-bottom:12px;line-height:1.6';
          melding.textContent='Vanaf aansluiting '+fmt(allTimeInfo.begin)+' t/m vandaag '+fmt(allTimeInfo.einde)+
            '. Verwerkt t/m '+fmt(allTimeInfo.verwerkt)+'.'+
            (allTimeInfo.extra.length ? ' '+allTimeInfo.extra.length+' voorlopige dag(en) meegerekend.' : '')+
            (allTimeInfo.onvolledig.length ? ' Voorlopige metingen/prijzen deels onvolledig: '+allTimeInfo.onvolledig.map(fmt).join(', ')+'.' : '')+
            (allTimeInfo.ontbreekt.length ? ' Nog geen resultaat voor: '+allTimeInfo.ontbreekt.map(fmt).join(', ')+'.' : '');
          kaartEl.insertBefore(melding,kaartEl.firstChild.nextSibling);
        }
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
        localStorage.setItem(LS.allin, cfg.allin ? 'aan' : 'uit');

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
    beResultaatExtraBediening(wrap);

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
        'width:min(430px, calc(100vw - 24px));' +
        'box-sizing:border-box;' +
        'max-height:min(82vh, 760px);' +
        'overflow:auto;' +
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
        'Instellingen v6.1.5' +
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

      '<div style="display:flex;gap:6px;margin-bottom:13px;">' +
        '<button id="be-tabknop-alg" data-tab="alg" class="be-tabknop" style="flex:1;padding:7px;border-radius:6px;border:1px solid ' + D.paars + ';background:' + D.paars + ';color:#fff;font-size:11px;font-weight:600;cursor:pointer;">Algemeen</button>' +
        '<button id="be-tabknop-download" data-tab="download" class="be-tabknop" style="flex:1;padding:7px;border-radius:6px;border:1px solid ' + D.rand + ';background:#fff;color:' + D.paars + ';font-size:11px;font-weight:600;cursor:pointer;">Downloads</button>' +
      '</div>' +

      '<div id="be-tab-alg">' +

      veld(
        'be-p-voorschot',
        'Basisvoorschot per maand (\u20ac)',
        cfg.voorschot.toFixed(2),
        'number'
      ) +

      '<div id="be-voorschot-historie"></div>' +

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

      knopje('be-p-dark', 'Donkere modus', 'Op alle pagina’s, met behoud van de bestaande indeling', beDarkOn) +

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

      '</div>' +

      '<div id="be-tab-download" style="display:none;">' +
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

    // De 340 hieronder hoorde bij het oude paneel van 330 breed. Nu het
    // paneel breder is en per scherm kan verschillen, plaatsen we hem na het
    // toevoegen opnieuw op zijn werkelijke breedte en klemmen we hem binnen
    // beeld, zodat hij er aan de rechterkant niet meer afloopt.
    (function plaatsPaneel() {
      function zet() {
        var rr = hdr.getBoundingClientRect();
        var breedte = p.offsetWidth || 430;
        var rand = 12;
        var zichtbaar = document.documentElement.clientWidth;
        var wens = window.scrollX + rr.right - breedte;
        var meest = window.scrollX + zichtbaar - breedte - rand;
        var minst = window.scrollX + rand;
        p.style.left = Math.round(Math.max(minst, Math.min(wens, meest))) + 'px';
        p.style.top = Math.round(window.scrollY + rr.bottom + 6) + 'px';
      }
      zet();
      window.addEventListener('resize', zet);
      var weg = new MutationObserver(function () {
        if (!document.getElementById('be-paneel')) {
          window.removeEventListener('resize', zet);
          weg.disconnect();
        }
      });
      weg.observe(document.body, { childList: true });
    })();

    document.getElementById(
      'be-p-sluit'
    ).addEventListener(
      'click',
      function () {
        p.remove();
      }
    );

    // Instellingen en downloads hebben ieder een eigen sectie.
    Array.prototype.forEach.call(p.querySelectorAll('.be-tabknop'), function (knop) {
      knop.addEventListener('click', function () {
        var welke = knop.getAttribute('data-tab');
        Array.prototype.forEach.call(p.querySelectorAll('.be-tabknop'), function (k) {
          var aan = k === knop;
          k.style.background = aan ? D.paars : '#fff';
          k.style.color = aan ? '#fff' : D.paars;
          k.style.borderColor = aan ? D.paars : D.rand;
        });
        var alg = document.getElementById('be-tab-alg');
        var downloads = document.getElementById('be-tab-download');
        if (alg) alg.style.display = welke === 'alg' ? '' : 'none';
        if (downloads) downloads.style.display = welke === 'download' ? '' : 'none';
      });
    });

    beKwartierExportBediening(document.getElementById('be-tab-download'));
    beVoorschotInstellingen(document.getElementById('be-voorschot-historie'));

    var staat = {
      dark: beDarkOn,
      sald:
        cfg.saldering,

      balans:
        cfg.balansBlok
    };

    hangKnopje('be-p-dark', staat, 'dark');

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

        var historie;
        try {
          historie=beVoorschotValideer(Array.from(document.querySelectorAll('#be-voorschot-historie .be-vs-rijen > div')).map(function(r){return {datum:r.children[0].value,bedrag:r.children[1].value};}));
        }catch(e){return fout(e.message);}
        cfg.voorschotHistorie=historie;
        localStorage.setItem('be_cfg_voorschot_historie',JSON.stringify(historie));
        beDarkApply(staat.dark);

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

  /* Financieel v6.1.5. Eigen scherm; geen herschrijving van Balans-kaarten.
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
    var mobileChrome=[],mobileHeader=null,mobileSidebar=null;
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
        #title:focus{outline:none;box-shadow:none}
        *{box-sizing:border-box}[hidden]{display:none!important}h1,h2,h3,p{margin:0}h1{font-size:23px}h2{font-size:16px}h3{font-size:14px}small,.help,.muted{color:var(--muted)}a{color:var(--purple)}button,input,select{font:inherit;color:inherit}button,select,input[type=date],input[type=month],input[type=number]{border:1px solid var(--line);border-radius:6px;background:var(--paper);padding:7px 10px;min-height:34px}button,summary{cursor:pointer}button:hover{border-color:var(--purple)}button:disabled{opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--purple);outline-offset:3px}input[type=checkbox]{accent-color:var(--purple)}
        .page{padding:24px 28px 36px;background:var(--bg);min-height:100%}.wrap{max-width:1380px;margin:auto}.top,.actions,.fields,.toggles,.section-head,.legend{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.top,.section-head{justify-content:space-between}.fields label{display:grid;gap:3px;font-size:11px;color:var(--muted)}.fields input,.fields select{font-size:13px;color:var(--ink)}.filters{margin-top:18px}.toggles{margin-top:12px;font-size:12px}.toggles label{display:flex;align-items:center;gap:5px}.toggles small{margin-left:auto}.panel{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:18px;margin-top:14px}.notice{font-size:12px;color:var(--muted);margin-top:12px}.notice.warning{color:var(--red)}.help{font-size:11px;line-height:1.5;margin-top:8px}.positive{color:var(--green)}.negative{color:var(--red)}
        .summary{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:7px;margin-bottom:16px}.summary>div{padding:10px 14px}.summary>div+div{border-left:1px solid var(--line)}.summary small{display:block;font-size:11px}.summary strong{font-size:23px;font-variant-numeric:tabular-nums}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}th,td{text-align:right;padding:9px 10px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}th{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600}th:first-child{width:auto}tbody tr:nth-child(odd){background:color-mix(in srgb,var(--soft) 30%,var(--paper))}.month-cell{display:flex;align-items:center;gap:12px}.month-name{width:104px;flex-shrink:0}.month-link{border:0;padding:0;min-height:0;background:none;font-weight:500}.month-name small{display:block;font-size:10px}.month-meter{flex:1;min-width:190px;height:24px;position:relative;background:var(--soft);border-radius:9px;overflow:hidden}.month-meter>span{height:10px;display:block;min-width:1px;border-radius:9px}.current-month{font-weight:650}.current-month .month-link{font-weight:650}.future{color:var(--muted);font-style:italic}.forecast-row{border-top:1px dashed var(--line);color:var(--muted)}.end-row{background:var(--soft);font-weight:700}tfoot td{padding-top:10px;padding-bottom:10px}tfoot .known-row{font-weight:700;border-top:2px solid var(--line)}.legend{font-size:11px;color:var(--muted);gap:18px}.dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}.chart{margin-top:8px}.chart svg{width:100%;height:auto;display:block}.purchase-summary{display:flex;gap:28px;margin-top:9px;font-size:13px}.purchase-summary strong{font-variant-numeric:tabular-nums}.row{display:flex;gap:16px;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}.row strong{white-space:nowrap}.row.total{font-weight:650;border-top:1px solid var(--line)}.grid{display:grid;gap:12px}.settings-grid{grid-template-columns:repeat(3,1fr);margin:12px 0}.settings-grid label{display:grid;gap:5px;font-size:12px}.settings-grid input{min-width:0;width:100%}.note-list{display:grid;gap:9px;margin-top:12px;font-size:12px}.bar{height:7px;background:var(--soft);margin-top:8px}.bar span{display:block;height:100%;background:var(--purple)}summary{font-size:13px;font-weight:600}.empty{padding:24px;text-align:center;color:var(--muted)}.narrative{font-size:13px;margin-top:12px}.badge{font-size:11px;color:var(--muted)}
        .projected-meter{opacity:.38;margin-top:4px}.forecast-value{display:block;color:var(--muted);font-size:11px;margin-top:5px}.month-detail{white-space:normal;text-align:left;padding:14px;background:var(--paper);border-left:3px solid var(--purple)}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 30px}.detail-grid h3{font-size:13px;margin:6px 0}.detail-period{font-size:12px;color:var(--muted);margin-bottom:10px}.detail-row td{padding:0 0 12px}.month-link:hover{text-decoration:underline}@media(max-width:750px){.page{padding:16px 12px}.panel{padding:12px}.summary strong{font-size:18px}.summary>div{padding:8px}.month-meter{min-width:190px}.detail-grid{grid-template-columns:1fr}th:first-child{width:auto}.settings-grid{grid-template-columns:1fr 1fr}.purchase-summary{gap:12px;font-size:12px}td,th{padding:8px}.toggles small{margin-left:0}.actions{gap:6px}}@media(max-width:450px){.settings-grid{grid-template-columns:1fr}.summary strong{font-size:16px}.summary small{font-size:10px}}

        .month-statement{table-layout:fixed;min-width:900px;font-size:12px}.month-plot-col{width:auto}.amount-col{width:110px}.month-statement td,.month-statement th{padding-left:7px;padding-right:7px}.month-statement th{font-size:9px;letter-spacing:.15px;white-space:normal}.month-statement td:first-child{padding-right:18px}.month-statement .detail-row td{padding:0}.month-meter{border-radius:3px;background:repeating-linear-gradient(to right,var(--soft),var(--soft) calc(25% - 1px),var(--line) calc(25% - 1px),var(--line) 25%)}.month-meter>span{border-radius:2px}.month-cell{gap:12px}.month-meter>span:only-child{height:14px;margin-top:5px}.period-switch,.unit-switch{display:inline-flex;border:1px solid var(--line);padding:3px;border-radius:8px;gap:3px;background:var(--paper)}.period-switch button,.unit-switch button{border:0;background:transparent;white-space:nowrap;font-size:13px;padding:7px 14px}.period-switch button[aria-pressed=true],.unit-switch button[aria-pressed=true]{background:var(--purple);color:var(--paper);font-weight:600}.period-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.period-navigation{display:flex;align-items:end;gap:6px}.period-navigation label{min-width:160px}.period-navigation input,.period-navigation select{width:100%}.period-switch button:focus-visible,.unit-switch button:focus-visible{outline-offset:0}.chart-stage{position:relative;isolation:isolate}.chart-stage svg{width:100%;height:auto;min-height:210px;display:block}.chart-hit{fill:transparent;cursor:crosshair}.chart-hit:hover,.chart-hit:focus{fill:var(--purple);fill-opacity:.08;outline:none}.chart-hit:focus{stroke:var(--purple);stroke-width:1}.chart-tooltip{position:absolute;z-index:2;width:300px;max-width:calc(100% - 12px);padding:12px 14px;background:var(--paper);border:1px solid var(--line);box-shadow:0 5px 24px #0002;border-radius:8px;pointer-events:none;font-size:12px}.chart-tooltip h3{font-size:13px;margin-bottom:3px}.tip-state{color:var(--muted);font-size:11px;margin-bottom:8px}.tip-grid{display:grid;grid-template-columns:1fr auto auto;gap:5px 12px;align-items:baseline;font-variant-numeric:tabular-nums}.tip-grid strong{text-align:right;white-space:nowrap}.tip-grid small{text-align:right}.tip-foot{font-size:10px;color:var(--muted);border-top:1px solid var(--line);padding-top:7px;margin-top:8px}.chart-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;align-items:center;color:var(--muted);margin-top:6px}.legend-outline{display:inline-block;width:12px;height:9px;border:1.5px dashed currentColor;margin-right:4px}.legend-solid{display:inline-block;width:12px;height:9px;background:currentColor;opacity:.7;margin-right:4px}.chart-hint{margin-left:auto}.chart-stage [data-chart-hit]{touch-action:pan-y}.chart-stage svg{overflow:visible}.chart-title-note{font-size:11px;color:var(--muted)}
        .chart-tooltip{position:static;width:auto;max-width:none;padding:0;border:0;box-shadow:none;border-radius:0;background:transparent;pointer-events:none}.chart-readout{min-height:70px;margin-top:6px;padding:10px 12px;border-radius:6px;background:var(--soft);display:grid;align-content:center}.tip-values{display:flex;align-items:baseline;gap:10px 22px;flex-wrap:wrap;font-size:12px}.tip-values>strong{color:var(--purple);min-width:100px}.tip-values span{color:var(--muted);white-space:nowrap}.tip-values span strong{color:var(--ink);margin-left:4px;font-variant-numeric:tabular-nums}.chart-readout .tip-foot{border:0;margin-top:5px;padding:0}.chart-readout .help{margin:0}.month-name{width:132px}.month-meter{display:flex;align-items:stretch;height:12px;background:var(--soft);border-radius:4px;min-width:190px}.month-meter>span,.month-meter>span:only-child{height:100%;margin:0;flex-shrink:0;min-width:0;border-radius:0}.month-meter .forecast-tail{opacity:.35}.month-meter>span:first-child{border-radius:3px 0 0 3px}.month-dates{font-weight:400}.contract-edge{font-weight:600;color:var(--purple)}
        .month-summary{cursor:pointer}.month-summary:hover{background:var(--soft)}.month-summary:focus-visible{outline:2px solid var(--purple);outline-offset:-2px}.toggles select{font-size:12px;margin-left:4px}.ledger-dates{font-size:12px;color:var(--muted);margin-top:3px;margin-bottom:12px}
        .chart-column{transition:opacity .14s ease}.chart-stage[data-active] .chart-column{opacity:.4}.chart-stage[data-active] .chart-column[data-selected]{opacity:1}.chart-backlight{opacity:0;pointer-events:none;transition:opacity .14s ease}.chart-column[data-selected] .chart-backlight{opacity:.85}.chart-column[data-selected] .chart-bar{fill-opacity:1;filter:drop-shadow(0 2px 2px #0002)}.chart-hit:hover,.chart-hit:focus{fill:transparent;stroke:none}.chart-hit:focus-visible{stroke:var(--purple);stroke-width:.8;stroke-dasharray:3 3}.chart-readout{border-left:3px solid var(--purple)}.tip-values span{display:inline-flex;align-items:center;gap:5px;background:var(--paper);border-radius:5px;padding:4px 7px}.tip-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--series-color);flex:none}.tip-values span strong{color:var(--series-color)}.tip-values .has-rate{display:inline-grid;grid-template-columns:7px auto auto;column-gap:5px;row-gap:2px;align-items:center}.tip-values .tip-rate{grid-column:2/-1;font-size:10px;font-weight:400;line-height:1.15;color:var(--muted);white-space:nowrap}@media(prefers-reduced-motion:reduce){.chart-column,.chart-backlight{transition:none}}
        .detail-reveal{overflow:hidden}.cache-detail{margin-top:18px;padding:14px;background:var(--soft);border:1px solid var(--line);border-radius:8px}.cache-detail h3{margin:0 0 4px}.cache-table{width:100%;font-size:12px}.month-statement .cache-table td,.month-statement .cache-table th{padding:8px;white-space:nowrap}.cache-table td:first-child,.cache-table th:first-child{text-align:left;width:auto}.cache-table small{display:block;color:var(--muted);font-size:10px}.cache-table td:last-child{font-weight:700;font-size:14px}.tip-balance{display:flex;align-items:baseline;gap:10px 22px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}.tip-balance>strong{font-size:16px}.tip-balance>span{color:var(--muted);font-size:11px}.month-summary .month-link{transition:color .2s ease}
        .stream-result{display:flex;align-items:baseline;gap:8px 20px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}.stream-result>span:first-child{font-weight:650;font-size:13px}.stream-result>strong{font-size:24px;font-variant-numeric:tabular-nums}.stream-result strong small{font-size:13px;font-weight:600}.stream-result>span:last-child{font-size:11px;color:var(--muted)}.cache-table .net-stream{font-size:15px;font-weight:750;background:var(--paper)}.day-result-label{pointer-events:none}.month-progress{display:block;font-size:10px;font-weight:400;line-height:1.5;white-space:normal;margin-top:4px;color:var(--muted)}

        @media(max-width:767px){
          .top{position:sticky;top:0;z-index:4;background:var(--bg);padding:8px 0 12px}.mobile-menu{font-weight:600}
          .page{padding:max(12px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));overflow-x:clip}
          .wrap,.panel,.fields,.filters{min-width:0;max-width:100%}.top h1{font-size:21px}.top .actions{display:grid;grid-template-columns:minmax(0,1fr) 44px auto;width:100%}
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
        <header class="top">${button('☰ Menu','id="mobile-menu" class="mobile-menu" hidden aria-label="Dashboardmenu openen"')}<h1 id="title" tabindex="-1">Financieel <small style="font-size:11px;font-weight:500">6.1.5</small></h1><div class="actions">${button('Instellingen & uitleg','id="options" aria-expanded="false" aria-controls="settings"')}${button('↻','id="refresh" aria-label="Vernieuwen"')}${button('Sluiten ×','id="close"')}</div></header>
        <div class="filters"><select id="period" aria-label="Periode" hidden><option value="month">Maand</option><option value="year">Jaar</option><option value="contract">Contractjaar</option><option value="custom">Eigen periode</option></select><div class="period-bar"><div class="period-switch" role="group" aria-label="Periode kiezen">${button('Maand','data-preset="month" aria-pressed="false"')}${button('Jaar','data-preset="year" aria-pressed="false"')}${button('Contract','data-preset="contract" aria-pressed="true"')}${button('Zelf kiezen','data-preset="custom" aria-pressed="false"')}</div><div class="fields period-navigation">${button('←','id="prev" aria-label="Vorige periode"')}<label id="month-field">Maand<input id="month" type="month" value="${monthNow}"></label><label id="year-field" hidden>Jaar<select id="year"></select></label><label id="contract-field" hidden>Contract<select id="contract"></select></label><label id="from-field" hidden>Van<input id="from" type="date"></label><label id="to-field" hidden>Tot en met<input id="to" type="date"></label>${button('→','id="next" aria-label="Volgende periode"')}${button('Nu','id="current-period" title="Ga naar de huidige maand, het huidige jaar of contract"')}</div></div><div class="toggles"><label>Prijsweergave<select id="price-mode"><option value="allin">All-in + opslag (EB en btw)</option><option value="bare">Kaal + opslag (zonder EB/btw)</option></select></label><span id="basis" class="badge"></span><small id="filter-dates"></small></div></div>

        <div id="status" role="status" aria-live="polite" class="notice"></div>
        <div id="content"></div>
        <div id="settings" hidden><section class="panel appearance-settings"><div><h2>Weergave</h2><p class="help">Donkere modus voor het hele dashboard.</p></div><label for="cfg-dark">Donkere modus<select id="cfg-dark"><option value="uit">Uit</option><option value="aan">Aan</option></select></label></section><section class="panel"><h2>Voorschotten en contract</h2><div id="settings-body"></div></section><section class="panel"><h2>Berekening van deze selectie</h2><div id="calculation"></div></section><details class="panel"><summary>Rekenregels en bronnen</summary><div id="rules" class="note-list"></div></details><div class="actions" style="margin-top:12px">${button('CSV downloaden','id="csv"')}</div></div>
      </div></div>`;
      document.body.appendChild(root);
      var year = +monthNow.slice(0, 4), startYear = cfg.start.getFullYear();
      for (var y = startYear; y <= year + 1; y++) $('year').add(new Option(String(y), String(y)));
      $('year').value = String(year); $('contract').innerHTML = contractOptions(); $('contract').value = String(beOvContract(iso(new Date())).index);
      $('from').value = monthNow + '-01'; $('to').value = iso(new Date());
      var allin=beOvSettings.tax&&beOvSettings.vat;beOvSettings.tax=beOvSettings.vat=allin;$('price-mode').value=allin?'allin':'bare';
      state = {type:'contract'}; $('period').value='contract';
      ['period','month','year','contract','from','to'].forEach(function (id) { $(id).addEventListener('change', function () { updateFilters(); load(); }); });
      $('cfg-dark').value=beDarkOn?'aan':'uit';
      $('cfg-dark').onchange=function(){beDarkApply($('cfg-dark').value==='aan');};
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
      $('close').onclick = close; $('csv').onclick = exportCSV;
      $('mobile-menu').onclick=function(){
        var toggle=document.querySelector('[data-bs-target="#mobileSidebar"]');
        close();
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
      var scroll=root.scrollTop,closing=expandedMonth===key,token=++monthToggleSerial;
      expandedMonth=closing?null:key;
      if(monthAnimation){monthAnimation.cancel();monthAnimation=null;}
      function redraw(){render();var row=$('month-row-'+key);if(row)row.focus({preventScroll:true});root.scrollTop=scroll;}
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
    function theme() { if (root) { var dark=document.documentElement.getAttribute('data-be-dark') === 'aan';root.toggleAttribute('data-dark',dark);root.style.background=dark?'#282723':'#f6f7fb';if($('cfg-dark'))$('cfg-dark').value=dark?'aan':'uit'; } }
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
    function preserveMobileNavigation(){
      var toggle=innerWidth<768&&document.querySelector('[data-bs-target="#mobileSidebar"]');
      var header=toggle&&toggle.closest('header,nav,.navbar'),menu=toggle&&document.querySelector('#mobileSidebar');
      if(!header){restoreMobileNavigation();root.style.top='0px';return false;}
      if(header!==mobileHeader||menu!==mobileSidebar){
        restoreMobileNavigation();mobileHeader=header;mobileSidebar=menu;
        [[header,['position','top','left','right','z-index']],[menu,['position','top','left','z-index','max-height','overflow-y']]].forEach(function(pair){
          if(pair[0])mobileChrome.push([pair[0],pair[1].map(function(key){return [key,pair[0].style.getPropertyValue(key),pair[0].style.getPropertyPriority(key)];})]);
        });
      }
      function set(node,key,value){if(node.style.getPropertyValue(key)!==value||node.style.getPropertyPriority(key)!=='important')node.style.setProperty(key,value,'important');}
      set(header,'position','fixed');set(header,'top','0px');set(header,'left','0px');set(header,'right','0px');set(header,'z-index','1042');
      var height=Math.ceil(header.getBoundingClientRect().height);
      root.style.top=height+'px';
      if(menu){set(menu,'position','fixed');set(menu,'top',height+'px');set(menu,'left','0px');set(menu,'z-index','1043');set(menu,'max-height','calc(100dvh - '+height+'px)');set(menu,'overflow-y','auto');}
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
      $('mobile-menu').hidden=nativeMenu||innerWidth>=768||!document.querySelector('[data-bs-target="#mobileSidebar"]');
      if(fallback)fallback.style.display=opened?'none':'';
    }
    function open(push,source) {
      if(source)navAnchor=source;
      if(!root)mount();
      var mobileToggle=document.querySelector('[data-bs-target="#mobileSidebar"][aria-expanded="true"]');
      if(innerWidth<768&&mobileToggle)mobileToggle.click();
      if(opened){layout();return;}
      previousFocus=document.activeElement;oldHash=location.hash===HASH?'':location.hash;
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
      $('title').focus();load();
    }
    function close() {
      if(!opened)return;
      serial++;opened=false;root.hidden=true;
      restoreMobileNavigation();
      inertNodes.forEach(function(pair){pair[0].inert=pair[1];});inertNodes=[];
      if(location.hash===HASH)history.replaceState(history.state,'',location.pathname+location.search+oldHash);
      navLinks.forEach(function(a){a.removeAttribute('aria-current');a.className=a.className.replace(/\bactive\b/g,'').trim();});
      menuActiveBefore.forEach(function(pair){if(pair[0].isConnected)pair[0].className=pair[1];});menuActiveBefore=[];
      if(fallback)fallback.style.display='';
      var mobileToggle=innerWidth<768&&document.querySelector('[data-bs-target="#mobileSidebar"]');
      if(mobileToggle)mobileToggle.focus();else if(previousFocus&&previousFocus.isConnected)previousFocus.focus();
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
    document.addEventListener('keydown',function(e){if(opened&&e.key==='Escape'){e.preventDefault();close();}});
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


  var contractLaatsteDag = iso(new Date());
  function pols() {
    if (
      location.pathname.indexOf(
        '/results'
      ) === -1
    ) {
      return;
    }

    var contractVandaag = iso(new Date());
    if (contractVandaag !== contractLaatsteDag) {
      contractLaatsteDag = contractVandaag;
      contractCache = null;
      cacheJaar = {};
      cacheMaandDagen = {};
      plan();
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
    startActueelAllin();
    beArchiefOnderhoud();
    setInterval(beArchiefOnderhoud, 300000);
    beOverzichtStart();
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


// Break-evenmarkeringen van het cumulatieve dagresultaat.
(function () {
    const GUARD = '__beDagBreakeven01';
    if (window[GUARD]) return;
    window[GUARD] = true;
    const ZONE = 'Europe/Amsterdam';
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    function parts(t) {
      const p = Object.fromEntries(clock.formatToParts(new Date(t)).map(x => [x.type, x.value]));
      return {day: p.year + '-' + p.month + '-' + p.day, midnight: p.hour === '00' && p.minute === '00'};
    }
    // Use the main plugin's quarter results: same tariffs, all-in switch and energy integration.
    // No new network calls, no EPEX substitution for the actual settlement price.
    function crossings(rows, now) {
      const today = parts(now).day;
      const day = rows.filter(r => Number.isFinite(r.start) && parts(r.start).day === today && r.start < now)
        .slice().sort((a, b) => a.start - b.start);
      if (!day.length || !parts(day[0].start).midnight || day[0].start % 900000 !== 0) return [];
      let sum = 0, previousEnd = day[0].start, lastSign = 0, zeroTime = null, estimated = false;
      const out = [], EPS = 1e-9;
      for (const r of day) {
        // Require continuous metering. A missing tariff is already omitted from
        // the displayed daily subtotal; follow that subtotal with an explicit caveat.
        if (r.start !== previousEnd || r.end - r.start !== 900000 || r.carried) break;
        const info = r.breakEven;
        const end = info ? info.tot : r.end;
        if (!Number.isFinite(end) || end <= r.start || end > Math.min(r.end, now)) break;
        const amount = info ? info.bedrag : r.res;
        if (!Number.isFinite(amount)) break;
        if (info) {
          if (!Number.isFinite(info.gemetenMs) || info.gemetenMs < (end - r.start) * 0.97) break;
          estimated = estimated || info.prijsOnvolledig || end < r.end;
        } else if (r.deel || r.wacht || r.end > now) break;
        const before = sum;
        sum += amount;
        const sign = sum > EPS ? 1 : sum < -EPS ? -1 : 0;
        if (!sign) {
          if (lastSign && zeroTime === null) zeroTime = end;
        } else {
          if (lastSign && sign !== lastSign) {
            // Approximate within a completed quarter; quarter totals cannot locate sub-quarter reversals.
            const t = zeroTime !== null ? zeroTime : r.start + (end - r.start) * (-before / amount);
            out.push({t, from: lastSign, to: sign, estimated: !!estimated});
          }
          lastSign = sign;
          zeroTime = null;
        }
        previousEnd = r.end;
      }
      return out;
    }
    let data = null, chartLibrary = null, pending = false;
    function read() {
      try { data = JSON.parse(document.getElementById('be-tarief-data')?.textContent || 'null'); }
      catch (_) { data = null; }
    }
    const plugin = {
      id: 'beDagBreakevenTest',
      afterDatasetsDraw(chart) {
        if (chart.canvas?.id !== 'be-tarief-chart' || !data?.aan || !Array.isArray(data.rijen)) return;
        const a = chart.chartArea, x = chart.scales.x, ctx = chart.ctx;
        if (!a || !x) return;
        const marks = crossings(data.rijen, Date.now());
        ctx.save();
        ctx.beginPath(); ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); ctx.clip();
        let lastLabelX = -Infinity, lane = 0;
        marks.forEach(m => {
          const px = x.getPixelForValue(m.t);
          if (px < a.left || px > a.right) return;
          lane = px - lastLabelX < 100 ? (lane + 1) % 3 : 0;
          const y = a.bottom - 15 - lane * 24;
          ctx.strokeStyle = '#9274bb'; ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);ctx.beginPath();ctx.moveTo(px, a.top);ctx.lineTo(px, a.bottom);ctx.stroke();ctx.setLineDash([]);
          // Signs stay on their respective sides of the time marker.
          ctx.font = '700 14px system-ui, sans-serif';ctx.textBaseline = 'middle';
          ctx.textAlign = 'right';ctx.fillStyle = m.from > 0 ? '#198754' : '#dc3545';
          if (px - 7 > a.left + 8) ctx.fillText(m.from > 0 ? '+' : '−', px - 7, y);
          ctx.textAlign = 'left';ctx.fillStyle = m.to > 0 ? '#198754' : '#dc3545';
          if (px + 7 < a.right - 8) ctx.fillText(m.to > 0 ? '+' : '−', px + 7, y);
          ctx.font = '600 10px system-ui, sans-serif';
          // Vertical caption beside the line, leaving the signs at the bottom clear.
          const label = m.estimated ? 'Break even ≈' : 'Break even';
          const labelWidth = ctx.measureText(label).width;
          const labelX = px + 17 < a.right ? px + 11 : px - 11;
          const labelBottom = y - 17;
          if (labelBottom - labelWidth >= a.top + 4) {
            ctx.save();
            ctx.translate(labelX, labelBottom);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = document.documentElement.getAttribute('data-be-dark') === 'aan' ? '#373229' : '#ffffff';
            ctx.fillRect(-3, -7, labelWidth + 6, 14);
            ctx.fillStyle = '#9274bb';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 0, 0);
            ctx.restore();
          }
          lastLabelX = px;
        });
        ctx.restore();
      }
    };
    function update() {
      pending = false; read();
      const C = window.Chart;
      if (!C || typeof C.register !== 'function') return;
      if (chartLibrary !== C) { C.register(plugin); chartLibrary = C; }
      const chart = C.getChart('be-tarief-chart');
      if (chart) chart.draw();
      let note = document.getElementById('be-break-even-note');
      const row = document.getElementById('be-tarief-row');
      if (!row) return;
      if (!note) {
        note = document.createElement('p'); note.id = 'be-break-even-note';
        note.className = 'charging-chart-note'; row.appendChild(note);
      }
      const marks = data?.aan && Array.isArray(data.rijen) ? crossings(data.rijen, Date.now()) : [];
      const indicative = marks.some(m => m.estimated);
      note.hidden = !indicative;
      note.textContent = indicative ? '≈ Break even van het berekende dagresultaat; ontbrekende prijzen of het lopende kwartier maken dit voorlopig.' : '';
    }
    function schedule() {
      if (pending) return;
      pending = true; setTimeout(update, 0);
    }
    document.addEventListener('be-tarief-update', schedule);
    document.addEventListener('be-dark-change', schedule);
    document.addEventListener('visibilitychange', schedule);
    // The main plugin and Chart may start after this separate userscript.
    setInterval(update, 3000);
    update();
})();
  }

  function launch() {
    const script = document.createElement('script');
    script.textContent = '(' + dashboardCode.toString() + ')();';
    document.documentElement.appendChild(script);
    script.remove();
  }

  if (document.documentElement) {
    launch();
  } else {
    document.addEventListener('DOMContentLoaded', launch, { once: true });
  }
})();

(function () {
  'use strict';
  const ID='be-epex-addon', KEY='be_epex_enabled_v1', CACHE='be_epex_energyzero_prices_v1';
  if(document.getElementById(ID))return;
  const stateNode=document.createElement('script');stateNode.type='application/json';stateNode.id=ID;
  document.documentElement.appendChild(stateNode);
  const read=(key)=>{try{return localStorage.getItem(key);}catch(_){return null;}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
  let enabled=read(KEY)==='aan', rows=[],cache=null,busy=false,retryAt=0,error='',button,status;
  try{cache=JSON.parse(read(CACHE));if(cache)rows=normalise(cache.body);}catch(_){cache=null;}
  function normalise(body){
    if(!body || body.interval!=='RESPONSE_INTERVAL_QUARTER' || !Array.isArray(body.base))throw Error('Onbekend EnergyZero-prijsformaat');
    const rows=body.base.map(r=>{
      const value=r?.price?.value;
      const start=Date.parse(r?.start),end=Date.parse(r?.end);
      // EnergyZero base is EUR/kWh, without VAT, energy tax or supplier markup.
      const price=typeof value==='string' && value.trim()!==''?Number(value):NaN;
      if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==900000||!Number.isFinite(price))throw Error('Onvolledige EnergyZero-kwartierprijs');
      return {start,end,price};
    }).sort((a,b)=>a.start-b.start);
    for(let i=1;i<rows.length;i++)if(rows[i].start<rows[i-1].end)throw Error('Overlappende EnergyZero-prijzen');
    return rows;
  }
  function coversNow(data){const now=Date.now();return data.some(r=>r.start<=now && now<r.end);}
  function settings(){
    try{return JSON.parse(document.getElementById('be-actueel-allin-data')?.textContent||'{}');}catch(_){return {};}
  }
  function publish(){
    const s=settings();
    stateNode.textContent=JSON.stringify({enabled,rows,allin:s.aan!==false,btw:Number.isFinite(s.btw)?s.btw:1.21,opslag:Number.isFinite(s.opslag)?s.opslag:.02,eb:Number.isFinite(s.eb)?s.eb:.11085});
    document.dispatchEvent(new Event('be-epex-data'));
    if(button){
      button.setAttribute('aria-checked',String(enabled));
      button.querySelector('.be-epex-state').textContent=enabled?'AAN':'UIT';
      button.title=error||'Nederlandse EPEX day-ahead-prijs tonen of verbergen';
    }
    if(status){
      status.textContent=enabled&&error?'!':enabled&&busy&&!rows.length?'…':'';
      status.title=error||'Prijzen ophalen';status.hidden=!status.textContent;
    }

  }
  function range(){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=t=>parts.find(p=>p.type===t).value;
    const date=part('day')+'-'+part('month')+'-'+part('year');
    return {date,key:date};
  }
  function request(url){
    return new Promise((resolve,reject)=>{
      const fn=typeof GM_xmlhttpRequest==='function'?GM_xmlhttpRequest:typeof GM!=='undefined'&&typeof GM.xmlHttpRequest==='function'?GM.xmlHttpRequest.bind(GM):null;
      if(!fn){reject(Error('De userscriptmanager heeft netwerktoegang nodig'));return;}
      fn({method:'GET',url,anonymous:true,timeout:20000,onload:r=>{
        if(r.status!==200){reject(Error('Prijsbron tijdelijk niet beschikbaar ('+r.status+')'));return;}
        try{resolve(JSON.parse(r.responseText));}catch(_){reject(Error('Ongeldige prijsresponse'));}
      },onerror:()=>reject(Error('Prijsbron niet bereikbaar')),ontimeout:()=>reject(Error('Prijsbron reageert niet'))});
    });
  }
  async function refresh(){
    if(!enabled||busy||document.hidden||!document.getElementById('be-tarief-chart')||Date.now()<retryAt)return;
    const r=range();if(cache&&cache.key===r.key&&Date.now()-cache.at<900000&&coversNow(rows)){publish();return;}
    busy=true;publish();
    try{
      const body=await request('https://public.api.energyzero.nl/v1/prices?date='+r.date+'&interval=INTERVAL_QUARTER&energy_type=ENERGY_TYPE_ELECTRICITY');
      const parsed=normalise(body);if(!coversNow(parsed))throw Error('Geen actuele day-ahead-prijzen beschikbaar');
      rows=parsed;cache={key:r.key,at:Date.now(),body};save(CACHE,JSON.stringify(cache));error='';
    }catch(e){error=e.message+(rows.length?' · eerder opgehaalde prijzen zichtbaar':'');retryAt=Date.now()+300000;}
    finally{busy=false;publish();}
  }
  const style=document.createElement('style');style.textContent=`
    #be-epex-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%;flex-wrap:wrap;box-sizing:border-box;padding:8px 2px 4px;color:inherit}
    #be-epex-legend{display:flex;align-items:center;gap:12px;margin-right:auto;flex-wrap:wrap;font:11px/1.3 system-ui,sans-serif}
    #be-epex-legend button{display:inline-flex;align-items:center;gap:5px;border:0;padding:3px 0;margin:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
    #be-epex-legend button[aria-pressed="false"]{opacity:.5;text-decoration:line-through}
    #be-epex-legend .swatch{width:13px;height:3px;display:inline-block}
    #be-epex-switch{appearance:none;display:inline-flex;align-items:center;gap:9px;border:0;padding:3px 2px;background:transparent;color:inherit;font:500 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;cursor:pointer;box-shadow:none;margin:0;min-height:24px}
    #be-epex-switch:focus-visible{outline:2px solid #429ee8;outline-offset:4px;border-radius:4px}
    #be-epex-switch .be-epex-track{position:relative;width:34px;height:18px;flex:none;border-radius:10px;background:#868892;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
    #be-epex-switch .be-epex-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0004;transition:transform .15s}
    #be-epex-switch[aria-checked="true"] .be-epex-track{background:#287dbb}
    #be-epex-switch[aria-checked="true"] .be-epex-thumb{transform:translateX(16px)}
    #be-epex-switch .be-epex-state{min-width:24px;font-size:10px;font-weight:700;letter-spacing:.02em}
    #be-epex-source{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:1px solid currentColor;border-radius:50%;font:italic 10px Georgia,serif;color:inherit;opacity:.55;text-decoration:none}
    #be-epex-source:hover,#be-epex-source:focus{opacity:1}
    #be-epex-status{font-size:11px;font-weight:700;color:#b76a20}
    html[data-be-dark="aan"] #be-epex-switch .be-epex-track{background:#65615b!important}
    html[data-be-dark="aan"] #be-epex-switch[aria-checked="true"] .be-epex-track{background:#287dbb!important}
    html[data-be-dark="aan"] #be-epex-switch .be-epex-thumb{background:#fff!important}
    @media(max-width:700px){#be-epex-control{justify-content:flex-end;width:100%;padding-top:6px}#be-epex-switch{border-left:0}}
    @media(prefers-reduced-motion:reduce){#be-epex-switch .be-epex-thumb{transition:none}}
  `;document.documentElement.appendChild(style);
  function mount(){
    const host=document.getElementById('be-tarief-row');
    if(!host||host.querySelector('#be-epex-control'))return;
    const box=document.createElement('div');box.id='be-epex-control';
    button=document.createElement('button');button.id='be-epex-switch';button.type='button';
    button.setAttribute('role','switch');button.setAttribute('aria-label','EPEX day-ahead');
    button.innerHTML='<span>EPEX</span><span class="be-epex-track" aria-hidden="true"><span class="be-epex-thumb"></span></span><span class="be-epex-state" aria-hidden="true"></span>';
    button.addEventListener('click',()=>{enabled=!enabled;save(KEY,enabled?'aan':'uit');publish();refresh();});
    status=document.createElement('span');status.id='be-epex-status';
    status.setAttribute('role','status');
    const source=document.createElement('a');source.id='be-epex-source';source.textContent='i';
    source.href='https://docs.api.energyzero.nl/docs/api/swagger/public/energy-market-service-get-prices/';source.target='_blank';source.rel='noopener noreferrer';
    source.setAttribute('aria-label','Bron en toelichting EPEX');
    source.title='EPEX NL day-ahead. All-in: kale prijs × btw + € 0,02 opslag + energiebelasting. Opslag is inclusief btw en telt één keer mee. Bron: EnergyZero Public API, Nederlandse day-ahead-kwartierprijzen. Kale prijsreeks (base), zonder btw, belasting of leveranciersopslag.';
    const legend=document.createElement('div');legend.id='be-epex-legend';legend.setAttribute('aria-label','Grafieklegenda');
    box.append(legend,button,status,source);host.prepend(box);publish();refresh();
  }
  // The main plugin also bridges into the page, where its Chart instance lives.
  function chartBridge(){
    if(window.__beEpexBridge)return;window.__beEpexBridge=true;
    let data={enabled:false,rows:[]},library=null,attachedChart=null;
    function config(){try{data=JSON.parse(document.getElementById('be-epex-addon').textContent);}catch(_){}}
    function points(c){
      const x=c.options.scales?.x||{},min=x.min??-Infinity,max=x.max??Infinity,out=[];
      let previous=null;
      for(const r of data.rows||[]){
        if(r.end<min||r.start>max)continue;
        if(previous!==null&&r.start>previous)out.push({x:previous,y:null});
        const y=data.allin?r.price*data.btw+data.opslag+data.eb:r.price;
        out.push({x:r.start,y},{x:r.end,y});previous=r.end;
      }
      return out;
    }
    function install(force=false){
      const C=typeof Chart!=='undefined'?Chart:window.Chart;if(!C)return;
      if(C!==library){C.register({id:'beEpexOverlay',beforeUpdate(c){
        if(c.canvas.id!=='be-tarief-chart')return;
        // Write raw configuration, never assign Chart.js option resolvers to themselves.
        const opts=c.config.options;
        opts.plugins=opts.plugins||{};
        opts.plugins.legend=opts.plugins.legend||{};
        opts.plugins.legend.display=false;
        let ds=c.data.datasets.find(d=>d.beEpex);
        if(!data.enabled){c.data.datasets=c.data.datasets.filter(d=>!d.beEpex);return;}
        if(!ds){ds={beEpex:true,label:'EPEX NL',borderColor:'#429ee8',backgroundColor:'#429ee8',borderWidth:2,pointRadius:0,pointHitRadius:8,fill:false,spanGaps:false,stepped:'before',tension:0,order:-10};c.data.datasets.push(ds);}
        ds.label=data.allin?'EPEX · all-in':'EPEX · kaal';ds.data=points(c);
        ds.tooltip={callbacks:{label:z=>ds.label+': € '+z.parsed.y.toLocaleString('nl-NL',{minimumFractionDigits:3,maximumFractionDigits:5})+'/kWh'}};
      },afterUpdate(c){
        if(c.canvas.id!=='be-tarief-chart')return;
        const host=document.getElementById('be-epex-legend');if(!host)return;
        const bar=host.parentElement,rect=c.canvas.getBoundingClientRect(),barRect=bar.getBoundingClientRect();
        if(c.chartArea&&c.width&&rect.width){
          const left=Math.max(0,rect.left+c.chartArea.left*rect.width/c.width-barRect.left);
          const padding=left.toFixed(2)+'px';
          if(bar.style.paddingLeft!==padding)bar.style.paddingLeft=padding;
        }
        const items=c.data.datasets.map((d,i)=>({label:d.label,color:d.borderColor,index:i,visible:c.isDatasetVisible(i)}));
        const key=JSON.stringify(items);if(host.dataset.key===key)return;host.dataset.key=key;
        host.replaceChildren();
        items.forEach(item=>{
          const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed',String(item.visible));
          const swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundColor=typeof item.color==='string'?item.color:'#888';swatch.setAttribute('aria-hidden','true');
          const label=document.createElement('span');label.textContent=item.label;button.append(swatch,label);
          button.addEventListener('click',()=>{c.setDatasetVisibility(item.index,!c.isDatasetVisible(item.index));c.update('none');});host.append(button);
        });
      }});library=C;}
      const c=C.getChart('be-tarief-chart');if(c&&(force||c!==attachedChart)){attachedChart=c;c.update('none');}
    }
    document.addEventListener('be-epex-data',()=>{config();install(true);});
    document.addEventListener('be-tarief-update',()=>{config();install(true);});
    config();install();
    setInterval(install,1000);
  }
  const bridge=document.createElement('script');bridge.textContent='('+chartBridge.toString()+')();';document.documentElement.appendChild(bridge);bridge.remove();
  let pending=false;
  const observer=new MutationObserver(()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;mount();},150);});
  observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
  document.addEventListener('be-actueel-allin-update',publish);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){mount();refresh();}});
  window.addEventListener('storage',e=>{if(e.key===KEY){enabled=e.newValue==='aan';publish();refresh();}});
  mount();setInterval(refresh,60000);
})();



/* aFRR BID-info — waargenomen biedingen naast de tariefgrafiek. */


(function () {
  'use strict';
  function main() {
(async function () {
    if (window.__beAfrrBid01) return;
    const QUARTER = 900000;
    const directions = ['import', 'export'];
    const colours = {import: '#b65c72', export: '#73b9a1'};
    function bidColour(direction) {
      return document.documentElement.getAttribute('data-be-dark') === 'aan'
        ? (direction === 'import' ? 'rgba(242,79,91,0.55)' : 'rgba(51,192,113,0.55)')
        : colours[direction];
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
              borderDash: [], borderWidth: 1, pointRadius: 0,
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
          dataset.borderColor=bidColour(direction);
          dataset.backgroundColor=dataset.borderColor;
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
      ui.append(button,status); row.appendChild(ui);
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

  }
  function inject() {
    const script = document.createElement('script');
    script.textContent = '(' + main.toString() + ')();';
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  if (document.documentElement) inject();
  else document.addEventListener('DOMContentLoaded', inject, {once: true});
})();

/* Coulombtelling in/uit — 6.1.5. BE data only. */
(function(){
  'use strict';
  function coulombPage(){
    if(window.__beCoulombPage615)return;window.__beCoulombPage615=true;
(function(){
  'use strict';
  if(window.__beChartVisibility606)return;window.__beChartVisibility606=true;
  const ids=['battery-chart','be-tarief-chart','soc-chart','soc-forecast-chart'],seen=new WeakMap(),watched=new WeakSet();
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;repair();});}
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  const intersect=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))schedule();}):null;
  function repair(){
    if(document.hidden)return;
    const C=window.Chart;if(!C?.getChart)return;
    for(const id of ids){
      const canvas=document.getElementById(id);if(!canvas?.isConnected)continue;
      const parent=canvas.parentElement;if(!parent)continue;
      if(!watched.has(parent)){resize?.observe(parent);intersect?.observe(parent);watched.add(parent);}
      const box=parent.getBoundingClientRect(),chart=C.getChart(canvas),before=seen.get(canvas);
      if(!chart||!(box.width>0&&box.height>0)||canvas.getClientRects().length===0){seen.delete(canvas);continue;}
      const changed=!before||before.chart!==chart||Math.abs(before.w-box.width)>1||Math.abs(before.h-box.height)>1;
      if(changed||!(chart.width>0&&chart.height>0)){
        // Remember first: resize/update may synchronously notify other extensions.
        seen.set(canvas,{chart,w:box.width,h:box.height});
        try{chart.resize();chart.update('none');}catch(e){seen.delete(canvas);console.warn('[BE grafiekherstel]',id,e);}
      }
    }
  }
  new MutationObserver(records=>{
    const added=records.flatMap(r=>Array.from(r.addedNodes));
    if(added.some(n=>n.nodeType===1&&(n.matches?.('canvas')||n.querySelector?.('canvas'))))schedule();
  }).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('pageshow',schedule);
  window.addEventListener('resize',schedule);
  window.addEventListener('orientationchange',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  setInterval(schedule,2000);schedule();
})();

/* BE-only energy balance. Positive bo is battery output in W. */
(function(root){
  'use strict';
  const defaults={capacity:48.2,chargeEfficiency:1,dischargeEfficiency:1,maxGapMs:360000,auto:true};
  const rawValid=v=>Number.isFinite(v)&&v>=0&&v<=100;
  function valid(r){return Array.isArray(r)&&Number.isFinite(r[0])&&r[0]>0&&(Number.isFinite(r[2])||r[2]===null);}
  function energy(p0,p1,ms){
    if(p0*p1<0){const f=Math.abs(p0)/(Math.abs(p0)+Math.abs(p1)),a=energy(p0,0,ms*f),b=energy(0,p1,ms*(1-f));return {input:a.input+b.input,output:a.output+b.output};}
    const e=(p0+p1)/2*ms/3600000000;return {input:Math.max(0,-e),output:Math.max(0,e)};
  }
  function calculate(rows,settings={},manual=[]){
    const c={...defaults,...settings};if(!(c.capacity>0))throw Error('Ongeldige accucapaciteit');
    rows=[...new Map(rows.filter(valid).map(r=>[r[0],r])).values()].sort((a,b)=>a[0]-b[0]);
    const anchors=new Map(manual.filter(a=>Number.isFinite(a.t)&&rawValid(a.soc)).map(a=>[a.t,a]));
    let stored=null,input=0,output=0,gaps=0,uncertain=false,lastAnchor=null,lowMode='ready',lowMinimum=null,highMode='ready',highMaximum=null;
    const points=[],events=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i],prev=rows[i-1],raw=rawValid(r[1])?r[1]:null;let gap=false,change=null;
      if(prev){
        const dt=r[0]-prev[0];
        if(Number.isFinite(prev[2])&&Number.isFinite(r[2])){
          const e=energy(prev[2],r[2],dt);input+=e.input;output+=e.output;change=e.input-e.output;
          if(stored!==null)stored+=change;
          if(dt>c.maxGapMs){gap=true;gaps++;uncertain=true;}
        }else{gap=true;gaps++;uncertain=true;}
      }
      const explicit=anchors.get(r[0]),checkpoint=!!(explicit?.lowState||explicit?.highState);
      let anchor=explicit;
      if(stored===null&&!anchor&&raw!==null)anchor={t:r[0],soc:raw,kind:'Start uit BE-SOC'};
      const charging=change!==null?change>0:!prev&&!checkpoint&&Number.isFinite(r[2])&&r[2]<0;
      const discharging=change!==null?change<0:!prev&&!checkpoint&&Number.isFinite(r[2])&&r[2]>0;
      if(checkpoint){
        if(explicit.lowState){lowMode=explicit.lowState.mode;lowMinimum=explicit.lowState.minimum;}
        if(explicit.highState){highMode=explicit.highState.mode;highMaximum=explicit.highState.maximum;}
      }else if(explicit){lowMode=highMode='released';lowMinimum=highMaximum=null;}
      else{
        if(lowMode==='released'&&raw!==null&&raw>10&&change!==null&&change<=0&&r[2]>=0){lowMode='ready';lowMinimum=null;}
        if(highMode==='released'&&raw!==null&&raw<95&&change!==null&&change>=0&&r[2]<=0){highMode='ready';highMaximum=null;}
        if(lowMode==='ready'&&raw!==null&&raw<=10){
          if(charging)lowMode='released';
          else{lowMode='tracking';lowMinimum=raw;anchor={t:r[0],soc:raw,kind:'Laagste BE-SOC · volgen'};}
        }
        if(lowMode==='tracking'){
          if(charging)lowMode='released';
          else if(raw!==null){
            const lower=lowMinimum===null||raw<lowMinimum;if(lower)lowMinimum=raw;
            anchor={t:r[0],soc:lowMinimum,kind:'Laagste BE-SOC · volgen',silent:!lower&&anchor?.kind!=='Laagste BE-SOC · volgen'};
            highMode='ready';highMaximum=null;
          }
        }
        if(highMode==='ready'&&raw!==null&&raw>=95){
          if(discharging)highMode='released';
          else{highMode='tracking';highMaximum=raw;anchor={t:r[0],soc:raw,kind:'Hoogste BE-SOC · volgen'};}
        }
        if(highMode==='tracking'){
          if(discharging)highMode='released';
          else if(raw!==null){
            const higher=highMaximum===null||raw>highMaximum;if(higher)highMaximum=raw;
            anchor={t:r[0],soc:highMaximum,kind:'Hoogste BE-SOC · volgen',silent:!higher&&anchor?.kind!=='Hoogste BE-SOC · volgen'};
            lowMode='ready';lowMinimum=null;
          }
        }
      }
      if(anchor){
        const before=stored===null?null:stored/c.capacity*100;
        stored=c.capacity*anchor.soc/100;if(!anchor.silent||raw===anchor.soc)uncertain=false;
        if(anchor.statsReference){
          const saved=anchor.statsReference;
          lastAnchor={...saved.reference,input:input-saved.input,output:output-saved.output};
        }else{
          lastAnchor={...anchor,correction:before===null?null:anchor.soc-before,input,output};
          if(!anchor.silent)events.push(lastAnchor);
        }
      }
      points.push({t:r[0],raw,power:r[2],soc:stored===null?null:stored/c.capacity*100,input,output,gap,uncertain,anchor:anchor||null,
        lowState:{mode:lowMode,minimum:lowMinimum},highState:{mode:highMode,maximum:highMaximum},reference:lastAnchor,
        sinceInput:lastAnchor?Math.max(0,input-lastAnchor.input):0,sinceOutput:lastAnchor?Math.max(0,output-lastAnchor.output):0});
    }
    return {points,input,output,gaps,lastAnchor,events,uncertain};
  }
  function at(points,t,maxGapMs=defaults.maxGapMs){
    let lo=0,hi=points.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(points[m].t<t)lo=m+1;else hi=m-1;}
    if(points[lo]?.t===t)return points[lo].soc;
    const a=points[lo-1],b=points[lo];
    const tracking=a&&b&&((a.lowState?.mode==='tracking'&&b.lowState?.mode==='tracking')||(a.highState?.mode==='tracking'&&b.highState?.mode==='tracking'));
    if(!a||!b||a.soc===null||b.soc===null||b.gap||(b.anchor&&!tracking)||b.t-a.t>maxGapMs)return null;
    return a.soc+(b.soc-a.soc)*(t-a.t)/(b.t-a.t);
  }
  root.BEEnergySOC={defaults,valid,energy,calculate,at};
})(typeof window!=='undefined'?window:globalThis);

(function(root){
  'use strict';
  const clamp=v=>Math.max(5,Math.min(100,v));
  function project(slots,r,c,power=Infinity,now=Date.now()){
    const out=slots.map(()=>null);
    if(!r||!Number.isFinite(r.soc)||!Number.isFinite(r.t)||now-r.t>120000||r.t>now+10000||!(c.capacity>0))return out;
    let e=clamp(r.soc)/100*c.capacity,last=r.t;
    for(let k=0;k<slots.length;k++){
      const q=slots[k],end=q.t+q.dt;
      if(end<=r.t)continue;
      if(q.t>last+1||!Number.isFinite(q.load)||!Number.isFinite(q.pv)||!(q.dt>0))break;
      if(q.t>=r.t)out[k]=clamp(e/c.capacity*100);
      const fraction=(end-Math.max(q.t,r.t))/q.dt,limit=power*q.dt/3600000;
      const change=Math.max(-limit,Math.min(limit,q.pv-q.load))*fraction;
      e=Math.max(.05*c.capacity,Math.min(c.capacity,e+(change>=0?change*c.chargeEfficiency:change/c.dischargeEfficiency)));
      last=end;
    }
    return out;
  }
  root.BESOCExtras={clamp,project};
})(window);

(function(root){
  'use strict';
  const bindings=new Map(),configs=new WeakMap(),finite=Number.isFinite;
  const supported=c=>['soc-chart','soc-forecast-chart'].includes(c.canvas?.id);
  function parsed(meta,i){return meta.controller?.getParsed?meta.controller.getParsed(i):meta._parsed?.[i];}
  function bracket(meta,x){
    let lo=0,hi=(meta.data?.length||0)-1;
    while(lo<=hi){const m=(lo+hi)>>1,p=parsed(meta,m);if(!finite(p?.x))return null;if(p.x<x)lo=m+1;else hi=m-1;}
    return {left:lo-1,right:lo};
  }
  function validPoint(meta,i){const p=parsed(meta,i),e=meta.data?.[i];return finite(p?.x)&&finite(p?.y)&&e&&!e.skip;}
  function valueAt(meta,x,stepped){
    const b=bracket(meta,x);if(!b)return {value:null};
    if(parsed(meta,b.right)?.x===x)return {value:validPoint(meta,b.right)?parsed(meta,b.right).y:null};
    if(!validPoint(meta,b.left)||!validPoint(meta,b.right)||meta.data[b.right].stop)return {value:null};
    const a=parsed(meta,b.left),z=parsed(meta,b.right);if(!(z.x>a.x))return {value:null};
    const f=(x-a.x)/(z.x-a.x);
    return {value:stepped?(stepped==='after'?z.y:stepped==='middle'&&f>=.5?z.y:a.y):a.y+(z.y-a.y)*f,approx:true};
  }
  function pick(chart,pointer){
    const scale=chart.scales?.x;if(!scale)return null;
    let x=scale.getValueForPixel(pointer.x);if(!finite(x))return null;
    if(scale.type==='category')x=Math.round(x);
    // Real-time axes follow the pointer continuously. A sparse native series
    // must not pull the cursor hours away from the position being inspected.
    const px=scale.getPixelForValue(x);return finite(px)?{x,px}:null;
  }
  function info(chart,pointer){
    const selected=pick(chart,pointer);if(!selected)return null;
    const rows=[],groups=new Map();
    chart.data.datasets.forEach((d,i)=>{
      if(!chart.isDatasetVisible(i))return;
      const meta=chart.getDatasetMeta(i);if(meta.type&&meta.type!=='line')return;
      if(d.borderWidth===0||meta.dataset?.options?.borderWidth===0)return;
      const own=d.beOwnSOC,group=own?'be':'native:'+i;
      const sampled=valueAt(meta,selected.x,d.stepped??meta.dataset?.options?.stepped);
      const baseColor=own?'#0891b2':meta.dataset?.options?.borderColor||d.borderColor;
      const color=typeof baseColor==='string'?baseColor:'#6b7280';
      const y=chart.scales[meta.yAxisID||d.yAxisID||'y'];
      const row={label:own?'Coulombtelling in/uit':String(d.label||'Lijn '+(i+1)),color,...sampled,
        py:sampled.value===null?null:y?.getPixelForValue(sampled.value)};
      if(!groups.has(group)){groups.set(group,rows.length);rows.push(row);}
      else if(rows[groups.get(group)].value===null&&row.value!==null)rows[groups.get(group)]=row;
    });
    const xScale=chart.scales.x,times=configs.get(chart)?.times;
    const label=times?.[selected.x]??chart.data.labels?.[selected.x]??xScale.getLabelForValue?.(selected.x);
    const time=['time','timeseries'].includes(xScale.type)||xScale.type==='linear'&&selected.x>1e11?selected.x:typeof label==='string'&&/^\d{4}-\d\d-\d\d[T ]/.test(label)?Date.parse(label):null;
    const title=finite(time)?new Date(time).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:xScale.type==='category'?undefined:'2-digit'}):String(label??selected.x);
    return {...selected,title,rows};
  }
  function format(row){return row.value===null?'—':(row.approx?'≈ ':'')+row.value.toLocaleString('nl-NL',{maximumFractionDigits:0})+'%';}
  function hide(state){
    state.tip.style.display='none';state.cursor.style.display='none';state.pointer=null;
    state.markers.style.display='none';
    try{if(state.tooltip){state.tooltip.options.enabled=state.enabled;state.tooltip=null;}}catch{}
  }
  function show(state,event){
    const chart=state.chart,touch=event.touches?.[0]||event;
    if(!finite(touch.clientX)||!finite(touch.clientY)){hide(state);return;}
    const rect=chart.canvas.getBoundingClientRect(),a=chart.chartArea;
    if(!a||!rect.width||!rect.height||!chart.width||!chart.height){hide(state);return;}
    const pointer={x:(touch.clientX-rect.left)*chart.width/rect.width,y:(touch.clientY-rect.top)*chart.height/rect.height};
    if(pointer.x<a.left||pointer.x>a.right||pointer.y<a.top||pointer.y>a.bottom){hide(state);return;}
    const data=info(chart,pointer);if(!data?.rows.length){hide(state);return;}
    // Native index-mode hover joins unrelated sample indices. Our marker layer
    // samples every visible line at data.x instead and leaves the datasets intact.
    if(chart.getActiveElements?.().length){chart.setActiveElements([]);chart.draw();}
    state.pointer={clientX:touch.clientX,clientY:touch.clientY};
    try{if(chart.tooltip&&state.tooltip!==chart.tooltip){state.tooltip=chart.tooltip;state.enabled=chart.tooltip.options.enabled;}if(state.tooltip)state.tooltip.options.enabled=false;}catch{}
    const title=document.createElement('div');title.textContent=data.title;title.style.cssText='font-weight:650;margin-bottom:7px';
    const children=[title];
    for(const row of data.rows){
      const line=document.createElement('div');line.style.cssText='display:flex;align-items:center;gap:8px;min-height:22px';
      const swatch=document.createElement('span');swatch.style.cssText='display:inline-block;width:14px;height:3px;flex:0 0 14px';swatch.style.background=row.color;
      const label=document.createElement('span');label.textContent=row.label;label.style.cssText='flex:1;white-space:nowrap';
      const value=document.createElement('span');value.textContent=format(row);value.style.cssText='font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:12px';
      line.append(swatch,label,value);children.push(line);
    }
    state.tip.replaceChildren(...children);state.tip.style.display='block';
    state.markers.replaceChildren(...data.rows.filter(row=>finite(row.py)&&row.py>=a.top&&row.py<=a.bottom).map(row=>{
      const dot=document.createElement('span');
      dot.style.cssText='position:fixed;display:block;width:8px;height:8px;border-radius:50%;border:2px solid #fff;box-sizing:border-box;transform:translate(-50%,-50%);background:'+row.color+';left:'+(rect.left+data.px*rect.width/chart.width)+'px;top:'+(rect.top+row.py*rect.height/chart.height)+'px';
      return dot;
    }));state.markers.style.display='block';
    const box=state.tip.getBoundingClientRect(),vw=window.innerWidth||document.documentElement.clientWidth,vh=window.innerHeight||document.documentElement.clientHeight;
    const left=Math.max(8,Math.min(touch.clientX+16+box.width<vw-8?touch.clientX+16:touch.clientX-box.width-16,vw-box.width-8));
    const top=Math.max(8,Math.min(touch.clientY+16,vh-box.height-8));state.tip.style.left=left+'px';state.tip.style.top=top+'px';
    state.cursor.style.cssText='position:fixed;pointer-events:none;z-index:2147483645;border-left:1px dashed rgba(100,116,139,.65);display:block;left:'+(rect.left+data.px*rect.width/chart.width)+'px;top:'+(rect.top+a.top*rect.height/chart.height)+'px;height:'+((a.bottom-a.top)*rect.height/chart.height)+'px';
  }
  function detach(canvas,state){
    for(const type of ['mousemove','touchstart','touchmove'])canvas.removeEventListener(type,state.move,true);
    for(const type of ['mouseleave','touchend','touchcancel'])canvas.removeEventListener(type,state.leave,true);
    window.removeEventListener('scroll',state.leave,true);window.removeEventListener('blur',state.leave);hide(state);state.tip.remove();state.cursor.remove();state.markers.remove();bindings.delete(canvas);
  }
  function attach(chart,config={}){
    if(!supported(chart))return;
    // Never enter Chart.js' render/plugin lifecycle: tooltip errors stay local.
    try{
      configs.set(chart,config);
      for(const [canvas,state] of bindings)if(canvas.isConnected===false)detach(canvas,state);
      let state=bindings.get(chart.canvas);
      if(state){state.chart=chart;if(state.pointer)Promise.resolve().then(()=>state.move(state.pointer));return;}
      const tip=document.createElement('div'),cursor=document.createElement('div'),markers=document.createElement('div');
      tip.setAttribute('role','tooltip');tip.style.cssText='position:fixed;display:none;pointer-events:none;z-index:2147483646;background:#fff;color:#111827;border:1px solid #cbd5e1;border-radius:7px;padding:10px 12px;box-shadow:0 3px 12px rgba(0,0,0,.2);font:12px/1.4 system-ui,-apple-system,sans-serif;max-width:calc(100vw - 16px);box-sizing:border-box';
      cursor.style.display='none';markers.style.cssText='display:none;pointer-events:none;position:fixed;inset:0;z-index:2147483645';
      (document.body||document.documentElement).append(tip,cursor,markers);
      state={chart,tip,cursor,markers,tooltip:null,pointer:null};
      state.move=e=>{try{show(state,e);}catch(error){hide(state);if(!state.warned){state.warned=true;console.warn('[SOC hover]',error);}}};state.leave=()=>hide(state);
      for(const type of ['mousemove','touchstart','touchmove'])chart.canvas.addEventListener(type,state.move,{capture:true,passive:true});
      for(const type of ['mouseleave','touchend','touchcancel'])chart.canvas.addEventListener(type,state.leave,{capture:true,passive:true});
      window.addEventListener('scroll',state.leave,{capture:true,passive:true});window.addEventListener('blur',state.leave);bindings.set(chart.canvas,state);
    }catch(error){console.warn('[SOC hover] Koppelen mislukt:',error);}
  }
  const plugin={id:'beSocSynchronizedHover',beforeEvent(chart,args){
    if(bindings.has(chart.canvas)&&/^(mousemove|mouseout|touchstart|touchmove|touchend|touchcancel)$/.test(args.event.type))return false;
  },afterDestroy(chart){const state=bindings.get(chart.canvas);if(state)detach(chart.canvas,state);}};
  root.BESocHover={attach,info,valueAt,plugin};
})(typeof window!=='undefined'?window:globalThis);

(function(root){
  'use strict';
  const numeric=v=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:[.,]\d+)?$/.test(v.trim())?Number(v.trim().replace(',','.')):NaN;
  function resolve(value){
    const c=value&&typeof value==='object'?value:{};
    if(c.capacityMode==='fcc'){
      const fccAh=numeric(c.fccAh),packCount=numeric(c.packCount),nominalVoltage=numeric(c.nominalVoltage);
      if(!(fccAh>0&&Number.isInteger(packCount)&&packCount>=1&&packCount<=100&&nominalVoltage>=1&&nominalVoltage<=1000))return null;
      const capacity=fccAh*packCount*nominalVoltage/1000;
      return capacity>=.01&&capacity<=1000?{mode:'fcc',capacity,fccAh,packCount,nominalVoltage}:null;
    }
    if(c.capacityMode&&c.capacityMode!=='kwh')return null;
    const capacity=numeric(c.capacityKwh??c.capacity);
    return capacity>=.01&&capacity<=1000?{mode:'kwh',capacity}:null;
  }
  function readForm(form,previous={}){
    const next={...previous,capacityMode:form.elements.capacityMode.value,
      capacityKwh:numeric(form.elements.capacity.value),fccAh:numeric(form.elements.fccAh.value),
      packCount:numeric(form.elements.packCount.value),nominalVoltage:numeric(form.elements.nominalVoltage.value)};
    const resolved=resolve(next);return resolved?{...next,capacity:resolved.capacity}:null;
  }
  root.BECapacity={numeric,resolve,readForm};
})(typeof window!=='undefined'?window:globalThis);

(function(root){
  'use strict';
  const id='be-coulomb-native-readout',own='.be-own-soc,[data-be-coulomb-readout]';
  const text=e=>(e.textContent||'').replace(/\s+/g,' ').trim();
  const percent=e=>/^\d+(?:[.,]\d+)?\s*%$/.test(text(e));
  function metric(label){
    for(let e=label,depth=0;e&&depth<4;e=e.parentElement,depth++){
      if(e.matches?.('body,main,section,aside,form')||e.querySelector?.('canvas'))break;
      const leaves=[...e.querySelectorAll('span,div,p,strong,b')].filter(n=>!n.children.length&&!n.closest(own));
      if(leaves.some(percent)&&!/\d\s*(?:kWh|kW|W|€)\b/.test(text(e)))return e;
    }
    return null;
  }
  function target(){
    const header=document.querySelector('#power-chart-content .energy-chart-soc-header');
    if(header?.querySelector('.energy-chart-soc-value'))return header;
    const labels=[...document.querySelectorAll('span,div,p,dt,label')].filter(e=>!e.children.length&&!e.closest(own)&&/^(?:SOC|SOC\s*\(%\)|Laadtoestand(?:\s*\(SOC\))?|State of charge(?:\s*\(SOC\))?)$/i.test(text(e)));
    for(const label of labels){const row=metric(label);if(row)return row;}
    for(const selector of ['#current-soc','#battery-soc','#soc-value','[data-metric="soc"]','[data-soc-value]']){
      const value=document.querySelector(selector);
      if(value&&!value.closest(own)&&percent(value))return value.closest('.summary-compact-metric')||value.parentElement;
    }
    return null;
  }
  function render(view){
    const row=target();let el=document.getElementById(id);
    if(!row){el?.remove();return;}
    if(!el){
      el=document.createElement('div');el.id=id;el.setAttribute('data-be-coulomb-readout','');
      el.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 100%;grid-column:1 / -1;min-width:0;margin-top:0;color:#0891b2;font:inherit;font-variant-numeric:tabular-nums';
      const label=document.createElement('span'),value=document.createElement('strong');
      label.className='energy-chart-soc-label be-own-soc-label';label.textContent='Coulombtelling in/uit';label.style.color='#0891b2';
      value.className='energy-chart-soc-value';value.style.cssText='color:#0891b2;white-space:nowrap';
      el.append(label,value);
    }
    if(el.parentElement!==row){row.style.flexWrap='wrap';row.style.rowGap='4px';row.append(el);}
    if(typeof getComputedStyle==='function'){
      const label=row.querySelector('.energy-chart-soc-label'),value=row.querySelector('.energy-chart-soc-value');
      for(const [original,copy] of [[label,el.querySelector('span')],[value,el.querySelector('strong')]]){
        if(original&&original!==copy){const font=getComputedStyle(original).font;if(font&&copy.style.font!==font)copy.style.font=font;}
      }
    }
    const shown=view.compactSoc??view.soc;
    const value=el.querySelector('strong');if(value.textContent!==shown)value.textContent=shown;
    if(el.title!==view.state)el.title=view.state;
  }
  root.BESocNativeReadout={render,target};
})(window);

(async function () {
  'use strict';
  if(window.__beCoulombInOut6)return;
  let id=location.pathname.match(/^\/customer\/([^/]+)(?:\/|$)/)?.[1];
  if(!id||['account','current-history','current-prices','results'].includes(id))id=await window.BEInstallation?.wait();
  if(!id||window.__beCoulombInOut6)return;
  window.__beCoulombInOut6=true;
  const ext=window.BESOCExtras;
  const pastColorsPlugin={id:'beOwnSocPastColors',afterDraw(chart){
    const area=chart.chartArea,x=chart.scales.x;if(!area||!x)return;
    const slots=(payload?.items||[]).flatMap(i=>(i.hours||[]).map(t=>Date.parse(t)));
    if(slots.length!==chart.data.labels?.length)return;
    const ctx=chart.ctx,now=Date.now();ctx.save();ctx.beginPath();
    ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top);ctx.clip();
    chart.data.datasets.forEach((d,i)=>{
      if(!d.beOwnSOC||!chart.isDatasetVisible(i))return;
      const meta=chart.getDatasetMeta(i);
      const color='#0891b2';
      ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.setLineDash([]);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
      let started=false;
      for(let k=0;k<slots.length;k++){
        const point=meta.data[k],raw=d.data[k];
        if(slots[k]>now||raw==null||point?.skip||!Number.isFinite(point?.x)||!Number.isFinite(point?.y)){started=false;continue;}
        if(started)ctx.lineTo(point.x,point.y);else{ctx.moveTo(point.x,point.y);started=true;}
      }
      ctx.stroke();
    });ctx.restore();
  }};

  const core=window.BEEnergySOC, key='be-own-soc-settings:'+id, DAY=86400000;
  let cfg={},record={rows:[],manual:[]},result=null,payload=null,db=null,busy=false,error='',storageError='',lastFetch=0,forecastFetch=0;
  try{cfg=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  const settings=()=>({...core.defaults,...cfg,capacity:window.BECapacity.resolve(cfg)?.capacity??NaN,chargeEfficiency:1,dischargeEfficiency:1,auto:true});
  const number=(v,n=1)=>Number.isFinite(v)?v.toLocaleString('nl-NL',{maximumFractionDigits:n,minimumFractionDigits:n}):'—';
  const date=t=>new Date(t).toLocaleString('nl-NL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const latest=()=>result?.points.at(-1);
  const followsOriginal=p=>p?.lowState?.mode==='tracking'||p?.highState?.mode==='tracking';
  const visualSoc=p=>p?.soc??null;

  const displayKey=key+':last-display:v3';
  let lastDisplay=null,displaySaved='';
  try{const saved=JSON.parse(localStorage.getItem(displayKey)||'null');if(validDisplay(saved))lastDisplay=saved;}catch{}
  function validDisplay(v){return v&&Number.isFinite(v.t)&&v.t>0&&v.t<=Date.now()+10000&&Number.isFinite(v.soc)&&Number.isFinite(v.capacity)&&v.capacity>0&&Number.isFinite(v.input)&&Number.isFinite(v.output)&&v.capacity===settings().capacity;}
  function display(){
    const r=latest(),c=settings(),current=r&&Number.isFinite(r.soc);
    if(current){
      lastDisplay={...r,capacity:c.capacity,input:result.input,output:result.output,start:record.rows[0]?.[0],gaps:result.gaps};
      const saved=JSON.stringify(lastDisplay);
      if(saved!==displaySaved){try{localStorage.setItem(displayKey,saved);displaySaved=saved;}catch{}}
    }else if(!validDisplay(lastDisplay))lastDisplay=null;
    const shown=lastDisplay,stale=shown&&Date.now()-shown.t>120000;
    const soc=shown?number(visualSoc(shown),1)+'%':'—';
    const compactSoc=shown?number(visualSoc(shown),0)+'%':'—';
    const energy=shown?.reference?'Sinds ijkpunt '+date(shown.reference.t)+': in '+number(shown.sinceInput,2)+' kWh · uit '+number(shown.sinceOutput,2)+' kWh':'';
    const history=shown?'Bewaarde historie: in '+number(shown.input,2)+' kWh · uit '+number(shown.output,2)+' kWh'+(Number.isFinite(shown.start)?' sinds '+date(shown.start):''):'';
    let state=shown?(current?'Bijgewerkt t/m ':'Laatste geldige berekening: ')+date(shown.t):'Wachten op eerste geldige meting';
    if(shown&&Number.isFinite(shown.raw))state+=' · gemeld '+number(shown.raw,0)+'% · verschil '+number(visualSoc(shown)-shown.raw)+' procentpunt';
    if(shown?.lowState?.mode==='tracking')state+=' · volgt laagste originele SOC';
    else if(shown?.highState?.mode==='tracking')state+=' · volgt hoogste originele SOC';
    if(shown?.uncertain)state+=' · onzekere meetintervallen';
    if(stale)state+=' · metingen verouderd';
    if(!current&&shown)state+=' · wacht op nieuwe metingen';
    if(!(c.capacity>0))state='Kies de rekencapaciteit bij Herijken en instellingen';
    if(error)state+=' · bronmelding: '+error;
    if(storageError)state+=' · '+storageError;
    return {soc,compactSoc,energy,history,state};
  }
  function textIfChanged(el,value){if(el.textContent!==value)el.textContent=value;}
  function openDB(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('be-own-energy-soc-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('installations');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error("Lokale historie geblokkeerd"));
  });}
  // Merge in one read/write transaction: simultaneous dashboard tabs cannot overwrite observations.
  function persist(incoming=[],anchor=null){return new Promise((resolve,reject)=>{
    if(!db){record.rows=[...new Map([...record.rows,...incoming].filter(core.valid).map(r=>[r[0],r])).values()].sort((a,b)=>a[0]-b[0]);if(anchor)record.manual=[...record.manual.filter(a=>a.t!==anchor.t),anchor];resolve();return;}
    const tx=db.transaction('installations','readwrite'),store=tx.objectStore('installations'),req=store.get(id);
    req.onsuccess=()=>{
      try {
        const old=req.result||{rows:[],manual:[]};
        let rows=[...new Map([...record.rows,...(old.rows||[]),...incoming].filter(core.valid).map(r=>[r[0],r])).values()].sort((a,b)=>a[0]-b[0]);
        let manual=[...new Map([...record.manual,...(old.manual||[])].map(a=>[a.t,a])).values()];
        if(anchor)manual=[...manual.filter(a=>a.t!==anchor.t),anchor];
        // Preserve the integrated state when old observations are removed.
        const cutoff=Date.now()-30*DAY,index=rows.findIndex(r=>r[0]>=cutoff);
        if(index>0&&settings().capacity>0){
          const prior=core.calculate(rows.slice(0,index+1),settings(),manual).points.at(-1);
          // Retain unresolved gaps or out-of-range drift until a valid anchor exists.
          if(prior&&!prior.uncertain&&prior.soc!==null&&prior.soc>=0&&prior.soc<=100){
            rows=rows.slice(index);manual=manual.filter(a=>a.t>=rows[0][0]);
            if(!manual.some(a=>a.t===prior.t))manual.unshift({t:prior.t,soc:prior.soc,kind:'bewaard telpunt',lowState:prior.lowState,highState:prior.highState,statsReference:prior.reference?{reference:prior.reference,input:prior.sinceInput,output:prior.sinceOutput}:undefined});
          }
        }
        record={...old,rows,manual};store.put(record,id);
      }catch(e){reject(e);tx.abort();}
    };
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('Transactie afgebroken'));
  });}
  async function request(url){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
    try{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:ctl.signal});
      if(!r.ok)throw Error('Bron geeft HTTP '+r.status);return await r.json();
    }finally{clearTimeout(timer);}
  }
  function compute(){result=settings().capacity>0?core.calculate(record.rows,settings(),record.manual):null;}
  async function poll(){
    if(busy)return;busy=true;
    try {
      const now=Date.now(),last=record.rows.at(-1)?.[0];
      const u=new URL('/customer/current-history/api/',location.origin);
      u.searchParams.set('installation',id);u.searchParams.set('start',String(Math.max(now-DAY,last?last-300000:0)));u.searchParams.set('end',String(now));
      const j=await request(u.href);
      if(!Array.isArray(j.rows))throw Error('Onbekend historieformaat');
      const rows=[...j.rows,...(j.latest?[j.latest]:[])].filter(r=>Number.isFinite(r.t)&&r.t<=now).map(r=>[r.t,Number.isFinite(r.s)?r.s:null,Number.isFinite(r.bo)?r.bo:null]);
      await persist(rows);compute();lastFetch=now;error='';
      if(!payload||now-forecastFetch>300000){
        try{payload=await request('/customer/'+encodeURIComponent(id)+'/forecast_api/');forecastFetch=now;
          compute();
        }catch(e){error='Forecast tijdelijk niet beschikbaar';}
      }
    }catch(e){error=e.message||String(e);}
    finally{busy=false;render();}
  }
  const style=document.createElement('style');
  style.textContent=`.be-own-soc{margin:12px 0;padding:14px 16px;border:1px solid #c4dde1;border-radius:12px;background:rgba(8,145,178,.045);font:13px system-ui;color:inherit}.be-own-soc header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.be-own-soc strong{font-size:21px;color:#0891b2}.be-own-soc small{opacity:.75}.be-own-soc details{margin-top:10px}.be-own-soc summary{cursor:pointer}.be-own-soc form{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:12px}.be-own-soc label{display:flex;flex-direction:column;gap:4px}.be-own-soc input[type=number]{width:90px;padding:6px;border:1px solid #aaa;border-radius:6px;background:inherit;color:inherit}.be-own-soc button{padding:7px 10px;border:1px solid #7cb9c5;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.be-own-soc p{margin:8px 0}.be-own-soc output{display:block;margin-top:7px;min-height:1.4em}.be-own-soc [data-energy]{min-height:1.4em}.be-own-soc .be-soc-line{color:#0891b2;font-weight:650}.be-own-soc ul{padding-left:20px;max-height:150px;overflow:auto}`;
  style.textContent+=`[data-be-soc-compact]{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;align-items:center!important;gap:6px!important}[data-be-soc-legend]{display:inline-flex!important;flex-direction:row!important;flex-wrap:nowrap!important;width:max-content!important;max-width:100%;gap:6px!important;align-items:center!important;margin:6px 0!important}[data-be-soc-compact]>[data-be-soc-legend]{display:contents!important}[data-be-soc-compact] button,[data-be-soc-legend] button{display:inline-flex!important;flex:0 0 auto!important;width:auto!important;min-width:0!important;max-width:none!important;min-height:0!important;height:28px!important;white-space:nowrap!important;padding:4px 9px!important;font-size:12px!important;line-height:18px!important}`;
  style.textContent+=`.be-own-soc{--be-cap-border:#d4d9e1;--be-cap-surface:rgba(255,255,255,.7);--be-cap-control:#fff;--be-cap-muted:#687280;--be-cap-accent:#6b3f8d}
.be-own-soc form[data-settings]{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start;max-width:760px;box-sizing:border-box;margin:16px 0 0;padding:16px;border:1px solid var(--be-cap-border);border-radius:12px;background:var(--be-cap-surface)}
.be-own-soc [data-settings] .be-capacity-title{font-size:14px;font-weight:650;line-height:1.3}
.be-own-soc [data-settings] label{display:flex;flex-direction:column;min-width:0;gap:6px;font-size:12px;font-weight:550;line-height:1.4}
.be-own-soc [data-settings] .be-capacity-method{max-width:280px}
.be-own-soc [data-cap-kwh]{max-width:260px}
.be-own-soc [data-cap-fcc]{display:grid;grid-template-columns:1fr .8fr 1.25fr;gap:12px;align-items:end;min-width:0}
.be-own-soc [data-cap-fcc][hidden],.be-own-soc [data-cap-kwh][hidden]{display:none!important}
.be-own-soc [data-settings] .be-cap-input{display:flex;align-items:center;min-width:0;width:100%;height:40px;box-sizing:border-box;border:1px solid var(--be-cap-border);border-radius:8px;background:var(--be-cap-control);overflow:hidden}
.be-own-soc [data-settings] input[type=number]{flex:1 1 0;min-width:0;width:100%;height:100%;box-sizing:border-box;margin:0;padding:8px 10px;border:0;border-radius:0;outline:none;box-shadow:none;background:transparent;color:inherit;font:inherit;font-size:14px;font-variant-numeric:tabular-nums}
.be-own-soc [data-settings] .be-cap-unit{flex:none;padding:0 10px 0 4px;color:var(--be-cap-muted);font-size:12px;font-weight:400}
.be-own-soc [data-settings] select{min-width:0;width:100%;height:40px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--be-cap-border);border-radius:8px;background:var(--be-cap-control);color:inherit;font:inherit;font-size:14px}
.be-own-soc [data-settings] .be-cap-input:focus-within,.be-own-soc [data-settings] select:focus-visible{outline:2px solid var(--be-cap-accent);outline-offset:2px}
.be-own-soc [data-settings] .be-capacity-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding-top:2px}
.be-own-soc [data-settings] [data-capacity-preview]{flex:1 1 auto;min-width:0;margin:0;min-height:0;font-size:14px;font-weight:650;line-height:1.4}
.be-own-soc [data-settings] button{flex:none;min-height:40px;padding:8px 14px;border:1px solid var(--be-cap-accent);border-radius:8px;background:var(--be-cap-accent);color:#fff;font:inherit;font-size:12px;font-weight:600;line-height:1.4;cursor:pointer}
.be-own-soc [data-settings] button:hover{filter:brightness(1.08)}
.be-own-soc [data-settings] [data-capacity-help]{margin:0;color:var(--be-cap-muted);font-size:11px;line-height:1.55;overflow-wrap:anywhere}
.be-own-soc form[data-manual]{max-width:760px;display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:14px}
.be-own-soc [data-manual] label{min-width:0;gap:6px;font-size:12px;font-weight:550}
.be-own-soc [data-manual] input[type=number]{height:40px;width:116px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--be-cap-border);border-radius:8px;background:var(--be-cap-control);color:inherit;font-size:14px;font-variant-numeric:tabular-nums}
.be-own-soc [data-manual] button{min-height:40px;box-sizing:border-box;padding:8px 14px;border:1px solid var(--be-cap-border);border-radius:8px;font-size:12px;line-height:1.4}
html[data-be-dark="aan"] .be-own-soc{--be-cap-border:#5a5561;--be-cap-surface:rgba(0,0,0,.12);--be-cap-control:#28252e;--be-cap-muted:#beb7c6;--be-cap-accent:#8253a5}
@media(max-width:560px){.be-own-soc form[data-settings]{gap:13px;padding:14px}.be-own-soc [data-cap-fcc]{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.be-own-soc [data-cap-fcc]>label:last-child{grid-column:1 / -1}.be-own-soc [data-settings] .be-capacity-method,.be-own-soc [data-cap-kwh]{max-width:none}.be-own-soc [data-settings] .be-capacity-footer{flex-direction:column;align-items:stretch;gap:12px;padding-top:3px}.be-own-soc [data-settings] button{width:100%}.be-own-soc [data-settings] .be-cap-input,.be-own-soc [data-settings] select,.be-own-soc [data-settings] button{min-height:44px;height:44px}}
@media(max-width:560px){.be-own-soc [data-settings] input[type=number],.be-own-soc [data-settings] select,.be-own-soc [data-manual] input[type=number]{font-size:16px}.be-own-soc [data-manual] input[type=number],.be-own-soc [data-manual] button{min-height:44px}}
`;
  style.textContent+=`.be-soc-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-sizing:border-box;width:100%;margin:0;padding:8px 0 4px;color:inherit;font:11px/1.3 system-ui,sans-serif}
.be-soc-legend[data-be-soc-inline]{display:inline-flex;width:auto;padding:0;font:inherit}
.be-soc-legend .be-soc-series-toggle{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:0;padding:3px 0;margin:0;background:transparent;color:inherit;font:inherit;cursor:pointer;box-shadow:none;min-height:0}
.be-soc-legend .be-soc-series-toggle[aria-pressed="false"]{opacity:.5;text-decoration:line-through}
.be-soc-legend .be-soc-series-toggle:focus-visible{outline:2px solid #0891b2;outline-offset:3px}
.be-soc-legend .be-soc-series-swatch{width:13px;height:3px;display:inline-block;flex:none}
[data-be-coulomb-readout] .be-own-soc-label::before{background:#0891b2;box-shadow:0 0 0 3px rgba(8,145,178,.14)}

.be-soc-legend .be-soc-series-toggle{font:11px/1.3 system-ui,sans-serif!important;font-weight:400!important;border:0!important;border-radius:0!important;padding:3px 0!important;margin:0!important;min-height:0!important;background:transparent!important;box-shadow:none!important}
.be-soc-legend .be-soc-series-toggle>span{font:inherit!important}
`;
  document.head.append(style);
  function panel(canvas){
    let p=document.getElementById('be-own-soc-panel');if(p)return p;
    p=document.createElement('section');p.id='be-own-soc-panel';p.className='be-own-soc';
    p.innerHTML=`<header><span class="be-soc-line">Coulombtelling in/uit</span><strong data-soc>—</strong><span data-energy></span></header><output data-state></output><details><summary>Herijken en instellingen</summary><form data-manual><label>Nieuwe SOC %<input name="soc" type="number" min="0" max="100" step="0.1" required></label><button>Herijk alleen de blauwe telling</button></form><form data-settings class="be-capacity-card">
  <div class="be-capacity-title">Accucapaciteit</div>
  <label class="be-capacity-method">Invoermethode
    <select name="capacityMode"><option value="kwh">kWh handmatig</option><option value="fcc">FCC per accu (Ah)</option></select>
  </label>
  <div data-cap-kwh>
    <label>Totale capaciteit
      <span class="be-cap-input"><input name="capacity" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" required><span class="be-cap-unit">kWh</span></span>
    </label>
  </div>
  <div data-cap-fcc hidden>
    <label>Gemiddelde FCC
      <span class="be-cap-input"><input name="fccAh" type="number" inputmode="decimal" min="0.01" max="100000" step="0.01"><span class="be-cap-unit">Ah</span></span>
    </label>
    <label>Aantal accu’s
      <span class="be-cap-input"><input name="packCount" type="number" inputmode="numeric" min="1" max="100" step="1"><span class="be-cap-unit">stuks</span></span>
    </label>
    <label>Nominale spanning per accu
      <span class="be-cap-input"><input name="nominalVoltage" type="number" inputmode="decimal" min="1" max="1000" step="0.1"><span class="be-cap-unit">V</span></span>
    </label>
  </div>
  <div class="be-capacity-footer"><output data-capacity-preview aria-live="polite"></output><button type="submit">Capaciteit opslaan</button></div>
  <small data-capacity-help></small>
</form><p>Blauw rekent uitsluitend met de BE-dashboarddata: accuvermogen in/uit, BE-SOC voor de ijkpunten en ingestelde accucapaciteit. SOC = start-SOC + 100 × (kWh in − kWh uit) / capaciteit. Alle beschikbare vermogensintervallen worden geïntegreerd; ontbrekende BE-SOC verwijdert geen geldige vermogensmeting. De kWh-in/uitmeters lopen ook bij herijking door.</p><p>Bij dalen naar 10% en lager volgt blauw de laagste originele SOC; zodra de telling stijgt, gaat hij zelfstandig verder. Bij stijgen naar 95% en hoger volgt blauw de hoogste originele SOC; zodra de telling daalt, gaat hij zelfstandig verder. De terugweg langs 10% of 95% herijkt niet opnieuw. De getoonde kWh in/uit zijn sinds het laatste ijkpunt; de volledige telling blijft doorlopen.</p><button type="button" data-export>Exporteer telgegevens</button><output data-history></output><p data-log></p><ul data-events></ul></details>`;
    canvas.parentElement.insertAdjacentElement('afterend',p);
    const f=p.querySelector('[data-settings]'),resolved=window.BECapacity.resolve(cfg);
    f.elements.capacityMode.value=cfg.capacityMode==='fcc'?'fcc':'kwh';
    f.elements.capacity.value=cfg.capacityKwh??(resolved?.mode==='kwh'?resolved.capacity:'');
    f.elements.fccAh.value=cfg.fccAh??'';
    f.elements.packCount.value=cfg.packCount??'';
    f.elements.nominalVoltage.value=cfg.nominalVoltage??51.2;
    function preview(){
      const fcc=f.elements.capacityMode.value==='fcc';
      f.querySelector('[data-cap-kwh]').hidden=fcc;f.querySelector('[data-cap-fcc]').hidden=!fcc;
      f.elements.capacity.disabled=fcc;f.elements.capacity.required=!fcc;
      for(const name of ['fccAh','packCount','nominalVoltage']){f.elements[name].disabled=!fcc;f.elements[name].required=fcc;}
      const next=window.BECapacity.readForm(f,cfg),cap=next&&window.BECapacity.resolve(next);
      textIfChanged(f.querySelector('[data-capacity-preview]'),cap?'Rekencapaciteit: '+number(cap.capacity,2)+' kWh':'Vul de capaciteit in');
      textIfChanged(f.querySelector('[data-capacity-help]'),fcc?'Gemiddelde FCC × aantal accu’s × nominale spanning ÷ 1000. Gebruik de FCC in Ah uit je BMS.':'Je eigen rekencapaciteit voor het hele systeem. Account wordt niet automatisch overgenomen.');
    }
    f.oninput=preview;f.onchange=preview;preview();
    f.onsubmit=async e=>{
      e.preventDefault();if(!f.reportValidity())return;
      const next=window.BECapacity.readForm(f,cfg);
      if(!next){error='Vul een geldige rekencapaciteit in';render();return;}
      try{localStorage.setItem(key,JSON.stringify(next));cfg=next;error='';compute();render();}catch(e){error='Opslaan mislukt: '+e.message;render();}
    };
    p.querySelector('[data-manual]').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,r=latest();if(!r||!form.reportValidity())return;
      if(Date.now()-r.t>120000){error='Laatste meetpunt is te oud om nu te herijken';render();return;}
      try{await persist([],{t:r.t,soc:+form.elements.soc.value,kind:'handmatig'});compute();render();}catch(e){error='Herijken niet opgeslagen: '+e.message;render();}
    };
    p.querySelector('[data-export]').onclick=()=>{
      const blob=new Blob([JSON.stringify({version:'6.1.5',installation:id,settings:settings(),...record,events:result?.events},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Balansenergie-coulombtelling-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };return p;
  }
  function dataset(chart,tag,label,points,extra={}){
    let d=chart.data.datasets.find(d=>d.beOwnSOC===tag);
    if(!d){d={beOwnSOC:tag,label,type:'line',order:-20,borderColor:'#0891b2',backgroundColor:'#0891b2',borderWidth:1.6,pointRadius:0,pointHitRadius:8,fill:false,tension:0,spanGaps:false,...extra};chart.data.datasets.push(d);}
    Object.assign(d,extra);d.data=points;
    d.borderDash=[];
    d.segment={borderColor:d.borderColor,borderWidth:d.borderWidth,borderDash:[]};
  }
  function forecastValues(chart){
    const items=payload?.items;if(!items?.length)return null;
    const slots=items.flatMap(i=>(i.hours||[]).map((t,k)=>({t:Date.parse(t),dt:(i.interval_minutes||15)*60000,
      load:i.usage_kwh?.[k],pv:i.pv_production_kwh?.[k]})));
    if(slots.length!==chart.data.labels?.length)return null;
    const c=settings(),power=Number.isFinite(payload.battery_power_kw)?payload.battery_power_kw:Infinity;
    const visible=(result?.points||[]).map(p=>({...p,soc:visualSoc(p)})),last=latest();
    return {actual:slots.map(q=>core.at(visible,q.t,c.maxGapMs)),
      future:ext.project(slots,last?{...last,soc:visualSoc(last)}:null,c,power)};
  }
  function applyVisibility(chart){
    chart.data.datasets.forEach((d,i)=>{
      if(!d.beOwnSOC)return;
      const visible=cfg.show_kwh!==false;
      d.hidden=!visible;
      if(chart.setDatasetVisibility)chart.setDatasetVisibility(i,visible);
    });
  }
  function filterNativeLegend(chart){
    const native=(chart.config?.options||chart.options)?.plugins?.legend;
    if(!native)return;
    const labels=native.labels||(native.labels={});
    if(labels.filter?.beOwnSocLegendFilter)return;
    const previous=labels.filter;
    function filter(item,data){
      return !data.datasets[item.datasetIndex]?.beOwnSOC&&(!previous||previous.call(this,item,data));
    }
    filter.beOwnSocLegendFilter=true;
    labels.filter=filter;
  }
  function legend(chart){
    const canvas=chart.canvas;
    let row=document.querySelector('[data-be-soc-legend="'+canvas.id+'"]');
    // Actueel already has the full-size Coulomb readout beside the SOC value.
    if(canvas.id==='soc-chart'){
      document.querySelectorAll('[data-be-soc-legend="soc-chart"]').forEach(node=>node.remove());
      return;
    }
    if(!row){
      let host=canvas.parentElement,existing=null;
      for(let depth=0;host&&depth<3;depth++,host=host.parentElement){
        const candidate=host.querySelector('[class*="legend-soc"], [id*="soc-legend"], [aria-label="SOC reeksen"]');
        if(candidate){existing=candidate;break;}
      }
      row=document.createElement('span');row.dataset.beSocLegend=canvas.id;row.className='be-soc-legend';
      if(existing){existing.dataset.beSocCompact='';row.dataset.beSocInline='';existing.append(row);}
      else canvas.parentElement.insertAdjacentElement('beforebegin',row);
      for(const [group,label,color] of [['kwh','Coulombtelling in/uit','#0891b2']]){
        const button=document.createElement('button');button.type='button';button.className='be-soc-series-toggle';
        button.dataset.beSocGroup=group;
        button.innerHTML='<span class="be-soc-series-swatch" aria-hidden="true" style="background:'+color+'"></span><span>'+label+'</span>';
        button.onclick=()=>{cfg['show_'+group]=cfg['show_'+group]===false;localStorage.setItem(key,JSON.stringify(cfg));render();};
        row.append(button);
      }
    }
    if(!row.hasAttribute('data-be-soc-inline')){
      const rect=canvas.getBoundingClientRect(),scale=chart.width>0?rect.width/chart.width:1;
      row.style.paddingLeft=Math.max(0,(chart.chartArea?.left||0)*scale)+'px';
    }
    for(const button of row.querySelectorAll('button')){
      const visible=cfg['show_'+button.dataset.beSocGroup]!==false;
      button.setAttribute('aria-pressed',String(visible));
    }
  }
  function render(){
    const C=window.Chart;if(!C?.getChart)return;
    const cv=document.getElementById('soc-chart')||document.getElementById('soc-forecast-chart');if(!cv)return;
    const chart=C.getChart(cv);if(!chart)return;
    const p=panel(cv),view=display();
    textIfChanged(p.querySelector('[data-soc]'),view.soc);
    textIfChanged(p.querySelector('[data-energy]'),view.energy);
    textIfChanged(p.querySelector('[data-state]'),view.state);
    textIfChanged(p.querySelector('[data-history]'),view.history);
    try{window.BESocNativeReadout?.render(view);}catch(e){console.warn('[SOC waarde]',e);}
    p.querySelector('[data-log]').textContent=result?.lastAnchor?'Laatste anker: '+date(result.lastAnchor.t)+' · '+result.lastAnchor.kind+' · '+number(result.lastAnchor.soc)+'% · '+result.gaps+' meetgaten in archief.':'';
    const ul=p.querySelector('[data-events]');ul.replaceChildren(...(result?.events||[]).slice(-10).reverse().map(a=>{const li=document.createElement('li');li.textContent=date(a.t)+' · '+a.kind+' → '+number(a.soc)+'%'+(a.correction!==null?' (correctie '+number(a.correction)+' pp)':'');return li;}));
    for(const name of ['soc-chart','soc-forecast-chart']){const c=C.getChart(name);if(c){decorate(c);legend(c);c.update('none');}}
  }
  function decorate(chart){

    if(chart.canvas.id==='soc-chart'){
      const a=chart.scales.x?.min??0,b=chart.scales.x?.max??Infinity;
      const axis=chart.data.datasets.find(d=>!d.beOwnSOC)?.yAxisID||'y';
      dataset(chart,'measured','Coulombtelling in/uit',(result?.points||[]).filter(p=>p.t>=a-120000&&p.t<=b+120000).map(p=>({x:p.t,y:p.gap&&!p.anchor&&!followsOriginal(p)?null:visualSoc(p)})),{yAxisID:axis,parsing:false});
    }else if(chart.canvas.id==='soc-forecast-chart'){
      const f=forecastValues(chart);if(f){dataset(chart,'measured','Coulombtelling in/uit gemeten',f.actual,{yAxisID:'y'});dataset(chart,'forecast','Coulombtelling in/uit verwachting',f.future,{yAxisID:'y',borderDash:[],borderWidth:1.2,borderColor:'rgba(8,145,178,.55)',backgroundColor:'rgba(8,145,178,.55)'});}
    }
    if(chart.canvas.id==='soc-forecast-chart')attachPastColors(chart);
    applyVisibility(chart);
    filterNativeLegend(chart);
    try{window.BESocHover?.attach(chart,{times:(payload?.items||[]).flatMap(i=>i.hours||[])});}catch(e){console.warn("[SOC hover]",e);}
  }
  function attachPastColors(chart){
    const raw=chart.config._config||chart.config;const plugins=chart.config.plugins||(raw.plugins=[]);
    if(!plugins.some(p=>p?.id===pastColorsPlugin.id))plugins.push(pastColorsPlugin);
  }
  // The dashboard refreshes and sometimes replaces its datasets. Restore only our own series.
  let renderPending=false,started=false;
  function scheduleRender(){if(renderPending)return;renderPending=true;setTimeout(()=>{renderPending=false;register();render();},0);}
  let library;
  function register(){const C=window.Chart;if(C?.register&&C!==library){C.register(window.BESocHover.plugin,{id:'beOwnEnergySoc',beforeUpdate:decorate,afterInit:scheduleRender});library=C;}}
  new MutationObserver(records=>{
    const added=records.flatMap(r=>Array.from(r.addedNodes));
    if(added.some(n=>n.nodeType===1&&(n.matches?.('canvas')||n.querySelector?.('canvas'))))scheduleRender();
  }).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>{scheduleRender();if(started&&Date.now()-lastFetch>14000)poll();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRender();});
  let startupTries=0;
  const startupTimer=setInterval(()=>{register();scheduleRender();const C=window.Chart,ready=C?.getChart&&(C.getChart('soc-chart')||C.getChart('soc-forecast-chart'));if(ready||++startupTries>=40)clearInterval(startupTimer);},500);
  register();compute();render();
  setInterval(()=>{register();render();},5000);
  let storageTimer;
  try{db=await Promise.race([openDB(),new Promise((_,reject)=>{storageTimer=setTimeout(()=>reject(Error('Opslag reageert niet')),3000);})]);await persist();}
  catch(e){storageError='Lokale opslag niet beschikbaar: '+e.message;}
  finally{clearTimeout(storageTimer);started=true;compute();await poll();}
  setInterval(()=>{if(Date.now()-lastFetch>14000)poll();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  window.addEventListener('storage',e=>{if(e.key===key){try{cfg=JSON.parse(e.newValue||'{}');compute();render();}catch{}}});
})();


  }
  function start(){
    if(window.top!==window.self)return;
    const script=document.createElement('script');
    script.textContent='('+coulombPage.toString()+')();';
    (document.head||document.documentElement).appendChild(script);script.remove();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
