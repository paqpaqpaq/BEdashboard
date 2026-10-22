"""Build 6.1.8 from the published 6.1.7; keep historical downloads intact."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
baseline = (root/'Balansenergie-All-in-v6.1.7.user.js').read_text()
start = baseline.index('  /* Financieel v')
end = baseline.index('    setInterval(maintain,1500);maintain();',start)+len('    setInterval(maintain,1500);maintain();\n  }\n')
old_financial = baseline[start:end]
bid_start = baseline.index('(async function () {\n    if (window.__beAfrrBid01)')
old_bid = baseline[bid_start:baseline.index('\n})();',bid_start)+len('\n})();\n')]
financial = (root/'src/financial-beta.js').read_text()
bid = (root/'src/bid.js').read_text()
assert baseline.count(old_financial)==1 and baseline.count(old_bid)==1

def update(text):
    assert old_financial in text and old_bid in text
    return text.replace(old_financial,financial,1).replace(old_bid,bid,1).replace('6.1.7','6.1.8').replace('__beCoulombPage617','__beCoulombPage618')

text = update(baseline)
for name in ['Balansenergie-All-in.user.js','Balansenergie-All-in-v6.1.8.user.js','Balansenergie-All-in-v6.1.8.txt']:
    (root/name).write_text(text)
(root/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
dashboard = text.split('  function dashboardCode() {\n',1)[1].split('\n  }\n\n  function launch()',1)[0]
(root/'src/dashboard.js').write_text(dashboard+'\n')
(root/'src/financial-beta.js').write_text(financial.replace('6.1.7','6.1.8'))
soc = (root/'src/coulomb-beta.js').read_text().replace('6.1.7','6.1.8')
(root/'src/coulomb-beta.js').write_text(soc)
with zipfile.ZipFile(root/'BE_dashboard_6_1_7.zip') as oldzip, zipfile.ZipFile(root/'BE_dashboard_6_1_8.zip','w',zipfile.ZIP_DEFLATED) as newzip:
    for name in oldzip.namelist():
        data = oldzip.read(name)
        if name=='manifest.json':
            manifest = json.loads(data);manifest['version']='6.1.8'
            data = (json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode()
        elif name=='content.js':
            data = update(data.decode()).encode()
        newzip.writestr(name,data)
test = (root/'tests/stable-release.cjs').read_text().replace('6.1.7','6.1.8').replace(r'6\.1\.7',r'6\.1\.8')
(root/'tests/stable-release.cjs').write_text(test)
changelog = (root/'CHANGELOG.md').read_text()
if '## 6.1.8 ' not in changelog:
    changelog = changelog.replace('# Changelog\n','# Changelog\n\n## 6.1.8 — 22 oktober 2026\n\n- visuele aanpassingen bids, en smartphone navigatie\n',1)
(root/'CHANGELOG.md').write_text(changelog)
print('Built synchronized 6.1.8 userscript, metadata, TXT and extension ZIP.')
