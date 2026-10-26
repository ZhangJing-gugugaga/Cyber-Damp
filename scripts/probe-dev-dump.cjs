/** 调试：care-v2 启动状态与桥接。 */
const { app, BrowserWindow } = require('electron');
const { startStaticServer, verifyMockBuild } = require('./static-server.cjs');
let URL = process.argv[2] || '';
app.whenReady().then(async () => {
  verifyMockBuild();
  if (!URL) URL = await startStaticServer(4517) + '/dev.html';
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    errors.push(`L${level}: ${message}`);
  });
  await win.loadURL(URL);
  await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 2000))', true);
  await win.webContents.executeJavaScript(`(() => {
    [...document.querySelectorAll('.obj-item')].find(i => i.title && i.title.includes('项目归档'))?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`, true);
  await new Promise((r) => setTimeout(r, 3200));
  const diag = await win.webContents.executeJavaScript(`({
    hasDampV2: !!(window.damp && window.damp.native.careProgressV2 && window.damp.wallpaper),
    hasBridge: !!window.__careBridge,
    selectedId: window.__careBridge ? window.__careBridge.getSelectedId() : null,
    v2RowHtml: document.getElementById('v2-tool-row').innerHTML.slice(0, 120),
    v2RowHidden: document.getElementById('v2-tool-row').classList.contains('hidden'),
    forecastHidden: document.getElementById('forecast-card').classList.contains('hidden'),
    stageName: document.getElementById('stage-name').textContent,
  })`, true);
  console.log(JSON.stringify(diag, null, 1));
  console.log('console:', errors.slice(0, 6));
  app.exit(0);
});
