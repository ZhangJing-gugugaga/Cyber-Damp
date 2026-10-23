"""Pack existing original GIF frames for Pixi; no repainting or new artwork.

Run manually when reference files change. Source/rights are recorded separately
in src/renderer/assets/PVZ-PROVENANCE.json. Pillow is a development tool only.
"""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parent.parent
source = root / 'previews/pvz-original-reference'
output = root / 'src/renderer/assets'
manifest = {}
for key, name in [('shy', 'ScaredyShroom.gif'), ('lava', 'DoomShroom.gif')]:
    image = Image.open(source / name)
    frames = [frame.convert('RGBA').copy() for frame in ImageSequence.Iterator(image)]
    durations = []
    for index in range(image.n_frames):
        image.seek(index)
        durations.append(max(20, image.info.get('duration', 100)))
    boxes = [frame.getchannel('A').getbbox() for frame in frames]
    bounds = (min(b[0] for b in boxes), min(b[1] for b in boxes),
              max(b[2] for b in boxes), max(b[3] for b in boxes))
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    columns, padding = 5, 2  # Prevent bilinear sampling of adjacent frame rows.
    atlas = Image.new('RGBA', (columns * (width + 2 * padding),
                              math.ceil(len(frames) / columns) * (height + 2 * padding)))
    for index, frame in enumerate(frames):
        packed = frame.crop(bounds)
        x, y = index % columns * (width + 2 * padding) + padding, index // columns * (height + 2 * padding) + padding
        atlas.paste(packed, (x, y))
        assert atlas.crop((x, y, x + width, y + height)).tobytes() == packed.tobytes()
    target = output / f'pvz-{key}-frames.png'
    atlas.save(target)
    manifest[key] = dict(width=width, height=height, columns=columns, padding=padding,
                         durations=durations, source=name, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
Image.open(source / 'Shovel.gif').convert('RGBA').save(output / 'pvz-shovel.png')
(output / 'pvz-frames.ts').write_text(
    '// Original GIF frames decoded and packed without repainting; see PVZ-PROVENANCE.json.\n'
    'export const PVZ_FRAMES = ' + json.dumps(manifest) + ' as const;\n', encoding='utf-8')
provenance = output / 'PVZ-PROVENANCE.json'
record = json.loads(provenance.read_text(encoding='utf-8'))
record['assets'] = manifest
record['operation'] = 'Original GIF frames decoded to RGBA, common transparent margins trimmed, fixed cells with 2px transparent gutters; frame timing preserved, no repainting.'
provenance.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Packed and pixel-verified', sum(len(m['durations']) for m in manifest.values()), 'original frames')
