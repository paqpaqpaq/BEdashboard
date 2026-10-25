"""Navigation hotfix from immutable 6.3.1; API storage/budgets unchanged."""
from pathlib import Path
import json,re,zipfile
root=Path(__file__).resolve().parents[1]
baseline=(root/'Balansenergie-All-in-v6.3.1.user.js').read_text()
old_module=baseline[baseline.index('/* Regelvermogen & biedingen — 6.3.1.'):]
version=lambda text:re.sub(r'6\.3\.1(?!\d)','6.3.2',text)
module=version((root/'src/afrr-market.js').read_text())
def update(text):return version(text).replace('__beCoulombPage631','__beCoulombPage632')
text=update(baseline.replace(old_module,module,1))
for name in ['Balansenergie-All-in.user.js','Balansenergie-All-in-v6.3.2.user.js','Balansenergie-All-in-v6.3.2.txt']:(root/name).write_text(text)
(root/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
(root/'src/afrr-market.js').write_text(module)
for name in ['dashboard.js','coulomb-beta.js','financial-beta.js']:
 p=root/'src'/name;p.write_text(version(p.read_text()))
with zipfile.ZipFile(root/'BE_dashboard_6_3_1.zip') as old,zipfile.ZipFile(root/'BE_dashboard_6_3_2.zip','w',zipfile.ZIP_DEFLATED) as new:
 for name in old.namelist():
  data=old.read(name)
  if name=='manifest.json':
   manifest=json.loads(data);manifest['version']='6.3.2';data=(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode()
  elif name=='content.js':data=update(data.decode()).encode()
  elif name=='afrr-market.js':data=module.encode()
  new.writestr(name,data)
p=root/'tests/stable-release.cjs';s=p.read_text().replace('6.3.1','6.3.2').replace(r'6\.3\.1\n',r'6\.3\.2\n');p.write_text(s)
assert text.endswith(module)
assert (root/'src/coulomb-beta.js').read_text() in text
print('Built 6.3.2 JS/TXT/metadata/extension, with navigation fix in both runtimes.')
