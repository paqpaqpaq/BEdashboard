/* Persistent colour themes. Runs at document-start, before dashboard UI work. */
(function () {
  'use strict';
  if (window.BETheme) return;
  var KEY = 'be_cfg_darkmode', STYLE_KEY = 'be_cfg_darkstyle';
  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  var enabled = read(KEY) === 'aan';
  var selected = read(STYLE_KEY) === 'grafiet' ? 'grafiet' : 'bruingrijs';
  var palettes = {
    bruingrijs: {bg:'#2c2924',paper:'#37322b',raised:'#454036',nav:'#211e1a',ink:'#f5f0e8',muted:'#c7beb0',line:'#675e4f',accent:'#cbb58f',control:'#7b6445',green:'#33c071',red:'#f24f5b',blue:'#31adde',yellow:'#eca524'},
    grafiet: {bg:'#111316',paper:'#1c1f26',raised:'#262a34',nav:'#15171c',ink:'#f5f7fa',muted:'#b6c0cf',line:'#3c4351',accent:'#a879ff',control:'#7340b5',green:'#23d9a0',red:'#ff6079',blue:'#4398ff',yellow:'#ffc64a'}
  };
  var base, inlineSheet, serial=0, ruleIds=new Map(), pending=new Set(), queued=false;
  var sourceSheets=new WeakMap(), inlineCache=new WeakMap(), importantCache=new WeakMap();
  var marker='data-be-theme-inline', own='data-be-theme-sheet';
  function palette() { return palettes[selected]; }
  function token(name, canvas) { return canvas ? palette()[name] : 'var(--be-theme-'+name+')'; }
  function rgba(value) {
    value=String(value).trim().toLowerCase();
    var named={white:'#ffffff',black:'#000000',gray:'#808080',grey:'#808080',transparent:'#00000000'};
    value=named[value]||value;
    if (/^#[\da-f]{3,8}$/.test(value)) {
      var hex=value.slice(1);
      if(hex.length===3||hex.length===4)hex=hex.split('').map(function(c){return c+c;}).join('');
      if(hex.length!==6&&hex.length!==8)return null;
      return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),hex.length===8?parseInt(hex.slice(6,8),16)/255:1];
    }
    var srgb=value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
    if(srgb)return [+srgb[1]*255,+srgb[2]*255,+srgb[3]*255,srgb[4]==null?1:+srgb[4]];
    var hsl=value.match(/^hsla?\(\s*([-\d.]+)(?:deg)?[, ]+([\d.]+)%[, ]+([\d.]+)%(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)$/);
    if(hsl){
      var hue=((+hsl[1]%360)+360)%360/360,saturation=+hsl[2]/100,lum=+hsl[3]/100;
      var amplitude=saturation*Math.min(lum,1-lum);
      return [0,8,4].map(function(n){var k=(n+hue*12)%12;return 255*(lum-amplitude*Math.max(-1,Math.min(k-3,9-k,1)));}).concat(hsl[4]==null?1:+hsl[4]/(hsl[5]?100:1));
    }
    var m=value.match(/^rgba?\(\s*([\d.]+)(%)?[, ]+([\d.]+)(%)?[, ]+([\d.]+)(%)?(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)$/);
    return m?[+m[1]*(m[2]?2.55:1),+m[3]*(m[4]?2.55:1),+m[5]*(m[6]?2.55:1),m[7]==null?1:+m[7]/(m[8]?100:1)]:null;
  }
  function lighter(value,amount) {
    return 'rgb('+rgba(value).slice(0,3).map(function(v){return Math.round(v+(255-v)*amount);}).join(',')+')';
  }
  // Canvas lines and HTML legend markers share these exact series colours.
  function seriesColor(series) {
    var light={coulomb:'#0891b2','coulomb-forecast':'rgba(8,145,178,.55)','bid-import':'#b65c72','bid-export':'#73b9a1'};
    if(!enabled)return light[series];
    if(series==='coulomb')return palette().blue;
    if(series==='coulomb-forecast')return lighter(palette().blue,.48);
    if(series==='bid-import')return lighter(palette().red,.25);
    if(series==='bid-export')return lighter(palette().green,.25);
  }
  function color(value,kind,canvas) {
    var c=rgba(value);if(!c||c[3]===0)return value;
    var r=c[0],g=c[1],b=c[2],hi=Math.max(r,g,b),lo=Math.min(r,g,b),light=(r+g+b)/3,name;
    // A thin coloured stroke is a data series, not a neutral chart grid line.
    if(canvas&&['coulomb','coulomb-forecast','bid-import','bid-export'].some(function(series){return JSON.stringify(c)===JSON.stringify(rgba(seriesColor(series)));}))return value;
    if(hi-lo<48)name=kind==='border'?'line':kind==='background'?(light>245?'paper':light>95?'raised':null):(light<100||light>205?'ink':'muted');
    else if(kind==='background'&&!canvas)name=(b>g*1.12&&r>b*.6)?'control':'raised';
    else if(r>=g*.9&&g>b*1.3&&r>b*1.3)name='yellow';
    else if(g>r*1.15&&g>b*1.05)name='green';
    else if(r>g*1.4&&r>b*1.2)name=g>75&&g>b*1.5?'yellow':'red';
    else if(b>g*1.12&&r>b*.6)name='accent';
    else if(b>r*1.1)name='blue';
    else name=kind==='background'?'raised':'ink';
    if(!name)return value;
    var mapped=token(name,canvas);
    // Forecast solar production is a filled bar series, including low-alpha source colours.
    if(canvas&&kind==='background'&&name==='yellow')c[3]=Math.max(c[3],.85);
    if(kind==='text'&&hi-lo<48)return mapped;
    if(c[3]<1)return canvas?'rgba('+rgba(mapped).slice(0,3).join(',')+','+c[3]+')':'color-mix(in srgb,'+mapped+' '+(c[3]*100)+'%,transparent)';
    return mapped;
  }
  var colorPattern=/(?:rgba?|hsla?|color)\([^)]*\)|#[\da-f]{3,8}\b|\b(?:white|black|gr[ae]y|transparent)\b/gi;
  function colours(value,kind) {
    if(!value||/url\(|var\(/i.test(value))return value;
    return value.replace(colorPattern,function(v){return color(v,kind,false);});
  }
  function declarations(style) {
    var out=[];
    Array.from(style).forEach(function(prop){
      var value=style.getPropertyValue(prop),kind,next;
      if(/^(?:color|fill|stroke|caret-color|text-decoration-color|outline-color)$/.test(prop))kind='text';
      else if(/^border(?:-(?:top|right|bottom|left))?(?:-color)?$/.test(prop)||prop==='outline')kind='border';
      else if(/^background(?:-color|-image)?$/.test(prop))kind='background';
      else if((prop==='box-shadow'||prop==='text-shadow')&&!/var\(/i.test(value)){next=value.replace(colorPattern,'rgba(0,0,0,.2)');}
      else if(prop.indexOf('--')===0&&/(?:color|bg|surface|border|ink|muted|purple|green|red|blue)/.test(prop))kind=/bg|background|surface/.test(prop)?'background':/border/.test(prop)?'border':'text';
      if(kind)next=colours(value,kind);
      if(next&&next!==value)out.push(prop+':'+next+'!important');
    });
    return out.join(';');
  }
  function selectors(text) {
    var list=[],start=0,depth=0,quote='';
    for(var i=0;i<text.length;i++){
      var c=text[i];if(quote){if(c===quote&&text[i-1]!=='\\')quote='';continue;}
      if(c==='"'||c==="'"){quote=c;continue;}
      if(c==='('||c==='[')depth++;if(c===')'||c===']')depth--;
      if(c===','&&depth===0){list.push(text.slice(start,i));start=i+1;}
    }list.push(text.slice(start));
    return list.map(function(s){s=s.trim();return /^(?:html|:root)(?=[\s.#:[>+~]|$)/.test(s)?s.replace(/^(?:html|:root)/,'html[data-be-dark="aan"]'):'html[data-be-dark="aan"] '+s;}).join(',');
  }
  function convert(rules) {
    var css='';Array.from(rules).forEach(function(rule){
      if(rule.selectorText&&rule.style){
        // Never recolour an already authored dark theme or our own output.
        if(/data-be-dark|data-be-theme|data-dark/.test(rule.selectorText))return;
        var decl=declarations(rule.style);if(decl)css+=selectors(rule.selectorText)+'{'+decl+'}\n';
      }else if(rule.cssRules&&rule.conditionText){
        var nested=convert(rule.cssRules);if(nested)css+=(rule.constructor.name==='CSSSupportsRule'?'@supports ':'@media ')+rule.conditionText+'{'+nested+'}\n';
      }
    });return css;
  }
  function compile(owner) {
    if(!owner||owner.hasAttribute(own)||!owner.sheet)return;
    var rules;try{rules=owner.sheet.cssRules;}catch(_){return;}
    var source=owner.tagName==='STYLE'?owner.textContent:String(rules.length);
    var prior=sourceSheets.get(owner);if(prior&&prior.source===source){prior.style.media=owner.media||'';prior.style.disabled=!!owner.disabled;return;}
    var result=convert(rules),style=prior&&prior.style;
    if(!style){style=document.createElement('style');style.setAttribute(own,'compiled');(document.head||document.documentElement).appendChild(style);}
    if(style.textContent!==result)style.textContent=result;
    style.media=owner.media||'';style.disabled=!!owner.disabled;
    sourceSheets.set(owner,{source:source,style:style});
  }
  function inline(element) {
    if(!element||element.nodeType!==1||element.hasAttribute(own)||/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|CANVAS)$/.test(element.tagName))return;
    var source=(element.getAttribute('style')||'')+'|'+(element.getAttribute('fill')||'')+'|'+(element.getAttribute('stroke')||'');
    if(inlineCache.get(element)===source)return;
    inlineCache.set(element,source);
    var special=[],tracked=importantCache.get(element)||{};
    Array.from(element.style).forEach(function(prop){
      var value=element.style.getPropertyValue(prop),old=tracked[prop];
      if(old&&value===old.applied){special.push(old.definition);return;}
      if(old)delete tracked[prop];
      if(element.style.getPropertyPriority(prop)!=='important')return;
      var probe=document.createElement('span');probe.style.setProperty(prop,value);
      var converted=declarations(probe.style);
      if(!converted)return;
      var mapped=converted.slice(converted.indexOf(':')+1).replace(/!important$/,'');
      var variable='--be-theme-important-'+(++serial),applied='var('+variable+','+value+')';
      element.style.setProperty(prop,applied,'important');
      tracked[prop]={applied:element.style.getPropertyValue(prop),definition:variable+':'+mapped+'!important'};
      special.push(tracked[prop].definition);
    });
    importantCache.set(element,tracked);
    var decl=declarations(element.style)+(special.length?';'+special.join(';'):'');
    ['fill','stroke'].forEach(function(prop){var raw=element.getAttribute(prop);if(raw){var mapped=colours(raw,'text');if(mapped!==raw)decl+=';'+prop+':'+mapped+'!important';}});
    if(!decl){element.removeAttribute(marker);return;}
    var id=ruleIds.get(decl);
    if(!id){id='t'+(++serial);ruleIds.set(decl,id);inlineSheet.sheet.insertRule('html[data-be-dark="aan"] :is(#be-theme-inline-priority,['+marker+'="'+id+'"]){'+decl+'}',inlineSheet.sheet.cssRules.length);}
    if(element.getAttribute(marker)!==id)element.setAttribute(marker,id);
    inlineCache.set(element,(element.getAttribute('style')||'')+'|'+(element.getAttribute('fill')||'')+'|'+(element.getAttribute('stroke')||''));
  }
  function refresh(root) {
    if(!root||root.nodeType!==1)return;
    if(root.matches('style,link[rel="stylesheet"]'))compile(root);
    else inline(root);
    root.querySelectorAll('style,link[rel="stylesheet"],[style],[fill],[stroke]').forEach(function(e){if(e.matches('style,link[rel="stylesheet"]'))compile(e);else inline(e);});
  }
  function queue(root) {
    if(!root||root.nodeType!==1||root.hasAttribute(own))return;
    pending.add(root);
    if(!queued){queued=true;queueMicrotask(function(){queued=false;var nodes=Array.from(pending);pending.clear();nodes.forEach(refresh);});}
  }
  function emit() { document.dispatchEvent(new Event('be-dark-change')); }
  function state() {
    var html=document.documentElement;if(!html)return;
    html.setAttribute('data-be-dark-style',selected);
    html.setAttribute('data-be-dark',enabled?'aan':'uit');
  }
  function apply(on,style) {
    enabled=!!on;if(style==='grafiet'||style==='bruingrijs')selected=style;
    save(KEY,enabled?'aan':'uit');save(STYLE_KEY,selected);state();emit();
  }
  function init() {
    if(base||!document.documentElement)return;
    base=document.createElement('style');base.id='be-dark-style';base.setAttribute(own,'base');
    var css='';Object.keys(palettes).forEach(function(name){css+='html[data-be-dark-style="'+name+'"]{'+Object.keys(palettes[name]).map(function(key){return '--be-theme-'+key+':'+palettes[name][key];}).join(';')+'}\n';});
    css+=':root{--be-coulomb-line:#0891b2;--be-coulomb-forecast:rgba(8,145,178,.55)}\n';
    Object.keys(palettes).forEach(function(name){css+='html[data-be-dark="aan"][data-be-dark-style="'+name+'"]{--be-coulomb-line:'+palettes[name].blue+';--be-coulomb-forecast:'+lighter(palettes[name].blue,.48)+'}\n';});
    css+=`
html[data-be-dark="aan"]{color-scheme:dark;background:var(--be-theme-bg)!important;color:var(--be-theme-ink)!important;--bs-body-bg:var(--be-theme-bg);--bs-body-color:var(--be-theme-ink);--bs-border-color:var(--be-theme-line)}
html[data-be-dark="aan"] body{background:var(--be-theme-bg)!important;color:var(--be-theme-ink)!important}
html[data-be-dark="aan"] body :where(*):not(svg):not(svg *){color:var(--be-theme-ink)!important}
html[data-be-dark="aan"] :is(.card,.card-header,.card-body,.modal-content,.dropdown-menu,.offcanvas){background-color:var(--be-theme-paper)!important;border-color:var(--be-theme-line)!important;color:var(--be-theme-ink)!important}
html[data-be-dark="aan"] :is(nav,.sidebar,.sidenav,#mobileSidebar){background-color:var(--be-theme-nav)!important;color:var(--be-theme-ink)!important}
html[data-be-dark="aan"] :is(input,select,textarea,option){color:var(--be-theme-ink)!important;background-color:var(--be-theme-raised)!important;border-color:var(--be-theme-line)!important}
html[data-be-dark="aan"] :is(.text-muted,.form-text,.summary-compact-label){color:var(--be-theme-muted)!important}
html[data-be-dark="aan"] :is(.summary-compact-metric){background:var(--be-theme-raised)!important;border-color:var(--be-theme-line)!important}
html[data-be-dark="aan"] :is(.btn-primary,.btn-check:checked+.btn,.nav-link.active){background:var(--be-theme-control)!important;color:#fff!important;border-color:var(--be-theme-control)!important}
html[data-be-dark="aan"] :is(.btn-light,.btn-outline-primary){background:var(--be-theme-raised)!important;color:var(--be-theme-ink)!important;border-color:var(--be-theme-line)!important}
html[data-be-dark="aan"] :is(.sidebar,.sidenav,#mobileSidebar) a{color:var(--be-theme-ink)!important}
html[data-be-dark="aan"] :is(.sidebar,.sidenav,#mobileSidebar) a:is(.active,[aria-current="page"]){background:var(--be-theme-control)!important;color:#fff!important}
html[data-be-dark="aan"] #be-panelen tr:nth-child(odd){background:var(--be-theme-paper)!important}
html[data-be-dark="aan"] #be-panelen tr:nth-child(even){background:var(--be-theme-raised)!important}
html[data-be-dark="aan"] #be-panelen details{background:var(--be-theme-paper)!important}
html[data-be-dark="aan"] .be-own-soc{--be-cap-border:var(--be-theme-line);--be-cap-surface:var(--be-theme-paper);--be-cap-control:var(--be-theme-raised);--be-cap-muted:var(--be-theme-muted);--be-cap-accent:var(--be-theme-control)}
`;
    base.textContent=css;document.documentElement.appendChild(base);
    inlineSheet=document.createElement('style');inlineSheet.setAttribute(own,'inline');document.documentElement.appendChild(inlineSheet);
    state();refresh(document.documentElement);
  }
  // Read declarations, never getComputedStyle or switch off the visible sheet.
  // Live class changes now stay entirely in CSS; numerical updates do no theme work.
  new MutationObserver(function(records){
    init();records.forEach(function(r){
      var target=r.target.nodeType===1?r.target:r.target.parentElement;
      if(!target||target.closest('['+own+']'))return;
      if(r.type==='attributes'){
        if(target.matches('style,link[rel="stylesheet"]'))compile(target);else inline(target);
      }else if(target.tagName==='STYLE')compile(target);
      else {
        r.addedNodes.forEach(queue);
        r.removedNodes.forEach(function(node){if(node.nodeType!==1)return;var owners=[node].concat(Array.from(node.querySelectorAll('style,link[rel="stylesheet"]')));owners.forEach(function(owner){var entry=sourceSheets.get(owner);if(entry&&!owner.isConnected){entry.style.remove();sourceSheets.delete(owner);}});});
      }
    });
  }).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','fill','stroke','media','disabled','href']});
  document.addEventListener('load',function(event){if(event.target.matches&&event.target.matches('link[rel="stylesheet"]'))compile(event.target);},true);
  window.addEventListener('storage',function(event){if(event.key===KEY||event.key===STYLE_KEY){enabled=read(KEY)==='aan';selected=read(STYLE_KEY)==='grafiet'?'grafiet':'bruingrijs';state();emit();}});
  window.addEventListener('pageshow',function(){enabled=read(KEY)==='aan';selected=read(STYLE_KEY)==='grafiet'?'grafiet':'bruingrijs';state();emit();});
  window.BETheme={apply:apply,setStyle:function(style){apply(enabled,style);},isDark:function(){return enabled;},style:function(){return selected;},color:color,seriesColor:seriesColor,refresh:queue};
  if(typeof CanvasRenderingContext2D!=='undefined'){
    var proto=CanvasRenderingContext2D.prototype;
    ['fill','fillRect','fillText','stroke','strokeRect','strokeText'].forEach(function(name){
      var original=proto[name];if(!original)return;
      proto[name]=function(){
        if(!enabled)return original.apply(this,arguments);
        var property=name.indexOf('stroke')===0?'strokeStyle':'fillStyle',previous=this[property];
        var kind=name.indexOf('Text')!==-1?'text':name.indexOf('stroke')===0?(this.lineWidth<1.5?'border':'text'):'background';
        this[property]=color(previous,kind,true);
        try{return original.apply(this,arguments);}finally{this[property]=previous;}
      };
    });
    document.addEventListener('be-dark-change',function(){if(window.Chart&&window.Chart.getChart)document.querySelectorAll('canvas').forEach(function(canvas){var chart=window.Chart.getChart(canvas);if(chart)chart.draw();});});
  }
  init();
})();
