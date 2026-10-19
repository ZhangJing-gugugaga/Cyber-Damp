const { app, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { scanDesktop, desktopRoots, isDesktopPath } = require('../dist/main/desktop/desktop-scan');

app.whenReady().then(async () => {
  const entries = await scanDesktop();
  const expected = new Set();
  for (const root of desktopRoots()) {
    const ds = await fs.readdir(root, {withFileTypes:true}).catch(() => []);
    for (const d of ds) if ((d.isDirectory() || d.isFile()) && !['desktop.ini','thumbs.db','.ds_store'].includes(d.name.toLowerCase()) && !d.name.startsWith('$')) expected.add(d.name.toLowerCase());
    assert.equal(isDesktopPath(path.join(root,'safe.txt')),true);
    assert.equal(isDesktopPath(root),false);
    assert.equal(isDesktopPath(path.join(root,'..','outside.txt')),false);
  }
  assert.equal(entries.length, expected.size + 1);
  assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
  for (const entry of entries) {
    const image = nativeImage.createFromDataURL(entry.iconDataUrl);
    assert.equal(image.isEmpty(),false,entry.name);
    assert.equal(image.getSize().width,64,entry.name);
    assert.ok(image.toBitmap().some((b,i)=>i%4===3 && b>0),entry.name);
  }
  assert.ok(new Set(entries.map(e=>e.iconDataUrl)).size > entries.length / 2, 'Shell artwork must not collapse into a single fallback');
  console.log(JSON.stringify({pass:true,entries:entries.length,uniqueIcons:new Set(entries.map(e=>e.iconDataUrl)).size,roots:desktopRoots().length}));
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
