"""Build 6.3 from immutable 6.2.1; private TenneT module stays isolated."""
from pathlib import Path
import json,re,zipfile
root=Path(__file__).resolve().parents[1]
baseline=(root/'Balansenergie-All-in-v6.2.1.user.js').read_text()
start=baseline.index('/* BE-only energy balance.')
old_soc=baseline[start:baseline.index('\n\n\n  }\n  function start()',start)]
version=lambda text:re.sub(r'6\.2\.1(?!\d)','6.3',text)
soc=version((root/'src/coulomb-beta.js').read_text())
assert (root/'src/coulomb-core-beta.js').read_text().rstrip() in soc
for module in ['soc-hover-beta.js','soc-history-beta.js']:
 assert (root/'src'/module).read_text() in soc
module=(root/'src/afrr-market.js').read_text()
assert not re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]",module,re.I),'Embedded UUID credential'
def update(text):
 assert text.count(old_soc)==1
 return version(text.replace(old_soc,soc,1)).replace('__beCoulombPage621','__beCoulombPage63')
text=update(baseline)
extra=''.join('// @grant        '+name+'\n' for name in ['GM_getValue','GM_setValue','GM_deleteValue','GM.getValue','GM.setValue','GM.deleteValue'])
text=text.replace('// @connect      public.api.energyzero.nl',extra+'// @connect      api.tennet.eu\n// @connect      api.acc.tennet.eu\n// @connect      public.api.energyzero.nl',1)
text=text.replace('BID-historie, EPEX, darkmode','BID-historie, TenneT-regelvermogen, EPEX, darkmode',1)
text=text.rstrip()+'\n\n'+module
for name in ['Balansenergie-All-in.user.js','Balansenergie-All-in-v6.3.user.js','Balansenergie-All-in-v6.3.txt']:(root/name).write_text(text)
(root/'Balansenergie-All-in.meta.js').write_text(text[:text.index('// ==/UserScript==')+len('// ==/UserScript==')]+'\n')
(root/'src/dashboard.js').write_text(text.split('  function dashboardCode() {\n',1)[1].split('\n  }\n\n  function launch()',1)[0]+'\n')
(root/'src/coulomb-beta.js').write_text(soc)
financial=root/'src/financial-beta.js';financial.write_text(version(financial.read_text()))
with zipfile.ZipFile(root/'BE_dashboard_6_2_1.zip') as old,zipfile.ZipFile(root/'BE_dashboard_6_3.zip','w',zipfile.ZIP_DEFLATED) as new:
 for name in old.namelist():
  data=old.read(name)
  if name=='manifest.json':
   m=json.loads(data);m['version']='6.3';m['description']='All-in dashboard met Financieel, Coulombtelling, BID-historie, TenneT-regelvermogen met eigen API-sleutel en kwartierdata.'
   m['permissions']=list(dict.fromkeys(m['permissions']+['storage']))
   m['host_permissions']+=['https://api.tennet.eu/*','https://api.acc.tennet.eu/*']
   m['content_scripts'].append({'matches':['https://dashboard.balansenergie.nl/*'],'js':['afrr-extension.js','afrr-market.js'],'run_at':'document_idle'})
   data=(json.dumps(m,indent=2,ensure_ascii=False)+'\n').encode()
  elif name=='content.js':data=update(data.decode()).encode()
  elif name=='epex-background.js':data+=b"\nimportScripts('afrr-background.js');\n"
  new.writestr(name,data)
 for name in ['afrr-extension.js','afrr-background.js','afrr-market.js']:new.writestr(name,(root/'src'/name).read_bytes())
print('Built 6.3 userscript, TXT, metadata and extension; README/changelog untouched.')
