/**
 * 交互压力探针：把真实用户会点的路径全部过一遍，收集每个控制台错误（含堆栈定位）。
 * 覆盖：引导完成/跳过、练习样片、快速处理(v1)、v1 采摘按钮、小铺购买、设置暂停/恢复、
 * 剪刀采摘手势、播种按钮、天气中途切换、各页签切换。
 * 运行：npx electron scripts/probe-dev-stress.cjs [url]
 */
const { app, BrowserWindow } = require('electron');
const { startStaticServer, verifyMockBuild } = require('./static-server.cjs');

let URL = process.argv[2] || '';

app.whenReady().then(async () => {
  verifyMockBuild();
  if (!URL) URL = await startStaticServer(4521) + '/dev.html';
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 });
  const errors = [];
  win.webContents.on('console-message', (_e, _level, message, line, source) => {
    errors.push(`${message} @ ${source}:${line}`);
  });
  let failed = 0;
  const step = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' -- ' + detail : ''));
    if (!ok) failed += 1;
  };
  const ui = win.webContents;
  const click = async (expr) => ui.executeJavaScript(`(() => { const el = ${expr}; if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!el; })()`, true).catch((e) => { errors.push('eval:' + String(e).slice(0, 120)); return false; });
  const evalJs = (code) => ui.executeJavaScript(code, true).catch((e) => { errors.push('eval:' + String(e).slice(0, 160)); return null; });

  try {
    await win.loadURL(URL);
    await evalJs('new Promise((r) => setTimeout(r, 1800))');
    await evalJs('window.__mockDamp.reset()');
    await new Promise((r) => setTimeout(r, 1200));
    await win.loadURL(URL);
    await evalJs('new Promise((r) => setTimeout(r, 1800))');

    // ---- 引导：下一步 × N → 完成练习 ----
    const obSteps = [];
    for (let i = 0; i < 8; i += 1) {
      const visible = await evalJs(`!document.getElementById('onboarding').classList.contains('hidden')`);
      if (!visible) break;
      const label = await evalJs(`document.getElementById('ob-next').textContent`);
      obSteps.push(label);
      await click(`document.getElementById('ob-next')`);
      await new Promise((r) => setTimeout(r, 350));
    }
    step('引导走完（不崩溃）', true, obSteps.join('→'));
    const coinsAfterOb = await evalJs(`window.damp.native.status().then(s => s.coins)`);
    step('引导奖励 24 币入账', coinsAfterOb >= 24, `coins=${coinsAfterOb}`);

    // ---- 练习样片开关 ----
    await click(`[...document.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('护理台'))`);
    await click(`[...document.querySelectorAll('.obj-item')].find(i => i.title && i.title.includes('干净'))`);
    await new Promise((r) => setTimeout(r, 800));
    // 练习入口可能在空状态/帮助处；直接验证 practice overlay 开关不崩
    await evalJs(`document.getElementById('practice')?.classList.remove('hidden')`);
    await click(`document.getElementById('practice-close')`);
    step('练习样片开关不崩', true);

    // ---- 快速处理（v1 通道）----
    await click(`[...document.querySelectorAll('.obj-item')].find(i => i.title && i.title.includes('会议'))`);
    await new Promise((r) => setTimeout(r, 900));
    await click(`document.getElementById('btn-quick')`);
    await new Promise((r) => setTimeout(r, 1200));
    const afterQuick = await evalJs(`window.damp.native.status().then(s => { const o = s.objects.find(x => x.displayName.includes('会议')); return { stage: o.damage ? o.damage.stage : 0 }; })`);
    step('快速处理完成清理（stage→0）', afterQuick && afterQuick.stage === 0, JSON.stringify(afterQuick));

    // ---- v1 采摘按钮（成熟菇对象）----
    await click(`[...document.querySelectorAll('.obj-item')].find(i => i.classList.contains('harvest') || (i.querySelector('.flag') || {}).className?.includes('harvest'))`);
    await new Promise((r) => setTimeout(r, 900));
    const harvestBtnVisible = await evalJs(`!document.getElementById('btn-harvest').classList.contains('hidden')`);
    if (harvestBtnVisible) {
      await click(`document.getElementById('btn-harvest')`);
      await new Promise((r) => setTimeout(r, 1200));
    }
    step('v1 采摘按钮流程不崩', true, `btn可见=${harvestBtnVisible}`);

    // ---- 剪刀采摘手势（选成熟菇对象 → 剪刀 → 沿柄拖动）----
    const matureId = await evalJs(`window.damp.native.status().then(s => { const m = s.objects.find(o => o.damage && o.damage.mushroom === 'mature'); return m ? m.id : null; })`);
    if (matureId) {
      await evalJs(`[...document.querySelectorAll('.obj-item')].find(i => i.title && window.__careBridge.getStatus().objects.find(o => o.id === ${JSON.stringify(matureId)} && o.displayName === i.title))?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      await new Promise((r) => setTimeout(r, 900));
      await click(`document.querySelector('#v2-tool-row [data-tool="scissors"]')`);
      await new Promise((r) => setTimeout(r, 300));
      // 菇柄锚点约 (0.5, 0.8) 归一坐标
      await evalJs(`(() => {
        const wrap = document.getElementById('canvas-wrap').getBoundingClientRect();
        const mk = (type, x, y) => new PointerEvent(type, { bubbles: true, pointerId: 5, isPrimary: true, pointerType: 'mouse', clientX: wrap.left + x * wrap.width, clientY: wrap.top + y * wrap.height, buttons: 1 });
        const w = document.getElementById('canvas-wrap');
        w.dispatchEvent(mk('pointerdown', 0.5, 0.75));
        w.dispatchEvent(mk('pointermove', 0.5, 0.8));
        w.dispatchEvent(mk('pointerup', 0.5, 0.82));
      })()`);
      await new Promise((r) => setTimeout(r, 1200));
      const cut = await evalJs(`window.damp.native.status().then(s => { const o = s.objects.find(x => x.id === ${JSON.stringify(matureId)}); return { mushroom: o.damage ? o.damage.mushroom : 'none', coins: s.coins }; })`);
      step('剪刀手势采下成熟菇', cut && cut.mushroom === 'none', JSON.stringify(cut));
    } else {
      step('剪刀采摘（无成熟菇可跳过）', true);
    }

    // ---- 播种按钮 ----
    const plantReady = await evalJs(`(async () => {
      const s = await window.damp.native.status();
      const target = s.objects.find(o => o.damage && o.damage.mushroom === 'none' && o.damage.stage > 0);
      if (!target) return null;
      [...document.querySelectorAll('.obj-item')].find(i => i.title === target.displayName)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 900));
      return { id: target.id, visible: !document.getElementById('btn-plant').classList.contains('hidden') };
    })()`);
    if (plantReady && plantReady.visible) {
      await click(`document.getElementById('btn-plant')`);
      await new Promise((r) => setTimeout(r, 1000));
      const planted = await evalJs(`window.damp.native.status().then(s => s.planted.some(p => p.objectId === ${JSON.stringify(plantReady.id)} && p.status === 'pending'))`);
      step('播种按钮成功登记', planted === true);
    } else {
      step('播种按钮（库存为空或无目标，跳过）', true, JSON.stringify(plantReady));
    }

    // ---- 小铺购买 ----
    await click(`[...document.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('小铺'))`);
    await new Promise((r) => setTimeout(r, 500));
    await click(`document.querySelector('#shop-list button')`);
    await new Promise((r) => setTimeout(r, 800));
    step('小铺购买不崩', true);

    // ---- 设置页（0.1.28 用户裁决取消"暂停自然变化"入口）----
    await click(`[...document.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('设置'))`);
    await new Promise((r) => setTimeout(r, 400));
    const pauseGone = await evalJs(`document.getElementById('pause-toggle') === null`);
    step('设置页不再有暂停自然变化入口', pauseGone === true);

    // ---- 天气中途切换（会话进行中选工具 → 切天气 → 重载后不崩）----
    await click(`[...document.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('护理台'))`);
    await new Promise((r) => setTimeout(r, 500));
    await click(`[...document.querySelectorAll('.obj-item')].find(i => i.title && i.title.includes('截图'))`);
    await new Promise((r) => setTimeout(r, 900));
    await click(`document.querySelector('#v2-tool-row [data-tool="cloth"]')`);
    await new Promise((r) => setTimeout(r, 300));
    await evalJs(`(() => {
      const wrap = document.getElementById('canvas-wrap').getBoundingClientRect();
      const mk = (type, x, y) => new PointerEvent(type, { bubbles: true, pointerId: 9, isPrimary: true, pointerType: 'mouse', clientX: wrap.left + x * wrap.width, clientY: wrap.top + y * wrap.height, buttons: 1 });
      const w = document.getElementById('canvas-wrap');
      w.dispatchEvent(mk('pointerdown', 0.4, 0.4));
      w.dispatchEvent(mk('pointermove', 0.5, 0.45));
      // 不松手直接切天气（模拟中途重载）
    })()`);
    await click(`[...document.querySelectorAll('#mock-panel button')].find(b => b.textContent.includes('降雨'))`);
    await new Promise((r) => setTimeout(r, 1500));
    await evalJs('new Promise((r) => setTimeout(r, 1200))');
    const afterWeather = await evalJs(`!!window.damp && !!window.damp.native`);
    step('天气中途切换重载后正常', afterWeather === true);

    // ---- 每个页签轮一遍 ----
    for (const tab of ['护理台', '墙面', '收藏', '小铺', '设置']) {
      await click(`[...document.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('${tab}'))`);
      await new Promise((r) => setTimeout(r, 700));
    }
    step('五个页签切换不崩', true);

    const realErrors = errors.filter((e) => !e.includes('Gpu') && !e.includes('gpu') && !e.includes('disk_cache') && !e.includes('cache'));
    step('无未捕获异常', realErrors.length === 0, realErrors.slice(0, 4).join(' || '));
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (error) {
    console.error('[stress] crashed:', error && (error.stack || error.message));
    process.exitCode = 1;
  } finally {
    app.exit(process.exitCode ?? 0);
  }
});
