"""Package 6.5 from the public 6.4.2 baseline, retaining identity and saved keys.

Only current sources, stable install files and the new 6.5 artifacts are written.
Previously published versioned artifacts and extension adapters remain untouched.
"""
from pathlib import Path
import json
import re
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parents[1]
BASELINE = 'b90a8af017cd1d9e51d4c59ef53fb803a4104b9f'
VERSION = '6.5'
SOURCE_NAMES = (
    'bid.js', 'afrr-market.js', 'coulomb-beta.js', 'voltage-profile.js',
    'soc-hover-beta.js', 'financial-beta.js',
)
MAIN_START = '  function dashboardCode() {\n'
MAIN_END = '\n  }\n\n  function launch()'


def previous(name):
    return subprocess.check_output(
        ['git', 'show', BASELINE + ':' + name], cwd=ROOT, text=True,
    )


def version(text):
    # Match the release number, never voltage-curve numbers or older history.
    return re.sub(r'(?<![\d.])6\.4\.2(?!\d|\.\d)', VERSION, text)


def replace_one(text, old, new, label):
    old, new = old.rstrip(), new.rstrip()
    if not old or text.count(old) != 1:
        raise RuntimeError('Ambiguous or missing source module: ' + label)
    return text.replace(old, new, 1)


def metadata_field(text, name):
    values = re.findall(r'^// @' + re.escape(name) + r'\s+(.+)$', text, re.M)
    if len(values) != 1:
        raise RuntimeError('Ambiguous userscript metadata: ' + name)
    return values[0]


def dashboard_source(text):
    if text.count(MAIN_START) != 1 or MAIN_END not in text:
        raise RuntimeError('Dashboard wrapper not found')
    return text.split(MAIN_START, 1)[1].split(MAIN_END, 1)[0] + '\n'


def reject_credentials(text, label):
    if re.search(r"['\"][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}['\"]", text, re.I):
        raise RuntimeError('Unexpected credential-like literal in ' + label)


baseline = previous('Balansenergie-All-in.user.js')
old_sources = {name: previous('src/' + name) for name in SOURCE_NAMES}
sources = {name: (ROOT / 'src' / name).read_text() for name in SOURCE_NAMES}

# Coulomb is a bundled page module. Update its child embeds before changing
# version strings, so standalone sources and the shipped aggregate stay exact.
coulomb = sources['coulomb-beta.js']
for name in ('voltage-profile.js', 'soc-hover-beta.js'):
    if coulomb.count(sources[name].rstrip()) != 1:
        coulomb = replace_one(coulomb, old_sources[name], sources[name],
                              'Coulomb child ' + name)
sources['coulomb-beta.js'] = coulomb
sources = {name: version(source) for name, source in sources.items()}

for name in ('voltage-profile.js', 'soc-hover-beta.js'):
    if sources['coulomb-beta.js'].count(sources[name].rstrip()) != 1:
        raise RuntimeError('Coulomb child embed differs from source: ' + name)
for name in ('coulomb-core-beta.js', 'capacity-settings-beta.js', 'soc-history-beta.js'):
    if (ROOT / 'src' / name).read_text().rstrip() not in sources['coulomb-beta.js']:
        raise RuntimeError('Existing Coulomb child embed differs: ' + name)

text = baseline
for name in ('coulomb-beta.js', 'bid.js', 'afrr-market.js', 'financial-beta.js'):
    text = replace_one(text, old_sources[name], sources[name], name)
text = version(text)

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
reject_credentials(text, 'userscript')

dashboard = dashboard_source(text)
old_dashboard = previous('src/dashboard.js')
metadata = text[:text.index('// ==/UserScript==') + len('// ==/UserScript==')] + '\n'

# The extension has a main dashboard plus separate BID/Coulomb page modules.
# Replacing only the main dashboard would leave stale feature implementations.
with zipfile.ZipFile(ROOT / 'BE_dashboard_6_4_2.zip') as old:
    entries = {name: old.read(name) for name in old.namelist()}
    original_names = old.namelist()
required = {'manifest.json', 'content.js', 'afrr-market.js',
            'afrr-extension.js', 'afrr-background.js'}
if not required.issubset(entries):
    raise RuntimeError('Public extension baseline is incomplete')

manifest = json.loads(entries['manifest.json'])
manifest['version'] = VERSION
if 'version_name' in manifest:
    manifest['version_name'] = version(manifest['version_name'])
entries['manifest.json'] = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode()

content = entries['content.js'].decode()
content = replace_one(content, old_dashboard, dashboard, 'extension dashboard')
for name in ('coulomb-beta.js', 'bid.js'):
    content = replace_one(content, old_sources[name], sources[name],
                          'extension ' + name)
content = version(content)
for name in ('coulomb-beta.js', 'voltage-profile.js', 'soc-hover-beta.js',
             'bid.js', 'financial-beta.js'):
    if content.count(sources[name].rstrip()) != 1:
        raise RuntimeError('Extension source mismatch: ' + name)
if content.count(dashboard.rstrip()) != 1:
    raise RuntimeError('Extension main dashboard differs from userscript')
reject_credentials(content, 'extension content')
entries['content.js'] = content.encode()
entries['afrr-market.js'] = sources['afrr-market.js'].encode()

# All replacements and package integrity checks complete before any writes.
for name, source in sources.items():
    (ROOT / 'src' / name).write_text(source)
(ROOT / 'src/dashboard.js').write_text(dashboard)
for name in ('Balansenergie-All-in.user.js', 'Balansenergie-All-in-v6.5.user.js',
             'Balansenergie-All-in-v6.5.txt'):
    (ROOT / name).write_text(text)
(ROOT / 'Balansenergie-All-in.meta.js').write_text(metadata)
with zipfile.ZipFile(ROOT / 'BE_dashboard_6_5.zip', 'w', zipfile.ZIP_DEFLATED) as new:
    for name in original_names:
        new.writestr(name, entries[name])

print('Built 6.5 JS/TXT/metadata/extension; installed identity, saved key storage, '
      'private adapters and historical releases retained.')
