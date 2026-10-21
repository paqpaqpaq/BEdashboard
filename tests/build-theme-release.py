"""Build the theme update from the published 6.1.6, preserving older downloads."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
text = (root / 'Balansenergie-All-in-v6.1.6.user.js').read_text()
bid_start = text.index('(async function () {\n    if (window.__beAfrrBid01)')
oldbid = text[bid_start:text.index('\n})();',bid_start)+len('\n})();\n')]
soc_start = text.index('/* BE-only energy balance.')
oldsoc = text[soc_start:text.index('\n\n\n  }\n  function start()',soc_start)]
bid = (root / 'src/bid.js').read_text()
soc = (root / 'src/coulomb-beta.js').read_text()
text = text.replace(oldbid,bid,1).replace(oldsoc,soc,1)
start = text.index('  // Colour-only theme:')
end = text.index('  var EB_BASIS =', start)
text = text[:start] + '''  // The theme starts before the dashboard, including on full page navigation.
  var BE_DARK_KEY = 'be_cfg_darkmode';
  var beDarkOn = window.BETheme.isDark();
  function beDarkApply(on, style) { window.BETheme.apply(on, style); beDarkOn=window.BETheme.isDark(); }
  document.addEventListener('be-dark-change',function(){beDarkOn=window.BETheme.isDark();});

''' + text[end:]
theme = (root / 'src/dark-theme.js').read_text()
text = text.replace('  function dashboardCode() {\n', '  function dashboardCode() {\n' + theme + '\n', 1)
text = text.replace('if(beDarkOn){beDarkPending.add(info);beDarkRefresh();}', 'if(beDarkOn)window.BETheme.refresh(info);')
old = "knopje('be-p-dark', 'Donkere modus', 'Op alle pagina’s, met behoud van de bestaande indeling', beDarkOn) +"
text = text.replace(old, old + '''
      '<label for="be-p-dark-style" style="display:grid;gap:6px;margin:10px 0 14px;font-size:12px;">Dark mode stijl' +
      '<select id="be-p-dark-style" style="width:100%;min-height:44px;padding:8px;border:1px solid #e8e2f0;border-radius:6px;background:#fff;color:#292633;font:inherit;">' +
      '<option value="bruingrijs"'+(window.BETheme.style()==='bruingrijs'?' selected':'')+'>Bruingrijs</option>' +
      '<option value="grafiet"'+(window.BETheme.style()==='grafiet'?' selected':'')+'>Grafiet</option></select></label>' +''')
text = text.replace('beDarkApply(staat.dark);', "beDarkApply(staat.dark,document.getElementById('be-p-dark-style').value);")
old = ':host([data-dark]){--bg:#282723;--paper:#36342f;--ink:#eee8df;--muted:#c0b8ab;--line:#575148;--purple:#cfb3f0;--soft:#44384f;--green:#62d0ad;--red:#ff96a8;--blue:#99b9ff;color-scheme:dark}'
new = old + '''
        :host{--button:#714291;--button-ink:#fff}
        :host([data-dark]){--button:#8057a4;--ink:#f5f0e8}
        :host([data-dark][data-dark-style="grafiet"]){--bg:#111316;--paper:#1c1f26;--ink:#f5f7fa;--muted:#b6c0cf;--line:#3c4351;--purple:#a879ff;--soft:#262a34;--green:#23d9a0;--red:#ff6079;--blue:#4398ff;--button:#7340b5}
        :host([data-dark][data-dark-style="grafiet"]) .chart-bar:not([stroke]){fill-opacity:1}
        :host([data-dark]) button,:host([data-dark]) input,:host([data-dark]) select,:host([data-dark]) option{color:var(--ink)}'''
assert old in text
text = text.replace(old,new)
text = text.replace('background:var(--purple);color:var(--paper);font-weight:600', 'background:var(--button);color:var(--button-ink);font-weight:600')
old = '<label for="cfg-dark">Donkere modus<select id="cfg-dark"><option value="uit">Uit</option><option value="aan">Aan</option></select></label>'
new = old + '<label for="cfg-dark-style">Dark mode stijl<select id="cfg-dark-style"><option value="bruingrijs">Bruingrijs</option><option value="grafiet">Grafiet</option></select></label>'
assert old in text
text = text.replace(old,new)
old = "      $('cfg-dark').onchange=function(){beDarkApply($('cfg-dark').value==='aan');};"
new = old + "\n      $('cfg-dark-style').value=window.BETheme.style();\n      $('cfg-dark-style').onchange=function(){window.BETheme.setStyle($('cfg-dark-style').value);};"
assert old in text
text = text.replace(old,new)
old = "    function theme() { if (root) { var dark=document.documentElement.getAttribute('data-be-dark') === 'aan';root.toggleAttribute('data-dark',dark);root.style.background=dark?'#282723':'#f6f7fb';if($('cfg-dark'))$('cfg-dark').value=dark?'aan':'uit'; } }"
new = """    function theme() { if (root) {
      var dark=window.BETheme.isDark(),style=window.BETheme.style();
      root.toggleAttribute('data-dark',dark);root.setAttribute('data-dark-style',style);
      root.style.background=dark?(style==='grafiet'?'#111316':'#282723'):'#f6f7fb';
      if($('cfg-dark'))$('cfg-dark').value=dark?'aan':'uit';
      if($('cfg-dark-style'))$('cfg-dark-style').value=style;
    } }"""
assert old in text
text = text.replace(old,new)
text = text.replace('      document.body.appendChild(root);\n      var year =', '      theme();document.body.appendChild(root);\n      var year =')
text = text.replace("? '#373229' : '#ffffff'", "? (window.BETheme.style()==='grafiet'?'#1c1f26':'#373229') : '#ffffff'")
text = text.replace('6.1.6','6.1.7').replace('__beCoulombPage616','__beCoulombPage617')
text = text.replace("    document.addEventListener('DOMContentLoaded', launch, { once: true });", "    const ready=new MutationObserver(function(){if(document.documentElement){ready.disconnect();launch();}});\n    ready.observe(document,{childList:true});")
for name in ['Balansenergie-All-in.user.js','Balansenergie-All-in-v6.1.7.user.js','Balansenergie-All-in-v6.1.7.txt']:
    (root/name).write_text(text)
(root/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
dashboard = text.split('  function dashboardCode() {\n',1)[1].split('\n  }\n\n  function launch()',1)[0]
(root/'src/dashboard.js').write_text(dashboard+'\n')
start=dashboard.index('  /* Financieel v')
# The exact end of beOverzichtStart is stable and independent of startup routing.
financial=dashboard[start:dashboard.index('    setInterval(maintain,1500);maintain();',start)+len('    setInterval(maintain,1500);maintain();')]
financial+='\n  }\n'
(root/'src/financial-beta.js').write_text(financial)
soc=(root/'src/coulomb-beta.js').read_text().replace('6.1.6','6.1.7').replace('__beCoulombPage616','__beCoulombPage617')
(root/'src/coulomb-beta.js').write_text(soc)
test=(root/'tests/stable-release.cjs').read_text().replace('6.1.6','6.1.7').replace(r'6\.1\.6',r'6\.1\.7')
(root/'tests/stable-release.cjs').write_text(test)
with zipfile.ZipFile(root/'BE_dashboard_6_1_6.zip') as oldzip, zipfile.ZipFile(root/'BE_dashboard_6_1_7.zip','w',zipfile.ZIP_DEFLATED) as newzip:
    for name in oldzip.namelist():
        data=oldzip.read(name)
        if name=='manifest.json':
            manifest=json.loads(data);manifest['version']='6.1.7';data=(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode()
        elif name=='content.js':
            oldcontent=data.decode()
            baseline=(root/'Balansenergie-All-in-v6.1.6.user.js').read_text()
            olddashboard=baseline.split('  function dashboardCode() {\n',1)[1].split('\n  }\n\n  function launch()',1)[0]
            assert olddashboard in oldcontent
            # Preserve extension-specific startup and every BID/SOC module.
            assert oldbid in oldcontent and oldsoc in oldcontent
            updated=oldcontent.replace(olddashboard,dashboard,1).replace(oldbid,bid,1).replace(oldsoc,soc,1).replace('6.1.6','6.1.7').replace('__beCoulombPage616','__beCoulombPage617')
            updated=updated.replace("else document.addEventListener('DOMContentLoaded', beDashboardMain, { once: true });", "else {const ready=new MutationObserver(function(){if(document.documentElement){ready.disconnect();beDashboardMain();}});ready.observe(document,{childList:true});}")
            data=updated.encode()
        newzip.writestr(name,data)
changelog=(root/'CHANGELOG.md').read_text()
if '## 6.1.7 ' in changelog:
    changelog='# Changelog\n\n'+changelog[changelog.index('## 6.1.6 '):]
changelog=changelog.replace('# Changelog\n','# Changelog\n\n## 6.1.7 — 21 oktober 2026\n\n- Aanpassingen en keuze in dark mode\n',1)
(root/'CHANGELOG.md').write_text(changelog)
print('Built 6.1.7 with early theme, saved style choice and synchronized downloads.')
