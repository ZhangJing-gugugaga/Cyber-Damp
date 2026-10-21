// Rasterize the repository-owned vector using Chromium, including transparent ICO.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../src/renderer/public/brand/rain-mushroom.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL('about:blank');
  const result = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
    await img.decode(); const c = document.createElement('canvas'); c.width=c.height=256;
    c.getContext('2d').drawImage(img,0,0,256,256); return c.toDataURL('image/png').split(',')[1];
  })()`);
  const png = Buffer.from(result, 'base64');
  const dir = path.join(__dirname, '../src/renderer/public/brand');
  fs.writeFileSync(path.join(dir, 'rain-mushroom.png'), png);
  const header = Buffer.alloc(22); header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
  header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);
  header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  fs.writeFileSync(path.join(dir, 'rain-mushroom.ico'), Buffer.concat([header,png]));
  win.destroy(); app.quit();
}).catch(error => {console.error(error);app.exit(1)});
