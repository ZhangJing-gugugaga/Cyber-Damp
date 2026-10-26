/**
 * 方向稿截图：electron design-system/care-v3/shot.cjs <html文件名> [<html文件名>…]
 * 每个文件截 2 张：静止首屏（-idle.png）与演示中（-play.png：调用页面 window.__demo 摘对象、拿工具、
 * 用 Chromium 输入管线拖一段擦拭）。输出到 shots/。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'cd-v3-shot-')));
const files = process.argv.slice(2).filter((a) => a.endsWith('.html'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    const win = new BrowserWindow({ show: true, width: 960, height: 640, useContentSize: true, frame: false, webPreferences: { backgroundThrottling: false } });
    const errors = [];
    win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
    await win.loadFile(path.join(__dirname, file));
    await sleep(1600);
    const base = path.basename(file, '.html');
    fs.writeFileSync(path.join(outDir, `${base}-idle.png`), (await win.webContents.capturePage()).toPNG());
    const plan = await win.webContents.executeJavaScript('window.__demoPlan ? window.__demoPlan() : null').catch(() => null);
    const hasDemo = await win.webContents.executeJavaScript('!!window.__demo');
    if (hasDemo) {
      await win.webContents.executeJavaScript('window.__demo.pick(1)');
      await sleep(2200);
      await win.webContents.executeJavaScript('window.__demo.selectTool(0)');
      await sleep(200);
      const area = await win.webContents.executeJavaScript(`(() => { const c = document.querySelector('canvas[style*="touch-action"]'); if (!c) return null; const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
      if (area) {
        const [x, y, w, h] = area;
        const send = (type, px, py) => win.webContents.sendInputEvent({ type, x: Math.round(px), y: Math.round(py), button: 'left', clickCount: 1 });
        send('mouseDown', x + w * 0.2, y + h * 0.3);
        for (let i = 0; i <= 24; i += 1) {
          const t = i / 24;
          send('mouseMove', x + w * (0.2 + 0.6 * t), y + h * (0.3 + 0.08 * Math.sin(t * 9)));
          await sleep(16);
        }
        for (let i = 0; i <= 18; i += 1) {
          const t = i / 18;
          send('mouseMove', x + w * (0.8 - 0.6 * t), y + h * (0.48 + 0.06 * Math.sin(t * 7)));
          await sleep(16);
        }
        await sleep(120);
        fs.writeFileSync(path.join(outDir, `${base}-play.png`), (await win.webContents.capturePage()).toPNG());
        send('mouseUp', x + w * 0.2, y + h * 0.5);
      }
    }
    console.log(base, plan ? JSON.stringify(plan) : '', errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'no console errors');
    win.destroy();
  }
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
