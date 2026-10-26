/**
 * 胶囊点击/拖动接线探针（0.1.28）：真实 createCapsuleWindow（透明、不可聚焦）+ 真实 preload + 胶囊页面。
 * 输入经 webContents.sendInputEvent（Chromium 输入管线）注入：验证页面判定 → IPC → 主进程 setPosition/点击回调。
 * 不能证明 Windows 原生鼠标命中（系统级 hit-test），原生点击/拖动仍需用户实机确认。
 * 不触碰桌面图标；胶囊位置记忆写到临时目录（CD_CAPSULE_STATE_DIR）。
 *
 * 运行（需先 npm run build）：node_modules/.bin/electron scripts/uat-capsule-input.cjs
 */
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-capsule-'));
app.setPath('userData', tmp);
process.env.CD_CAPSULE_STATE_DIR = tmp;

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const { createCapsuleWindow } = require(path.join(root, 'dist/main/window/capsule-window.js'));
  let clicks = 0;
  const handle = createCapsuleWindow(path.join(root, 'dist/preload/index.js'),
    path.join(root, 'dist/renderer/capsule.html'), { onCapsuleClick: () => { clicks += 1; } });
  const win = handle.win;
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(600);
  const wc = win.webContents;
  const mouse = (type, x, y, extra = {}) => wc.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });

  try {
    const bounds = win.getBounds();
    const hasApi = await wc.executeJavaScript('typeof window.damp?.capsule?.click === "function"');
    check('胶囊页拿到 capsule 接口', hasApi === true);
    const fill = await wc.executeJavaScript(`(() => { const r = document.getElementById('capsule').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; })()`);
    check('胶囊铺满窗口（无透明留白）', fill[0] === fill[2] && fill[1] === fill[3], JSON.stringify(fill));

    // 1. 纯点击：按下抬起无位移 → 打开护理台回调恰一次，窗口不动
    mouse('mouseDown', 100, 28); await sleep(60); mouse('mouseUp', 100, 28); await sleep(200);
    check('纯点击触发一次打开回调', clicks === 1, `clicks=${clicks}`);
    const [x0, y0] = win.getPosition();
    check('纯点击不移动窗口', x0 === bounds.x && y0 === bounds.y, `${x0},${y0}`);

    // 2. 拖动：按下后移动 60px → 窗口跟随，抬起不触发点击
    mouse('mouseDown', 100, 28, { globalX: bounds.x + 100, globalY: bounds.y + 28 });
    await sleep(40);
    for (let i = 1; i <= 6; i += 1) {
      mouse('mouseMove', 100 + i * 10, 28, { globalX: bounds.x + 100 + i * 10, globalY: bounds.y + 28 + i * 5 });
      await sleep(30);
    }
    mouse('mouseUp', 160, 28, { globalX: bounds.x + 160, globalY: bounds.y + 58 });
    await sleep(300);
    const [x1, y1] = win.getPosition();
    check('拖动后窗口跟随位移', x1 - bounds.x >= 40 && y1 - bounds.y >= 20, `dx=${x1 - bounds.x} dy=${y1 - bounds.y}`);
    check('拖动抬起不误开护理台', clicks === 1, `clicks=${clicks}`);
    const remembered = JSON.parse(fs.readFileSync(path.join(tmp, 'capsule-state.json'), 'utf8')).remembered;
    check('拖动结束记忆新位置', remembered && remembered.x === x1 && remembered.y === y1, JSON.stringify(remembered));

    // 3. 非胶囊发送方的伪造位移被忽略
    const { BrowserWindow } = require('electron');
    const other = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'dist/preload/index.js'), contextIsolation: true, sandbox: true } });
    await other.loadURL('data:text/html,<html></html>');
    await other.webContents.executeJavaScript('window.damp.capsule.dragStart(); window.damp.capsule.dragMove(500, 500); window.damp.capsule.dragEnd(); window.damp.capsule.click(); 1');
    await sleep(200);
    const [x2, y2] = win.getPosition();
    check('其他窗口不能移动胶囊或触发点击', x2 === x1 && y2 === y1 && clicks === 1, `${x2},${y2} clicks=${clicks}`);
    other.destroy();
  } catch (error) {
    check('探针执行无异常', false, String(error && error.stack ? error.stack : error));
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(`\nSUMMARY ${results.length - failed}/${results.length} passed`);
  handle.destroy();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Chromium 占用 */ }
  app.exit(failed === 0 ? 0 : 1);
});
