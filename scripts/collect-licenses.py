"""Collect the pinned native dependency notices into the Windows package."""
import os, pathlib
registry = pathlib.Path(os.environ['CARGO_HOME']) / 'registry' / 'src'
output = pathlib.Path('src-tauri/windows/generated/THIRD_PARTY_LICENSES.txt')
output.parent.mkdir(parents=True, exist_ok=True)
parts = ['TermiX native dependency notices\nSources and exact versions: Cargo.lock\n']
for package in ['ssh2', 'libssh2-sys', 'openssl-src', 'zeroize', 'sha2', 'base64']:
    roots = sorted(p for index in registry.iterdir() for p in index.glob(package + '-*') if p.is_dir())
    if not roots: raise RuntimeError('Missing downloaded license source: ' + package)
    for root in roots:
        found = []
        for name in ['LICENSE', 'LICENSE.txt', 'LICENSE-MIT', 'LICENSE-APACHE', 'LICENSE-APACHE2', 'COPYING', 'libssh2/COPYING', 'openssl/LICENSE.txt', 'openssl/NOTICE']:
            path = root / name
            if path.is_file(): found.append(path)
        if not found: raise RuntimeError('No license file found for ' + root.name)
        for path in found: parts.append('\n=== ' + root.name + '/' + str(path.relative_to(root)) + ' ===\n' + path.read_text(encoding='utf8', errors='replace'))
for name in ['monaco-editor/LICENSE', 'monaco-editor/ThirdPartyNotices.txt']:
    notice = pathlib.Path('node_modules') / name
    if not notice.is_file(): raise RuntimeError('Missing editor license: ' + name)
    parts.append('\\n=== ' + name + ' ===\\n' + notice.read_text(encoding='utf8'))
output.write_text('\n'.join(parts), encoding='utf8')
