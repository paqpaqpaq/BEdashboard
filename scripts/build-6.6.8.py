"""Package 6.6.8 from current sources and the immutable public 6.6.7 release.

The edited dashboard is authoritative; never regenerate it from the old bundle.
Only current source versions, stable install files and new 6.6.8 artifacts change.
"""
from pathlib import Path
import json
import re
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parents[1]
BASELINE = '70a58e999ec1351064b5e2d8eed5f5c3a136b791'
VERSION = '6.6.8'
SOURCE_NAMES = (
    'dashboard.js', 'financial-beta.js', 'bid.js', 'afrr-market.js',
    'coulomb-beta.js', 'voltage-profile.js', 'soc-hover-beta.js', 'epex.js',
)
MAIN_START = '  function dashboardCode() {\n'
MAIN_END = '\n  }\n\n  function launch()'


def previous(name):
    return subprocess.check_output(
        ['git', 'show', BASELINE + ':' + name], cwd=ROOT, text=True,
    )


def version(text):
    # Match only the previous release number; leave numeric SVG geometry untouched.
    return re.sub(r'(?<![\d.])6\.6\.7(?![A-Za-z0-9_]|\.\d)', VERSION, text)


def replace_one(text, old, new, label):
    old, new = old.rstrip(), new.rstrip()
    if not old or text.count(old) != 1:
        raise RuntimeError('Ambiguous or missing source module: ' + label)
    return text.replace(old, new, 1)


def sync_child(aggregate, old, current, label):
    if aggregate.count(current.rstrip()) == 1:
        return aggregate
    return replace_one(aggregate, old, current, label)


def metadata_field(text, name):
    values = re.findall(r'^// @' + re.escape(name) + r'\s+(.+)$', text, re.M)
    if len(values) != 1:
        raise RuntimeError('Ambiguous userscript metadata: ' + name)
    return values[0]


def dashboard_source(text):
    if text.count(MAIN_START) != 1 or MAIN_END not in text:
        raise RuntimeError('Dashboard wrapper not found')
    return text.split(MAIN_START, 1)[1].split(MAIN_END, 1)[0] + '\n'


EPEX_START = "(function () {\n  'use strict';\n  const ID='be-epex-addon'"


def epex_module(text):
    # Older releases contain inline EPEX fixes absent from their loose source.
    # Match the actual published module, not the stale src/epex.js snapshot.
    if text.count(EPEX_START) != 1:
        raise RuntimeError('Ambiguous or missing published EPEX provider')
    start = text.index(EPEX_START)
    end = text.index('\n})();', start) + len('\n})();')
    return text[start:end]


def extension_epex(source, previous_source):
    bridge_start = source.index('  function chartBridge(){')
    inject_start = source.index("  const bridge=document.createElement('script');", bridge_start)
    inject_end = source.index('\n', inject_start)
    bridge = source[bridge_start:inject_start].strip()
    old_module = epex_module(previous_source)
    old_injection = next(line for line in old_module.splitlines()
                         if "bridge.src=chrome.runtime.getURL('epex-bridge.js')" in line)
    provider = source[:bridge_start] + old_injection + source[inject_end:]
    # Preserve the isolated chrome.runtime network adapter byte for byte.
    provider = replace_one(previous_source, old_module, provider, 'extension EPEX provider')
    return provider, '(' + bridge + ')();\n'


def reject_credentials(text, label):
    if re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]", text, re.I):
        raise RuntimeError('Unexpected credential-like literal in ' + label)


baseline = previous('Balansenergie-All-in.user.js')
old_epex = epex_module(baseline)
old_sources = {name: previous('src/' + name) for name in SOURCE_NAMES}
sources = {name: version((ROOT / 'src' / name).read_text())
           for name in SOURCE_NAMES}

# Retain every current dashboard/Coulomb edit, including inline BESOCExtras.
# Update the financial child only when
# it still embeds the exact previous child. Unknown divergence aborts the build.
sources['dashboard.js'] = sync_child(
    sources['dashboard.js'], version(old_sources['financial-beta.js']),
    sources['financial-beta.js'], 'dashboard financial module',
)
for name in ('voltage-profile.js', 'soc-hover-beta.js'):
    sources['coulomb-beta.js'] = sync_child(
        sources['coulomb-beta.js'], version(old_sources[name]), sources[name],
        'Coulomb child ' + name,
    )
for name in ('coulomb-core-beta.js', 'capacity-settings-beta.js', 'soc-history-beta.js'):
    if (ROOT / 'src' / name).read_text().rstrip() not in sources['coulomb-beta.js']:
        raise RuntimeError('Existing Coulomb child embed differs: ' + name)
sources['dashboard.js'] = sources['dashboard.js'].rstrip() + '\n'

