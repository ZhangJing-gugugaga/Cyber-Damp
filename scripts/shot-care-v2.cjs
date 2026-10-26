/** 截取模拟环境 UI 截图（交付证据）：护理台 + 墙面页 + 图鉴。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { startStaticServer, verifyMockBuild } = require('./static-server.cjs');

const OUT = path.resolve(__dirname, '..', 'previews/care-v2-mock-2026-10-26');

app.whenReady().then(async () => {
  verifyMockBuild();
  const base = await startStaticServer(4519);
  const win = new BrowserWindow({ show: false, width: 1180, height: 860 });
  fs.mkdirSync(OUT, { recursive: true });
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('shot', name);
  };
  const click = (sel) => win.webContents.executeJavaScript(`(() => {
    const el = ${sel};
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!el;
  })()`, true);

  await win.loadURL(base + '/dev.html');
  await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 2000))', true);
  await win.webContents.executeJavaScript(`(() => {
    [...document.querySelectorAll('.obj-item')].find(i => i.title && i.title.includes('聊天记录'))?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`, true);
  await new Promise((r) => setTimeout(r, 3000));
  await shot('1-care-desk-mold.png');

  await click(`[...document.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('收藏'))`);
  await new Promise((r) => setTimeout(r, 1200));
  await shot('2-collection-dex.png');

  await click(`document.getElementById('tab-wall')`);
  await new Promise((r) => setTimeout(r, 1000));
  await click(`document.getElementById('wall-enable')`);
  await new Promise((r) => setTimeout(r, 1000));
  await shot('3-wall-page.png');

  app.exit(0);
});
