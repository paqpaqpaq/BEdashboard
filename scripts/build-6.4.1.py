"""Build 6.4.1 without changing historical releases or credential namespaces."""
from pathlib import Path
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '6.4.1'
BASELINE = '2a4edb8'

def version(text):
    return re.sub(r'(?<![\d.])6\.4(?!\d|\.\d)', VERSION, text)

text = subprocess.check_output(['git', 'show', BASELINE+':Balansenergie-All-in.user.js'], cwd=ROOT, text=True)
for name in ['bid.js', 'afrr-market.js']:
    old = subprocess.check_output(['git', 'show', BASELINE+':src/'+name], cwd=ROOT, text=True).rstrip()
    new = (ROOT/'src'/name).read_text().rstrip()
    if text.count(old) != 1:
        raise RuntimeError('Ambiguous source module: '+name)
    text = text.replace(old, new, 1)
text = version(text)
text = re.sub(r'(^// @name\s+).+$', r'\g<1>Balansenergie All-in', text, count=1, flags=re.M)
if re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]", text, re.I):
    raise RuntimeError('Unexpected embedded credential-like literal')
for name in ['Balansenergie-All-in.user.js', 'Balansenergie-All-in-v6.4.1.user.js', 'Balansenergie-All-in-v6.4.1.txt']:
    (ROOT/name).write_text(text)
(ROOT/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
for name in ['afrr-market.js', 'coulomb-beta.js', 'financial-beta.js']:
    p = ROOT/'src'/name
    p.write_text(version(p.read_text()))
dashboard = text.split('  function dashboardCode() {\n', 1)[1].split('\n  }\n\n  function launch()', 1)[0]+'\n'
(ROOT/'src/dashboard.js').write_text(dashboard)
with zipfile.ZipFile(ROOT/'BE_dashboard_6_4.zip') as old, zipfile.ZipFile(ROOT/'BE_dashboard_6_4_1.zip', 'w', zipfile.ZIP_DEFLATED) as new:
    for name in old.namelist():
        data = old.read(name)
        if name == 'manifest.json':
            manifest = json.loads(data)
            manifest['version'] = VERSION
            data = (json.dumps(manifest, indent=2, ensure_ascii=False)+'\n').encode()
        elif name == 'content.js':
            original = subprocess.check_output(['git', 'show', BASELINE+':src/dashboard.js'], cwd=ROOT, text=True).rstrip()
            source = data.decode()
            if source.count(original) != 1:
                raise RuntimeError('Ambiguous extension dashboard')
            source = source.replace(original, dashboard.rstrip(), 1)
            original_bid = subprocess.check_output(['git', 'show', BASELINE+':src/bid.js'], cwd=ROOT, text=True).rstrip()
            if source.count(original_bid) != 1:
                raise RuntimeError('Ambiguous extension BID module')
            source = source.replace(original_bid, (ROOT/'src/bid.js').read_text().rstrip(), 1)
            data = version(source).encode()
        elif name == 'afrr-market.js':
            data = (ROOT/'src/afrr-market.js').read_bytes()
        new.writestr(name, data)
print('Built 6.4.1 JS/TXT/metadata/extension with permanent identity and automatic key migration.')
