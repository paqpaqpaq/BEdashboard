"""Audit release packaging without real credentials or network requests."""
from pathlib import Path
import json, re, subprocess, zipfile
root=Path(__file__).resolve().parents[1]
text=(root/'Balansenergie-All-in-v6.4.user.js').read_text()
assert text==(root/'Balansenergie-All-in.user.js').read_text()==(root/'Balansenergie-All-in-v6.4.txt').read_text()
assert re.search(r'^// @version\s+6\.4$',text,re.M)
assert '__beCoulombPage64' in text and '__beCoulombPage633' not in text
assert not re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]",text,re.I)
with zipfile.ZipFile(root/'BE_dashboard_6_3_2.zip') as old,zipfile.ZipFile(root/'BE_dashboard_6_4.zip') as new:
    before=json.loads(old.read('manifest.json'));after=json.loads(new.read('manifest.json'))
    assert after.pop('version')=='6.4';before.pop('version');assert after==before
    for name in ['afrr-extension.js','afrr-background.js','epex.js','epex-bridge.js','epex-background.js']:
        assert new.read(name)==old.read(name),name
    content=new.read('content.js').decode()
    for name in ['voltage-profile.js','coulomb-beta.js','dashboard.js']:
        assert (root/'src'/name).read_text().rstrip() in content,name
    assert 'be-afrr-market-settings-v1' not in content,'credential module must remain isolated'
    assert new.read('afrr-market.js')==(root/'src/afrr-market.js').read_bytes()
    assert not re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]",content,re.I)
for name in ['README.md','CHANGELOG.md','Balansenergie-All-in-v6.3.2.user.js','BE_dashboard_6_3_2.zip']:
    p=root/name
    if p.is_file():assert p.read_bytes()==subprocess.check_output(['git','show','HEAD:'+name],cwd=root),name
print('PASS 6.4 packaging: synchronized downloads, unchanged extension identity/permissions/private storage, source parity, no embedded keys, immutable old release and docs.')
