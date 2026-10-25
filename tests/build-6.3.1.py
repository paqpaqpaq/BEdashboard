"""Build 6.3.1 from immutable 6.3; preserve private settings identity."""
from pathlib import Path
import json,re,zipfile
root=Path(__file__).resolve().parents[1]
baseline=(root/'Balansenergie-All-in-v6.3.user.js').read_text()
old_dashboard=baseline.split('  function dashboardCode() {\n',1)[1].split('\n  }\n\n  function launch()',1)[0]
old_module=baseline[baseline.index('/* Regelvermogen & biedingen — 6.3.'):]
version=lambda text:re.sub(r'6\.3(?!\.\d|\d)','6.3.1',text)
module=version((root/'src/afrr-market.js').read_text())
dashboard=version((root/'src/dashboard.js').read_text().rstrip())
def update(text):
 assert text.count(old_dashboard)==1
 return version(text.replace(old_dashboard,dashboard,1)).replace('__beCoulombPage63','__beCoulombPage631')
text=update(baseline.replace(old_module,module,1))
for name in ['Balansenergie-All-in.user.js','Balansenergie-All-in-v6.3.1.user.js','Balansenergie-All-in-v6.3.1.txt']:(root/name).write_text(text)
(root/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
(root/'src/dashboard.js').write_text(dashboard+'\n')
(root/'src/afrr-market.js').write_text(module)
for name in ['coulomb-beta.js','financial-beta.js']:
 p=root/'src'/name;p.write_text(version(p.read_text()))
with zipfile.ZipFile(root/'BE_dashboard_6_3.zip') as old,zipfile.ZipFile(root/'BE_dashboard_6_3_1.zip','w',zipfile.ZIP_DEFLATED) as new:
 for name in old.namelist():
  data=old.read(name)
  if name=='manifest.json':
   m=json.loads(data);m['version']='6.3.1';data=(json.dumps(m,indent=2,ensure_ascii=False)+'\n').encode()
  elif name=='content.js':data=update(data.decode()).encode()
  elif name=='afrr-market.js':data=module.encode()
  new.writestr(name,data)
p=root/'tests/stable-release.cjs';s=p.read_text().replace('6.3.user','6.3.1.user').replace('6.3.txt','6.3.1.txt').replace(r'6\.3\n',r'6\.3\.1\n');p.write_text(s)
assert (root/'src/coulomb-beta.js').read_text() in text
assert (root/'src/financial-beta.js').read_text().rstrip() in dashboard
print('Built synchronized 6.3.1 JS/TXT/metadata/extension; settings and key identities preserved.')
