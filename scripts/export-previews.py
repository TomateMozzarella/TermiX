"""Make mock-IPC UI screenshots readable by the connected desktop review tool."""
import base64, pathlib
for path in sorted(pathlib.Path('ui-previews').glob('*.png')):
    if path.stat().st_size > 512 * 1024: raise RuntimeError('Unexpected preview size')
    data = base64.b64encode(path.read_bytes()).decode('ascii')
    print('TERMIX_PREVIEW_BEGIN:' + path.name)
    for start in range(0, len(data), 10000): print('TERMIX_PREVIEW_DATA:' + data[start:start + 10000])
    print('TERMIX_PREVIEW_END')
