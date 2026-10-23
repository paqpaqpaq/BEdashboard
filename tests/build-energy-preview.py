"""Build review files without changing the published version or stable downloads."""
from pathlib import Path
import os,re,zipfile
root=Path(__file__).resolve().parents[1]
preview=root/'previews';preview.mkdir(exist_ok=True)
base=(root/'Balansenergie-All-in.user.js').read_text()
version=re.search(r'@version\s+(\S+)',base).group(1)
a=base.index('/* BE-only energy balance.');old=base[a:base.index('\n\n\n  }\n  function start()',a)]
soc=(root/'src/coulomb-beta.js').read_text();assert (root/'src/soc-hover-beta.js').read_text() in soc
assert base.count(old)==1
full=base.replace(old,soc,1)
(preview/'Balansenergie-All-in-chemische-inhoud.user.js').write_text(full)
with zipfile.ZipFile(root/('BE_dashboard_'+version.replace('.','_')+'.zip')) as z,zipfile.ZipFile(preview/'BE_dashboard_chemische_inhoud.zip','w',zipfile.ZIP_DEFLATED) as out:
 for name in z.namelist():
  data=z.read(name)
  if name=='content.js':
   text=data.decode();assert text.count(old)==1;data=text.replace(old,soc,1).encode()
  out.writestr(name,data)
chart=Path(os.environ.get('BE_CHART_JS',root.parent/'afrr-bid-local/chart.umd.js')).read_text()
theme=(root/'src/dark-theme.js').read_text()
hook='''
  cfg={capacityMode:'kwh',capacityKwh:48.2};
  const previewNow=window.BEPreviewNow,previewStart=previewNow-6*3600000;
  record={rows:Array.from({length:73},(_,i)=>[previewStart+i*300000,82-18*i/72,1060.4]),manual:[{t:previewStart,soc:80,kind:'Voorbeeld'}]};
  window.BEEnergyPreview={setCapacity(value){cfg={capacityMode:'kwh',capacityKwh:value};compute();render();},render};
  register();compute();render();return;
'''
assert soc.count('  register();compute();render();')==1
instrumented=soc.replace('  register();compute();render();',hook,1).replace('location.pathname', "'/customer/demo/history/'")
header='''<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOC — chemische inhoud</title>
<style>body{margin:0;font:14px system-ui,sans-serif;background:#faf8fb;color:#51445f}main{max-width:900px;margin:auto;padding:20px;box-sizing:border-box}h1{font-size:22px}.card{padding:16px;border:1px solid #d9d3df;border-radius:12px;background:#fff}.history-chart-soc-header{display:flex;gap:24px;margin-bottom:12px}.history-chart-soc-label{display:inline-flex;align-items:center;gap:8px;font:600 14px system-ui}.history-chart-soc-label::before{content:"";width:9px;height:9px;border-radius:50%;background:#69318d}.frame{height:240px;position:relative}nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}nav button{font:inherit;padding:8px 12px;border:1px solid #b8abc4;border-radius:6px;background:#fff;color:inherit}@media(max-width:480px){main{padding:12px}.card{padding:10px}.frame{height:220px}}</style>
<main><h1>SOC en chemische inhoud</h1><nav><button onclick="BETheme.apply(false)">Licht</button><button onclick="BETheme.apply(true,'bruingrijs')">Bruingrijs</button><button onclick="BETheme.apply(true,'grafiet')">Grafiet</button></nav><section class="card history-chart-soc-row"><div class="history-chart-soc-header"><span class="history-chart-soc-label">SOC</span></div><div class="frame"><canvas id="soc-chart"></canvas></div></section></main>
'''
setup='''const previewNow=Date.now();window.BEPreviewNow=previewNow;
window.previewChart=new Chart(document.getElementById('soc-chart'),{type:'line',data:{datasets:[{label:'SOC',borderColor:'#69318d',pointRadius:0,borderWidth:2,data:Array.from({length:73},(_,i)=>({x:previewNow-6*3600000+i*300000,y:82-18*i/72}))}]},options:{animation:false,responsive:true,maintainAspectRatio:false,parsing:false,plugins:{legend:{display:false}},scales:{x:{type:'linear',ticks:{maxTicksLimit:5,callback:value=>new Date(value).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}},y:{min:0,max:100}}}});
'''
def script(code):return '<script>'+code.replace('</script','<\\/script')+'</script>\n'
html=header+script(chart)+script(theme)+script(setup)+script(instrumented)+'</html>'
(preview/'soc-chemische-inhoud.html').write_text(html)
print('Built userscript, extension ZIP and self-contained UI preview from current source; stable downloads unchanged.')
