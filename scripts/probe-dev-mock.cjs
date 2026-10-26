/** 一次性探针：加载 dev.html，收集控制台错误，验证 window.damp 与 status()。 */
const { app, BrowserWindow } = require('electron');
const { startStaticServer, verifyMockBuild } = require('./static-server.cjs');

let URL = process.argv[2] || '';

app.whenReady().then(async () => {
  verifyMockBuild();
  if (!URL) URL = await startStaticServer(4517) + '/dev.html';
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) errors.push(`${message} @ ${source}:${line}`);
  });
  try {
    await win.loadURL(URL);
    await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 1200))', true);
    const probe = await win.webContents.executeJavaScript(`(async () => {
      const out = { hasDamp: !!window.damp, hasMock: !!window.__mockDamp, panel: !!document.getElementById('mock-panel'), status: null, error: null };
      try {
        const s = await window.damp.native.status();
        out.status = {
          objects: s.objects.length,
          coins: s.coins,
          todayStatus: s.todayStatus,
          dailyLimit: s.dailyLimit,
          forecastHeadline: s.forecast ? s.forecast.headline : null,
          categories: s.objects.map((o) => o.objectCategory).filter(Boolean).slice(0, 3),
          matureCount: s.objects.filter((o) => o.damage && o.damage.mushroom === 'mature').length,
          iconOk: s.objects.every((o) => (o.iconDataUrl || '').startsWith('data:image/png')),
        };
      } catch (e) { out.error = String(e && e.message || e); }
      return out;
    })()`, true);
    console.log('[probe]', JSON.stringify(probe, null, 2));
    console.log('[console-errors]', errors.length ? errors.slice(0, 5) : 'none');
    process.exitCode = probe.hasDamp && probe.status && probe.status.objects >= 6 && !probe.error ? 0 : 1;
  } catch (error) {
    console.error('[probe] load failed:', error && error.message);
    process.exitCode = 1;
  } finally {
    app.exit(process.exitCode ?? 0);
  }
});
