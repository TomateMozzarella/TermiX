"""Verified artifact transfer for desktop sessions without outbound sockets.

Only the generated, distributable installer is exported; never credentials or
user data. The normal ZIP artifact remains the primary GitHub download.
"""
import base64, hashlib, json, pathlib
version = json.loads(pathlib.Path('package.json').read_text())['version']
paths = [p for p in pathlib.Path('installer').rglob('*-setup.exe') if p.name.startswith('TermiX_' + version + '_')]
if len(paths) != 1: raise RuntimeError('Expected one current-version installer')
path = paths[0]
data = path.read_bytes()
print('TERMIX_INSTALLER_NAME:' + path.name)
print('TERMIX_INSTALLER_SHA256:' + hashlib.sha256(data).hexdigest())
print('TERMIX_INSTALLER_BEGIN')
encoded = base64.b64encode(data).decode('ascii')
for start in range(0, len(encoded), 10000): print('TERMIX_INSTALLER_DATA:' + encoded[start:start + 10000])
print('TERMIX_INSTALLER_END')
