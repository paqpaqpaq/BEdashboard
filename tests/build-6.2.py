"""Build 6.2 from the immutable 6.1.9.1 downloads; no changelog changes."""
from pathlib import Path
import json
import re
import zipfile

root = Path(__file__).resolve().parents[1]
baseline = (root / 'Balansenergie-All-in-v6.1.9.1.user.js').read_text()
start = baseline.index('/* BE-only energy balance.')
old_soc = baseline[start:baseline.index('\n\n\n  }\n  function start()', start)]
soc = (root / 'src/coulomb-beta.js').read_text()
history = (root / 'src/soc-history-beta.js').read_text()
assert history in soc

def version(text):
    return re.sub(r'6\.1\.9\.1(?!\.\d)', '6.2', text)

soc = version(soc)

def update(text):
    assert text.count(old_soc) == 1
    return version(text.replace(old_soc, soc, 1)).replace('__beCoulombPage6191', '__beCoulombPage62')

text = update(baseline)
for name in ['Balansenergie-All-in.user.js', 'Balansenergie-All-in-v6.2.user.js', 'Balansenergie-All-in-v6.2.txt']:
    (root / name).write_text(text)
(root / 'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==') + len('// ==/UserScript==')] + '\n')
dashboard = text.split('  function dashboardCode() {\n', 1)[1].split('\n  }\n\n  function launch()', 1)[0]
(root / 'src/dashboard.js').write_text(dashboard + '\n')
(root / 'src/coulomb-beta.js').write_text(soc)
financial = root / 'src/financial-beta.js'
financial.write_text(version(financial.read_text()))
with zipfile.ZipFile(root / 'BE_dashboard_6_1_9_1.zip') as oldzip, zipfile.ZipFile(root / 'BE_dashboard_6_2.zip', 'w', zipfile.ZIP_DEFLATED) as newzip:
    for name in oldzip.namelist():
        data = oldzip.read(name)
        if name == 'manifest.json':
            manifest = json.loads(data)
            manifest['version'] = '6.2'
            data = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode()
        elif name == 'content.js':
            data = update(data.decode()).encode()
        newzip.writestr(name, data)
test = root / 'tests/stable-release.cjs'
test.write_text(version(test.read_text()).replace(r'6\.1\.9\.1\n', r'6\.2\n'))
print('Built synchronized 6.2 JS, TXT, metadata and extension ZIP; changelog unchanged.')
