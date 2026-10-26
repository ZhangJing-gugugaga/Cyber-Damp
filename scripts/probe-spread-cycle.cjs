/** 验证模拟环境每日编排含蔓延槽（daily-cycle 接入后）。 */
const { app, BrowserWindow } = require('electron');
const { startStaticServer, verifyMockBuild } = require('./static-server.cjs');

let URL = process.argv[2] || '';
app.whenReady().then(async () => {
  verifyMockBuild();
  if (!URL) URL = await startStaticServer(4527) + '/dev.html';
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 });
  const evalJs = (code) => win.webContents.executeJavaScript(code, true);
  await win.loadURL(URL);
  await evalJs('new Promise((r) => setTimeout(r, 1800))');
  await evalJs('window.__mockDamp.reset()');
  await new Promise((r) => setTimeout(r, 1200));
  await win.loadURL(URL);
  await evalJs('new Promise((r) => setTimeout(r, 1800))');
  const result = await evalJs(`(async () => {
    await window.damp.native.status();
    const before = Object.keys(window.__mockDamp.save.dailyEvents).length;
    window.__mockDamp.advanceDay();
    await new Promise(r => setTimeout(r, 400));
    const dates = Object.keys(window.__mockDamp.save.dailyEvents);
    const records = dates.map(d => ({ date: d, slots: window.__mockDamp.save.dailyEvents[d].slots.map(s => s.source + ':' + s.objectId), limit: window.__mockDamp.save.dailyEvents[d].limit }));
    const spreadSlots = records.flatMap(r => r.slots.filter(s => s.startsWith('spread:')));
    return { before, dates, records, spreadSlots, spreadCount: spreadSlots.length };
  })()`);
  console.log(JSON.stringify(result, null, 1));
  process.exitCode = result.spreadCount > 0 ? 0 : 1;
  app.exit(process.exitCode);
});
