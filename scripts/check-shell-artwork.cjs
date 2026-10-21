// Read-only artwork audit. Never opens desktop files or attaches an overlay.
const { app } = require('electron');
const fs = require('node:fs');
const { queryShellLayout } = require('../dist/main/desktop/shell-layout');
const { extractShellIconImage } = require('../dist/main/native/win32-icons');
app.whenReady().then(async () => {
  const { view } = await queryShellLayout();
  const results = view.items.map((item, index) => {
    const image = extractShellIconImage(item.parsingName);
    if (!image) return { index, error: 'No artwork' };
    const { width, height } = image.getSize();
    const bytes = image.toBitmap();
    let left = width, top = height, right = -1, bottom = -1, visible = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (bytes[(y * width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y); visible++;
    }
    return { index, width, height, left, top, right, bottom, visible,
      artworkFraction: Math.max(right - left + 1, bottom - top + 1) / width };
  });
  fs.mkdirSync('logs/mildew-native/artwork', { recursive: true });
  const target = process.argv[2] || 'audit';
  fs.writeFileSync(`logs/mildew-native/artwork/${target}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
