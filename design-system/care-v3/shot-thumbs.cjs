/** 缩略图总览截图：electron design-system/care-v3/shot-thumbs.cjs → shots/thumbs.png */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'cd-v3-thumbs-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1536, height: 900, useContentSize: true, frame: false, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, 'thumbs.html'));
  await new Promise((r) => setTimeout(r, 2600));
  const h = await win.webContents.executeJavaScript('document.body.scrollHeight');
  win.setContentSize(1536, h);
  await new Promise((r) => setTimeout(r, 600));
  fs.writeFileSync(path.join(__dirname, 'shots', 'thumbs.png'), (await win.webContents.capturePage()).toPNG());
  console.log('thumbs saved', h);
  app.exit(0);
});
