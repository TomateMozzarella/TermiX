"""Encode captured production-UI frames; no private account data is used."""
from pathlib import Path
from PIL import Image
frames=[Image.open(p).convert('RGB').resize((960,600)).quantize(colors=128) for p in sorted(Path('docs/media/frames').glob('*.png'))]
if not frames: raise RuntimeError('Capture frames first')
durations=[160]*len(frames)
for index in (0,6,len(frames)-1): durations[index]=1800
frames[0].save('docs/media/walkthrough.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,optimize=True)
