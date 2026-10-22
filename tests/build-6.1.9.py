"""Build 6.1.9 from the immutable 6.1.8 downloads and current dashboard sources."""
from pathlib import Path
import json
import zipfile

root=Path(__file__).resolve().parents[1]
baseline=(root/'Balansenergie-All-in-v6.1.8.user.js').read_text()
old_dashboard=baseline.split('  function dashboardCode() {\n',1)[1].split('\n  }\n\n  function launch()',1)[0]
dashboard=(root/'src/dashboard.js').read_text().rstrip('\n')
theme_start=dashboard.index('/* Persistent colour themes.')
old_theme=dashboard[theme_start:dashboard.index('\n})();',theme_start)+len('\n})();\n')]
new_theme=(root/'src/dark-theme.js').read_text()
cache=(root/'src/current-tariff-cache.js').read_text()
if '/* Short-lived observations of the running quarter;' in dashboard:
    at=dashboard.index('/* Short-lived observations of the running quarter;')
    dashboard=dashboard[:at]+dashboard[dashboard.index('\n})();',at)+len('\n})();\n'):]
dashboard=dashboard.replace(old_theme,new_theme+'\n'+cache+'\n',1)
start=dashboard.index('  /* Financieel v')
end=dashboard.index('    setInterval(maintain,1500);maintain();',start)+len('    setInterval(maintain,1500);maintain();\n  }\n')
old_financial=dashboard[start:end]
financial=(root/'src/financial-beta.js').read_text()
assert old_financial in dashboard
dashboard=dashboard.replace(old_financial,financial,1).replace('6.1.8','6.1.9')

def update(text):
    assert old_dashboard in text
    return text.replace(old_dashboard,dashboard,1).replace('6.1.8','6.1.9').replace('__beCoulombPage618','__beCoulombPage619')

text=update(baseline)
for name in ['Balansenergie-All-in.user.js','Balansenergie-All-in-v6.1.9.user.js','Balansenergie-All-in-v6.1.9.txt']:
    (root/name).write_text(text)
(root/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
(root/'src/dashboard.js').write_text(dashboard+'\n')
(root/'src/financial-beta.js').write_text(financial.replace('6.1.8','6.1.9'))
p=root/'src/coulomb-beta.js';p.write_text(p.read_text().replace('6.1.8','6.1.9'))
with zipfile.ZipFile(root/'BE_dashboard_6_1_8.zip') as oldzip,zipfile.ZipFile(root/'BE_dashboard_6_1_9.zip','w',zipfile.ZIP_DEFLATED) as newzip:
    for name in oldzip.namelist():
        data=oldzip.read(name)
        if name=='manifest.json':
            manifest=json.loads(data);manifest['version']='6.1.9';data=(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode()
        elif name=='content.js':data=update(data.decode()).encode()
        newzip.writestr(name,data)
p=root/'tests/stable-release.cjs';p.write_text(p.read_text().replace('6.1.8','6.1.9').replace(r'6\.1\.8',r'6\.1\.9'))
p=root/'CHANGELOG.md';changelog=p.read_text()
if '## 6.1.9 ' not in changelog:
    changelog=changelog.replace('# Changelog\n','# Changelog\n\n## 6.1.9 — 22 oktober 2026\n\n- Duidelijkere schakelaars in dark mode, tijdelijke tariefcache en navigatie in Financieel.\n',1)
p.write_text(changelog)
print('Built synchronized 6.1.9 userscript, metadata, TXT and extension ZIP.')
