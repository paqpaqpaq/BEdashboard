"""Build 6.4.2, preserving installed identity, saved keys and historical releases."""
from pathlib import Path
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASELINE = 'd69607ce20024ca77e5073fbe2416fc115689102'
VERSION = '6.4.2'

def previous(name):
    return subprocess.check_output(['git', 'show', BASELINE+':'+name], cwd=ROOT, text=True)

def version(text):
    return re.sub(r'(?<![\d.])6\.4\.1(?!\d|\.\d)', VERSION, text)

text = previous('Balansenergie-All-in.user.js')
old_afrr = previous('src/afrr-market.js').rstrip()
afrr = version((ROOT/'src/afrr-market.js').read_text())
if text.count(old_afrr) != 1:
    raise RuntimeError('Ambiguous private TenneT module')
text = version(text.replace(old_afrr, afrr.rstrip(), 1))
if re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]", text, re.I):
    raise RuntimeError('Unexpected credential-like literal')
for name in ['Balansenergie-All-in.user.js', 'Balansenergie-All-in-v6.4.2.user.js', 'Balansenergie-All-in-v6.4.2.txt']:
    (ROOT/name).write_text(text)
(ROOT/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
(ROOT/'src/afrr-market.js').write_text(afrr)
for name in ['coulomb-beta.js', 'financial-beta.js']:
    p = ROOT/'src'/name
    p.write_text(version(p.read_text()))
dashboard = text.split('  function dashboardCode() {\n', 1)[1].split('\n  }\n\n  function launch()', 1)[0]+'\n'
(ROOT/'src/dashboard.js').write_text(dashboard)
with zipfile.ZipFile(ROOT/'BE_dashboard_6_4_1.zip') as old, zipfile.ZipFile(ROOT/'BE_dashboard_6_4_2.zip', 'w', zipfile.ZIP_DEFLATED) as new:
    for name in old.namelist():
        data = old.read(name)
        if name == 'manifest.json':
            manifest = json.loads(data)
            manifest['version'] = VERSION
            data = (json.dumps(manifest, indent=2, ensure_ascii=False)+'\n').encode()
        elif name == 'content.js':
            data = version(data.decode()).encode()
        elif name == 'afrr-market.js':
            data = afrr.encode()
        new.writestr(name, data)
print('Built 6.4.2 JS/TXT/metadata/extension; name, namespace, key storage and request budgets retained.')
