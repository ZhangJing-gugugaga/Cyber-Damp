/** 调试：重置后 dump 关键 fixture 与 __domain 存在性。 */
const { app, BrowserWindow } = require('electron');
const URL = process.argv[2] || 'http://127.0.0.1:4173/dev.html';
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL(URL);
  await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 1500))', true);
  await win.webContents.executeJavaScript('window.__mockDamp.reset()', true).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  await win.loadURL(URL);
  await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 1500))', true);
  const dump = await win.webContents.executeJavaScript(`(() => ({
    hasDomain: !!window.__domain,
    hasMockCare: !!window.__mockCare,
    hasMock: !!window.__mockDamp,
    objects: window.damp ? null : 'no damp',
  }))()`, true).catch((e) => ({ evalError: String(e) }));
  console.log(JSON.stringify(dump));
  const states = await win.webContents.executeJavaScript(`(async () => {
    const s = await window.damp.native.status();
    return s.objects.map((o) => o.id + '=' + (o.damage ? o.damage.family + ':' + o.damage.stage + ':' + o.damage.mushroom : 'clean'));
  })()`, true).catch((e) => [String(e)]);
  console.log(JSON.stringify(states));
  app.exit(0);
});
