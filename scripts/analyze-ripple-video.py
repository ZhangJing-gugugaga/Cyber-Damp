"""Read-only native video diagnostics; does not drive or change the desktop."""
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image, ImageDraw

root = Path('logs/ripple-uat')
ffmpeg = (root / 'ffmpeg-path.txt').read_text(encoding='utf-8-sig').strip()
video = root / 'raw-sale-continuous.mp4'
fps, width, height = 30, 480, 270
command = [ffmpeg, '-v', 'error', '-i', str(video), '-vf', f'fps={fps},scale={width}:{height}:flags=area',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
process = subprocess.Popen(command, stdout=subprocess.PIPE)
frame_bytes = width * height * 3
frames, measurements = [], []
baseline = None
while True:
    data = process.stdout.read(frame_bytes)
    if not data:
        break
    if len(data) != frame_bytes:
        raise RuntimeError('Incomplete decoded video frame')
    frame = np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3).copy()
    patch = frame[88:122, 312:375].astype(np.int16)
    if baseline is None:
        baseline = patch.copy()
    hud = frame[5:22, 188:292]
    measurements.append({'time': len(frames) / fps,
                         'backgroundDifference': float(np.abs(patch - baseline).mean()),
                         'whiteFraction': float((frame.min(axis=2) > 245).mean()),
                         'blackFraction': float((frame.max(axis=2) < 10).mean()),
                         'hudDarkFraction': float((hud.max(axis=2) < 90).mean())})
    frames.append(frame)
assert process.wait() == 0
# Low-amplitude unrelated motion (cursor/hover/roaming snails) can cross this
# patch. Keep the measured threshold explicit; native snapshots prove the wave.
active = [p for p in measurements if p['backgroundDifference'] > 5]
assert active, 'No wallpaper ripple observed in the native video'
onset = active[0]['time']
contacts = Image.new('RGB', (width * 5, (height + 22) * 3), '#111111')
draw = ImageDraw.Draw(contacts)
for i in range(15):
    when = max(0, onset - 0.3 + i * 0.12)
    index = min(len(frames) - 1, round(when * fps))
    x, y = (i % 5) * width, (i // 5) * (height + 22)
    contacts.paste(Image.fromarray(frames[index]), (x, y + 22))
    draw.text((x + 5, y + 4), f'{index / fps:.3f}s', fill='white')
contacts.save(root / 'continuous-onset-contact.png')
summary = {'decodedFramesAt30fps': len(frames), 'nominalVideoSeconds': len(frames) / fps,
           'backgroundDifferenceThreshold': 5,
           'firstVisibleWallpaperChangeSeconds': onset,
           'lastVisibleWallpaperChangeSeconds': active[-1]['time'],
           'visibleChangeSpanSeconds': active[-1]['time'] - onset,
           'minimumHudDarkFraction': min(p['hudDarkFraction'] for p in measurements),
           'nearWhiteFlashFrames': sum(p['whiteFraction'] > 0.95 for p in measurements),
           'nearBlackFlashFrames': sum(p['blackFraction'] > 0.95 for p in measurements),
           'finalWallpaperDifference': measurements[-1]['backgroundDifference'],
           'note': 'Visible thresholds omit faint fade frames. Resampled video is not exact trigger/stop timing; unrelated low-amplitude motion is excluded.'}
(root / 'continuous-frame-metrics.json').write_text(json.dumps(measurements, indent=2), encoding='utf-8')
(root / 'continuous-video-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary))
