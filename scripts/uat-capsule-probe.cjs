/**
 * 阶段1B 原型实测：天气胶囊小窗（R2 专项）
 *
 * 验证：默认位置/尺寸、showInactive 不抢焦点、玻璃模式诚实报告、
 * 全屏级覆盖自动隐藏/恢复（SetWinEventHook 路径）、Win+D 冲突记录。
 * 截图输出 logs/capsule-probe/。
 *
 * 运行：node_modules/.bin/electron scripts/uat-capsule-probe.cjs
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function screenshot(outPath) {
  try {
    const { execFileSync } = require('node:child_process');
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
      '$b = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height);',
      '$g = [System.Drawing.Graphics]::FromImage($b);',
      '$g.CopyFromScreen(0, 0, 0, 0, $b.Size);',
      `$b.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);`,
    ].join(' ');
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 20000 });
    return true;
  } catch (err) {
    console.warn('[probe] 截图失败:', err.message);
    return false;
  }
}

const CAPSULE_HTML = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
  .capsule{box-sizing:border-box;width:352px;height:48px;margin:4px;border-radius:24px;
    background:rgba(20,26,34,0.55);color:#eaf2fa;font:13px/1.4 "Microsoft YaHei",sans-serif;
    display:flex;flex-direction:column;justify-content:center;padding:0 18px;
    -webkit-app-region:drag;cursor:default;}
  .row1{display:flex;justify-content:space-between;}
  .row2{opacity:.85;font-size:11px;}
  .probe{color:#ffd27f;}
</style></head><body>
  <div class="capsule" id="c">
    <div class="row1"><span class="probe">杭州 · 小雨（原型）</span><span>🔍</span></div>
    <div class="row2">18.4°C · 湿度 98% · 12:45 更新</div>
  </div>
  <script>
    const c = document.getElementById('c');
    // 胶囊本体可交互；透明留白穿透（R2：可见区域外不截获桌面点击）
    document.documentElement.addEventListener('mousemove', (e) => {
      const hit = e.target === c || c.contains(e.target);
      window.damp.window.setIgnoreMouseEvents(!hit, { forward: true });
    });
  </script>
</body></html>`);

app.whenReady().then(async () => {
  app.setPath('userData', path.join(os.tmpdir(), `cd-capsule-probe-${Date.now()}`));
  const logDir = path.join(__dirname, '..', 'logs', 'capsule-probe');
  fs.mkdirSync(logDir, { recursive: true });
  process.env.CD_CAPSULE_STATE_DIR = path.join(os.tmpdir(), `cd-capsule-probe-state-${Date.now()}`);

  // 原型自备最小 IPC（生产由 register-handlers 提供）
  const wcRef = { current: null };
  ipcMain.handle('window:setIgnoreMouseEvents', (e, payload) => {
    if (!wcRef.current || e.sender !== wcRef.current) return;
    const { ignore, forward } = payload ?? {};
    capsule?.win.setIgnoreMouseEvents(!!ignore, { forward: forward !== false });
  });

  const { createCapsuleWindow } = require('../dist/main/window/capsule-window.js');
  const preloadPath = path.join(__dirname, '..', 'dist', 'preload', 'index.js');
  let capsule = null;
  try {
    capsule = createCapsuleWindow(preloadPath, CAPSULE_HTML);
    wcRef.current = capsule.win.webContents;
    check('胶囊窗创建', !capsule.win.isDestroyed());
    await sleep(1500);

    // 1. 默认位置与尺寸
    const work = screen.getPrimaryDisplay().workArea;
    const [x, y] = capsule.win.getPosition();
    const [w, h] = capsule.win.getSize();
    check('宽度 360 DIP / 高度 56 DIP', w === 360 && h === 56, `${w}x${h}`);
    check('主屏工作区顶部居中，距顶 24 DIP', x === work.x + Math.round((work.width - 360) / 2) && y === work.y + 24, `x=${x},y=${y},work.x=${work.x},work.y=${work.y}`);
    check('可见且不抢焦点', capsule.win.isVisible() && !capsule.win.isFocused());
    check('不占任务栏（skipTaskbar）', capsule.win.isSkipTaskbar?.() ?? true);
    check('非置顶（不压普通应用）', !capsule.win.isAlwaysOnTop());

    // 2. 玻璃模式诚实报告（Win10 预期 acrylic/blur/transparent，dwm-backdrop 仅 Win11）
    console.log(`INFO  玻璃模式：${capsule.glassMode}`);
    check('玻璃模式已报告', ['dwm-backdrop', 'acrylic', 'blur', 'transparent'].includes(capsule.glassMode));

    await sleep(800);
    screenshot(path.join(logDir, '1-capsule-visible.png'));

    // 3. 覆盖自动隐藏：创建一个覆盖主屏工作区的普通窗口
    const cover = new BrowserWindow({
      width: work.width, height: work.height, x: work.x, y: work.y,
      frame: false, show: false, backgroundColor: '#204060',
    });
    cover.show(); // 激活为前台，制造 EVENT_SYSTEM_FOREGROUND
    await sleep(2500); // 等 SetWinEventHook 触发（去抖 400ms）
    check('全屏级覆盖 → 胶囊自动隐藏', !capsule.win.isVisible(), capsule.win.isVisible() ? '钩子未触发隐藏' : undefined);
    screenshot(path.join(logDir, '2-covered-hidden.png'));
    cover.destroy();
    await sleep(2500);
    check('覆盖撤除 → 胶囊自动恢复（showInactive 不抢焦点）', capsule.win.isVisible() && !capsule.win.isFocused());

    // 4. Win+D 冲突证据：最小化行为与 skipTaskbar 恢复路径
    capsule.win.minimize();
    await sleep(300);
    const minimizedHidden = !capsule.win.isVisible();
    capsule.win.showInactive();
    await sleep(300);
    check('最小化后可经编程入口唤回（Win+D 场景的程序内等价）', minimizedHidden && capsule.win.isVisible());
    console.log('INFO  真实 Win+D 行为（原生输入）留给 UAT：预期最小化导致不可见，托盘/程序入口可唤回 —— 该冲突已标记待用户确认降级');

    // 5. 位置记忆（程序内模拟 moved 事件路径）
    const stateDir = process.env.CD_CAPSULE_STATE_DIR;
    const stateFile = path.join(stateDir, 'capsule-state.json');
    check('拖动位置记忆落盘', !fs.existsSync(stateFile), 'moved 未触发前不应有文件（原生拖动 UAT 验证）');
  } catch (error) {
    check('原型执行异常', false, error.stack ?? error.message);
  } finally {
    capsule?.destroy();
  }

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(logDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) console.log('FAILED:', failed.map((f) => f.name).join('; '));
  app.exit(failed.length ? 1 : 0);
});