# Replace the complete dashboard first. Updating its old child modules alone
# would silently discard changes to pricing and provisional result calculation.
text = replace_one(baseline, old_sources['dashboard.js'],
                   sources['dashboard.js'], 'complete current dashboard')
for name in ('coulomb-beta.js', 'bid.js', 'afrr-market.js'):
    text = replace_one(text, old_sources[name], sources[name], name)
text = replace_one(text, old_epex, sources['epex.js'], 'published EPEX provider')
text = version(text)
connect = '// @connect      dataportal-api.nordpoolgroup.com'
if connect not in text:
    text = text.replace('// @connect      public.api.energyzero.nl',
                        '// @connect      public.api.energyzero.nl\n' + connect, 1)
if connect not in text:
    raise RuntimeError('Nord Pool userscript permission missing')

for name in ('name', 'namespace', 'updateURL', 'downloadURL'):
    if metadata_field(text, name) != metadata_field(baseline, name):
        raise RuntimeError('Installed userscript identity changed: ' + name)
if metadata_field(text, 'name') != 'Balansenergie All-in':
    raise RuntimeError('Permanent userscript name changed')
if metadata_field(text, 'namespace') != 'paq.balansenergie':
    raise RuntimeError('Permanent userscript namespace changed')
if metadata_field(text, 'version') != VERSION:
    raise RuntimeError('Userscript version did not update')
for key in ('be-afrr-market-settings-v1', 'be_tennet_connection_v1'):
    if key not in sources['afrr-market.js']:
        raise RuntimeError('Saved TenneT key storage identifier missing: ' + key)
for name, source in sources.items():
    if text.count(source.rstrip()) != 1:
        raise RuntimeError('Shipped userscript source mismatch: ' + name)
if dashboard_source(text) != sources['dashboard.js']:
    raise RuntimeError('Current dashboard source was not preserved')
reject_credentials(text, 'userscript')
metadata = text[:text.index('// ==/UserScript==') + len('// ==/UserScript==')] + '\n'

with zipfile.ZipFile(ROOT / 'BE_dashboard_6_6_7.zip') as old:
    entries = {name: old.read(name) for name in old.namelist()}
    original_names = old.namelist()
required = {'manifest.json', 'content.js', 'afrr-market.js',
            'afrr-extension.js', 'afrr-background.js', 'epex.js',
            'epex-bridge.js', 'epex-background.js'}
if not required.issubset(entries):
    raise RuntimeError('Public extension baseline is incomplete')
manifest = json.loads(entries['manifest.json'])
manifest['version'] = VERSION
nordpool_host = 'https://dataportal-api.nordpoolgroup.com/*'
if nordpool_host not in manifest.setdefault('host_permissions', []):
    manifest['host_permissions'].append(nordpool_host)
if 'version_name' in manifest:
    manifest['version_name'] = version(manifest['version_name'])
entries['manifest.json'] = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode()

content = replace_one(entries['content.js'].decode(), old_sources['dashboard.js'],
                      sources['dashboard.js'], 'extension complete dashboard')
for name in ('coulomb-beta.js', 'bid.js'):
    content = replace_one(content, old_sources[name], sources[name],
                          'extension ' + name)
content = version(content)
for name in ('dashboard.js', 'financial-beta.js', 'coulomb-beta.js',
             'voltage-profile.js', 'soc-hover-beta.js', 'bid.js'):
    if content.count(sources[name].rstrip()) != 1:
        raise RuntimeError('Extension source mismatch: ' + name)
reject_credentials(content, 'extension content')
entries['content.js'] = content.encode()
entries['afrr-market.js'] = sources['afrr-market.js'].encode()
epex_provider, epex_bridge = extension_epex(sources['epex.js'], entries['epex.js'].decode())
reject_credentials(epex_provider, 'extension EPEX provider')
reject_credentials(epex_bridge, 'extension EPEX bridge')
entries['epex.js'] = epex_provider.encode()
entries['epex-bridge.js'] = epex_bridge.encode()
entries['epex-background.js'] = (ROOT / 'src/epex-background.js').read_bytes()

# No source/package mutation occurs until all replacements are unambiguous.
# Unchanged archive entries, including the private TenneT adapter, retain their bytes.
for name, source in sources.items():
    (ROOT / 'src' / name).write_text(source)
for name in ('Balansenergie-All-in.user.js', 'Balansenergie-All-in-v6.6.8.user.js',
             'Balansenergie-All-in-v6.6.8.txt'):
    (ROOT / name).write_text(text)
(ROOT / 'Balansenergie-All-in.meta.js').write_text(metadata)
with zipfile.ZipFile(ROOT / 'BE_dashboard_6_6_8.zip', 'w', zipfile.ZIP_DEFLATED) as new:
    for name in original_names:
        new.writestr(name, entries[name])

print('Built 6.6.8 JS/TXT/metadata/extension from current dashboard sources; '
      'installed identity, saved key storage and private adapters retained.')
