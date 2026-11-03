"""Pure validation of the installer receipt before any release mutation."""
import hashlib, json, pathlib

def verify_installers(directory, version, commit, run_id):
    directory = pathlib.Path(directory)
    manifest_path = directory / 'release-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('schemaVersion') != 1 or manifest.get('commit') != commit or manifest.get('version') != version or manifest.get('runId') != run_id:
        raise RuntimeError('Installer source receipt does not match the verified run')
    if len(manifest.get('files', [])) != 2: raise RuntimeError('Expected EXE and MSI records')
    assets, kinds = [], set()
    for row in manifest['files']:
        name = row['name']
        if pathlib.PurePath(name).name != name or '/' in name or '\\' in name or ('_' + version + '_') not in name:
            raise RuntimeError('Invalid installer name')
        matches = list(directory.rglob(name))
        if len(matches) != 1: raise RuntimeError('Missing or ambiguous installer asset')
        path = matches[0]
        if path.is_symlink() or path.suffix not in ('.exe', '.msi'): raise RuntimeError('Unexpected installer type')
        if path.stat().st_size != row['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
            raise RuntimeError('Installer hash or size differs from the tested receipt')
        kinds.add(path.suffix); assets.append(str(path))
    if kinds != {'.exe', '.msi'}: raise RuntimeError('Both installer types are required')
    checksums = directory / 'SHA256SUMS'
    expected = ''.join(row['sha256'] + '  ' + row['name'] + '\n' for row in manifest['files'])
    if checksums.read_text(encoding='utf-8') != expected: raise RuntimeError('Checksum list differs from receipt')
    return [*assets, str(checksums), str(manifest_path)]
