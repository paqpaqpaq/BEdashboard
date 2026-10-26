"""Release 6.4, preserving script identity and all private credential storage."""
from pathlib import Path
import json
import re
import zipfile

root = Path(__file__).resolve().parents[1]
baseline = (root/'Balansenergie-All-in-v6.3.2.user.js').read_text()
start = baseline.index('/* BE-only energy balance.')
old_soc = baseline[start:baseline.index('\n\n\n  }\n  function start()', start)]
old_afrr = baseline[baseline.index('/* Regelvermogen & biedingen — 6.3.2.'):]
version = lambda text: re.sub(r'6\.3\.[23](?!\d)', '6.4', text)
soc = version((root/'src/coulomb-beta.js').read_text())
afrr = version((root/'src/afrr-market.js').read_text())
for module in ['voltage-profile.js','coulomb-core-beta.js','capacity-settings-beta.js','soc-hover-beta.js','soc-history-beta.js']:
    assert (root/'src'/module).read_text().rstrip() in soc, module

def update(text):
    assert text.count(old_soc) == 1
    return version(text.replace(old_soc, soc, 1)).replace('__beCoulombPage632','__beCoulombPage64')

text = update(baseline).replace(version(old_afrr), afrr, 1)
old_name = re.search(r'^// @name\s+(.+)$', baseline, re.M).group(1)
# Name/namespace are compatibility identifiers, not version display fields.
text = re.sub(r'(^// @name\s+).+$',lambda m:m.group(1)+old_name,text,count=1,flags=re.M)
assert text.endswith(afrr)
assert not re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]",text,re.I)
for name in ['Balansenergie-All-in.user.js','Balansenergie-All-in-v6.4.user.js','Balansenergie-All-in-v6.4.txt']:
    (root/name).write_text(text)
(root/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
(root/'src/coulomb-beta.js').write_text(soc)
(root/'src/afrr-market.js').write_text(afrr)
(root/'src/dashboard.js').write_text(text.split('  function dashboardCode() {\n',1)[1].split('\n  }\n\n  function launch()',1)[0]+'\n')
p = root/'src/financial-beta.js';p.write_text(version(p.read_text()))
with zipfile.ZipFile(root/'BE_dashboard_6_3_2.zip') as old,zipfile.ZipFile(root/'BE_dashboard_6_4.zip','w',zipfile.ZIP_DEFLATED) as new:
    for name in old.namelist():
        data = old.read(name)
        if name == 'manifest.json':
            manifest=json.loads(data);manifest['version']='6.4'
            data=(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode()
        elif name == 'content.js':
            data=update(data.decode()).encode()
        elif name == 'afrr-market.js':
            data=afrr.encode()
        new.writestr(name,data)
print('Built 6.4 JS/TXT/metadata/extension; script name, namespace, credential key, private adapter and extension identity retained.')
