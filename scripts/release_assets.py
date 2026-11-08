"""Pure validation of the installer receipt before any release mutation."""
import hashlib, json, pathlib

def verify_installers(directory, version, commit, run_id):
    directory = pathlib.Path(directory)
    manifest_path = directory / 'release-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('schemaVersion') not in (1,2) or manifest.get('commit') != commit or manifest.get('version') != version or manifest.get('runId') != run_id:
        raise RuntimeError('Installer source receipt does not match the verified run')
    expected_kinds={'.exe','.msi','.zip'} if manifest['schemaVersion']==2 else {'.exe','.msi'}
    if len(manifest.get('files', [])) != len(expected_kinds): raise RuntimeError('Unexpected asset count')
    assets, kinds = [], set()
    for row in manifest['files']:
        name = row['name']
        if pathlib.PurePath(name).name != name or '/' in name or '\\' in name or ('_' + version + '_') not in name:
            raise RuntimeError('Invalid installer name')
        matches = list(directory.rglob(name))
        if len(matches) != 1: raise RuntimeError('Missing or ambiguous installer asset')
        path = matches[0]
        if path.is_symlink() or path.suffix not in expected_kinds: raise RuntimeError('Unexpected installer type')
        if path.stat().st_size != row['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
            raise RuntimeError('Installer hash or size differs from the tested receipt')
        if path.suffix == '.zip':
            import zipfile
            if name != 'TermiX_' + version + '_x64-portable.zip': raise RuntimeError('Unexpected portable filename')
            with zipfile.ZipFile(path) as archive:
                if set(archive.namelist()) != {'TermiX.exe','portable.flag','README.txt','termix-v3.ico','THIRD_PARTY_LICENSES.txt'}: raise RuntimeError('Unexpected portable files or included user data')
        kinds.add(path.suffix); assets.append(str(path))
    if kinds != expected_kinds: raise RuntimeError('Both installer types are required')
    checksums = directory / 'SHA256SUMS'
    expected = ''.join(row['sha256'] + '  ' + row['name'] + '\n' for row in manifest['files'])
    if checksums.read_text(encoding='utf-8') != expected: raise RuntimeError('Checksum list differs from receipt')
    return [*assets, str(checksums), str(manifest_path)]
