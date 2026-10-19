// Read-only Windows integration: system-selected wallpaper, no desktop takeover.
const { app } = require('electron');
const fs = require('node:fs');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  const { readDesktopWallpaper } = require('../dist/main/native/win32-wallpaper');
  const w = await readDesktopWallpaper();
  assert.ok(w, 'IDesktopWallpaper unavailable');
  assert.ok(w.monitor.width > 0 && w.monitor.height > 0);
  assert.ok(w.workArea.width > 0 && w.scaleFactor > 0);
  assert.match(w.backgroundColor, /^#[0-9a-f]{6}$/);
  if (w.imageDataUrl) assert.ok(w.imageWidth > 0 && w.imageHeight > 0);
  const { imageDataUrl, ...metadata } = w;
  const result = { ...metadata, imageBytes: imageDataUrl?.length ?? 0, pass: true };
  fs.mkdirSync('logs/ripple-uat', { recursive: true });
  fs.writeFileSync('logs/ripple-uat/wallpaper-native.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
