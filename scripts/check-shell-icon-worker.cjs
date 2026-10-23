// Electron diagnostic: repo assets and Shell namespace only; never attaches to desktop.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

app.whenReady().then(async () => {
  const { queryShellIcons } = require('../dist/main/desktop/shell-icons');
  const { extractShellIconImage } = require('../dist/main/native/win32-icons');
  const requests = [
    { path: '::{645FF040-5081-101B-9F08-00AA002F954E}' },
    { path: path.resolve('src') },
    { path: path.resolve('README.md') },
    { path: path.join(process.env.SystemRoot, 'System32', 'shell32.dll'), resourceIndex: 3 },
    { path: path.resolve('nonexistent-worker-fixture.ico'), resourceIndex: 0, fallbackPath: path.resolve('src') },
  ];
  const expected = requests.map(item => extractShellIconImage(item.path, true, item.resourceIndex)
    ?? (item.fallbackPath ? extractShellIconImage(item.fallbackPath) : null));
  let ticks = 0, maxGapMs = 0, last = performance.now();
  const timer = setInterval(() => { const now = performance.now(); maxGapMs = Math.max(maxGapMs, now-last); last=now; ticks++; }, 20);
  const started = performance.now();
  let actual;
  try { actual = await queryShellIcons(requests); } finally { clearInterval(timer); }
  const elapsedMs = performance.now()-started;
  const sizes = actual.map((raw, index) => {
    assert(raw && expected[index], `Missing artwork ${index}`);
    const image = nativeImage.createFromBitmap(Buffer.from(raw.pixels), { width: raw.width, height: raw.height });
    assert.deepEqual(image.getSize(), expected[index].getSize());
    assert(image.toBitmap().equals(expected[index].toBitmap()), `Worker changed artwork ${index}`);
    return image.getSize();
  });
  assert(ticks > 0, 'Main event loop did not respond during extraction');
  const evidence = { fixtures: sizes.length, identicalPixels: true, sizes, elapsedMs, ticks, maxGapMs };
  const output = process.argv[2] ?? 'logs/icon-worker/check.json';
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence,null,2)); console.log(JSON.stringify(evidence)); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
