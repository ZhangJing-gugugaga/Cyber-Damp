/** 剪刀采摘隔离调试。 */
const { app, BrowserWindow } = require('electron');
const { startStaticServer } = require('./static-server.cjs');

let URL = process.argv[2] || '';
app.whenReady().then(async () => {
  if (!URL) URL = await startStaticServer(4523) + '/dev.html';
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 });
  const errors = [];
  win.webContents.on('console-message', (_e, _l, m, line, src) => errors.push(`${m} @ ${src}:${line}`));
  const ui = win.webContents;
  const evalJs = (code) => ui.executeJavaScript(code, true).catch((e) => ({ evalError: String(e).slice(0, 200) }));

  await win.loadURL(URL);
  await evalJs('new Promise((r) => setTimeout(r, 1800))');
  await evalJs('window.__mockDamp.reset()');
  await new Promise((r) => setTimeout(r, 1200));
  await win.loadURL(URL);
  await evalJs('new Promise((r) => setTimeout(r, 1800))');

  // 跳过引导
  for (let i = 0; i < 8; i += 1) {
    const visible = await evalJs(`!document.getElementById('onboarding').classList.contains('hidden')`);
    if (!visible) break;
    await evalJs(`document.getElementById('ob-skip')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await new Promise((r) => setTimeout(r, 300));
  }
  // 选成熟菇对象（旅行照片 / 聊天记录）
  const pick = await evalJs(`(async () => {
    const s = await window.damp.native.status();
    const m = s.objects.find(o => o.damage && o.damage.mushroom === 'mature');
    [...document.querySelectorAll('.obj-item')].find(i => i.title === m.displayName)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1200));
    return {
      matureName: m.displayName,
      selected: window.__careBridge.getSelectedId(),
      tools: [...document.querySelectorAll('#v2-tool-row .v2-tool')].map(b => b.dataset.tool),
      mushroomElSrc: document.getElementById('mushroom-layer').src.slice(0, 60),
    };
  })()`);
  console.log('pick:', JSON.stringify(pick));
  // 点剪刀
  const sc = await evalJs(`(() => {
    const btn = document.querySelector('#v2-tool-row [data-tool="scissors"]');
    if (!btn) return { found: false };
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { found: true };
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  console.log('scissors:', JSON.stringify(sc), 'claimed:', await evalJs(`document.getElementById('canvas-wrap').dataset.v2Claimed || 'unset'`));
  // 沿柄拖动
  await evalJs(`(() => {
    const wrap = document.getElementById('canvas-wrap').getBoundingClientRect();
    const mk = (type, x, y) => new PointerEvent(type, { bubbles: true, pointerId: 11, isPrimary: true, pointerType: 'mouse', clientX: wrap.left + x * wrap.width, clientY: wrap.top + y * wrap.height, buttons: 1 });
    const w = document.getElementById('canvas-wrap');
    w.dispatchEvent(mk('pointerdown', 0.5, 0.72));
    w.dispatchEvent(mk('pointermove', 0.5, 0.78));
    w.dispatchEvent(mk('pointerup', 0.5, 0.8));
  })()`);
  await new Promise((r) => setTimeout(r, 1500));
  const after = await evalJs(`(async () => {
    const s = await window.damp.native.status();
    const m = s.objects.find(o => o.displayName === ${JSON.stringify(pick && pick.matureName)});
    return { mushroom: m.damage ? m.damage.mushroom : 'none', coins: s.coins, spores: s.spores };
  })()`);
  console.log('after cut:', JSON.stringify(after));
  console.log('errors:', errors.filter((e) => !e.includes('cache') && !e.includes('Gpu')).slice(0, 4));
  app.exit(0);
});
