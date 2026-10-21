from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import time

root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
    def do_GET(self):
        path=self.path.split('?')[0]
        if path in ['/chart.umd.js','/series-theme-test.js']:
            if path=='/chart.umd.js':
                data=(root.parent/'afrr-bid-local/chart.umd.js').read_bytes()
            else:
                soc=(root/'src/coulomb-beta.js').read_text()
                bid=(root/'src/bid.js').read_text()
                source="let cfg={},key='test';function render(){};\n"
                source+=soc[soc.index('  function dataset('):soc.index('  function forecastValues(')]
                source+=soc[soc.index('  function filterNativeLegend('):soc.index('  function render(){')]
                source+="\nconst directions=['import','export'],colours={import:'#b65c72',export:'#73b9a1'};\n"
                source+=bid[bid.index('    function bidColour('):bid.index('    const bids =')]
                source+="\nfunction read(){return null;}function points(direction){return [0,1,2,3,4].map(x=>({x,y:direction==='import'?.4:.2}));}\n"
                source+=bid[bid.index('    const plugin ='):bid.index('    function ensureUI()')]
                source+='\nwindow.seriesTest={dataset,legend,bidPlugin:plugin};'
                data=source.encode()
            self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
        if path=='/financial-theme-test.js':
            source=(root/'src/financial-beta.js').read_text()
            source=source[:source.index('    // Een link blijft beschikbaar')]
            source=source.replace('      settingsUI(); updateFilters(); theme();','      theme();')
            source+='''
    mount();root.hidden=false;
    window.__financialTheme={root:root,shadow:shadow,theme:theme};
    document.addEventListener('be-dark-change',theme);
  }
  beOverzichtStart();
'''
            source='''var LEV_DAG=.2,TRA_DAG=1.3,cfg={start:new Date('2025-11-04T12:00:00Z')},KLANT='demo',beDarkOn=BETheme.isDark();
function iso(d){return d.toISOString().slice(0,10);}
function beDarkApply(on){BETheme.apply(on);beDarkOn=BETheme.isDark();}
'''+source
            data=source.encode()
            self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
        if path=='/slow-theme-test.js':
            time.sleep(.8);self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(b'/* delayed native startup */');return
        super().do_GET()
    def log_message(self,*args):pass
print('http://127.0.0.1:8917/tests/dark-theme-browser.html',flush=True)
ThreadingHTTPServer(('127.0.0.1',8917),Handler).serve_forever()
