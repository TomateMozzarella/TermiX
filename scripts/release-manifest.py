"""Create a receipt only after native tests, release packaging and install check."""
import hashlib, json, pathlib, subprocess
root = pathlib.Path('src-tauri/target/release/bundle')
version = json.loads(pathlib.Path('package.json').read_text())['version']
tauri = json.loads(pathlib.Path('src-tauri/tauri.conf.json').read_text())['version']
if version != tauri: raise RuntimeError('Package versions differ')
files = sorted([*root.glob('nsis/*-setup.exe'), *root.glob('msi/*.msi'), *root.glob('portable/*-portable.zip')])
if len(files) != 3: raise RuntimeError('Expected EXE, MSI and portable ZIP')
records = []
for path in files:
    if ('_' + version + '_') not in path.name: raise RuntimeError('Stale installer filename')
    records.append({'name': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size})
manifest = {'schemaVersion': 2, 'version': version, 'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'runId': int(__import__('os').environ['GITHUB_RUN_ID']), 'files': records}
(root / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
(root / 'SHA256SUMS').write_text(''.join(row['sha256'] + '  ' + row['name'] + '\n' for row in records), encoding='utf8')
print('Recorded installer hashes for source commit ' + manifest['commit'])
