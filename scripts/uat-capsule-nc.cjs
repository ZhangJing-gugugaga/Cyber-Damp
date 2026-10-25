/**
 * 胶囊 NC 消息管线功能验证（进程内、消息级——非原生输入，不替代 AC-03 原生验收）
 *
 * 用真实生产代码（dist 的 capsule-window + win32-capsule-hittest）在真实桌面
 * 创建真实胶囊窗口，然后从同进程 SendMessage/PostMessage 驱动：
 *  1. WM_NCHITTEST 子类化：内容点→HTCAPTION，4px 留白→HTTRANSPARENT；
 *  2. NCLBUTTONDOWN→NCLBUTTONUP 无移动 → onCapsuleClick 触发一次；
 *  3. DOWN + 程序移动窗口 + UP（模拟拖动中的移动）→ 不触发（拖后不误开）。
 * 运行：node_modules/.bin/electron scripts/uat-capsule-nc.cjs
 */
const { app } = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

app.whenReady().then(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-nc-'));
  app.setPath('userData', dataDir);
  try {
    const { createCapsuleWindow } = await import('../dist/main/window/capsule-window.js');
    let clicks = 0;
    const preload = path.resolve(__dirname, '..', 'dist', 'preload', 'index.js');
    const html = path.resolve(__dirname, '..', 'dist', 'renderer', 'capsule.html');
    const handle = createCapsuleWindow(preload, html, {
      onCapsuleClick: () => { clicks += 1; },
    });
    const win = handle.win;
    await new Promise((r) => setTimeout(r, 2500)); // 等页面 ready-to-show

    const koffi = (await import('koffi')).default;
    const user32 = koffi.load('user32.dll');
    // struct 必须先于引用它的 func() 声明登记（koffi 实测坑：顺序颠倒报 Unknown type name）
    try { koffi.struct('KRECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' }); } catch { /* 已注册 */ }
    // HWND 用 intptr 数值传递（koffi 对指针大小整数直接接受，避免 as/指针包装）
    const SendMessageW = user32.func('intptr SendMessageW(intptr h, uint32 msg, uintptr wp, intptr lp)');
    const PostMessageW = user32.func('bool PostMessageW(intptr h, uint32 msg, uintptr wp, intptr lp)');
    const GetWindowRect = user32.func('bool GetWindowRect(intptr h, _Out_ KRECT *r)');
    const SetWindowPos = user32.func('bool SetWindowPos(intptr h, intptr after, int32 x, int32 y, int32 cx, int32 cy, uint32 flags)');

    const buf = win.getNativeWindowHandle();
    const hwnd = process.platform === 'win32' ? buf.readInt32LE(0) : 0;

    const rect = {};
    GetWindowRect(hwnd, rect);
    check('胶囊窗口就绪', rect.right - rect.left > 0 && rect.bottom - rect.top > 0,
      `${rect.left},${rect.top},${rect.right},${rect.bottom}`);

    const lParamOf = (x, y) => ((y & 0xffff) << 16) | (x & 0xffff);
    // 125% 缩放下 4px CSS margin ≈ 5 物理像素；取 left+2/top+2 与 left+1/top+6 都是留白
    const hitContent = Number(SendMessageW(hwnd, 0x0084, 0, lParamOf(
      Math.round((rect.left + rect.right) / 2), Math.round((rect.top + rect.bottom) / 2))));
    const hitMargin = Number(SendMessageW(hwnd, 0x0084, 0, lParamOf(rect.left + 2, rect.top + 2)));
    check('内容点命中 HTCAPTION', hitContent === 2, `got ${hitContent}`);
    check('留白点命中 HTTRANSPARENT', hitMargin === -1, `got ${hitMargin}`);

    const contentLp = lParamOf(Math.round((rect.left + rect.right) / 2), Math.round((rect.top + rect.bottom) / 2));
    const HTCAPTION = 2;
    // 纯点击：DOWN → UP（无移动）
    PostMessageW(hwnd, 0x00a1, HTCAPTION, contentLp);
    await new Promise((r) => setTimeout(r, 250));
    PostMessageW(hwnd, 0x00a2, HTCAPTION, contentLp);
    await new Promise((r) => setTimeout(r, 800));
    check('纯点击触发 onCapsuleClick 恰一次', clicks === 1, `clicks=${clicks}`);

    // 拖动语义：DOWN → 窗口移动（win 'move' 事件应置 pressMoved）→ UP
    PostMessageW(hwnd, 0x00a1, HTCAPTION, contentLp);
    await new Promise((r) => setTimeout(r, 250));
    SetWindowPos(hwnd, 0, rect.left + 24, rect.top, 0, 0, 0x0001 /*NOSIZE*/ | 0x0004 /*NOACTIVATE*/);
    await new Promise((r) => setTimeout(r, 450)); // 等 Electron 'move' 事件派发
    PostMessageW(hwnd, 0x00a2, HTCAPTION, contentLp);
    await new Promise((r) => setTimeout(r, 800));
    check('拖动后 UP 不误开（clicks 不增加）', clicks === 1, `clicks=${clicks}`);

    // 重复/孤儿 UP 不触发
    PostMessageW(hwnd, 0x00a2, HTCAPTION, contentLp);
    await new Promise((r) => setTimeout(r, 500));
    check('无按下的孤儿 UP 不触发', clicks === 1, `clicks=${clicks}`);

    handle.destroy();
  } catch (error) {
    check('探针异常', false, error.stack ?? error.message);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`SUMMARY: ${results.length - failed.length}/${results.length} PASS`);
  app.exit(failed.length ? 1 : 0);
});
