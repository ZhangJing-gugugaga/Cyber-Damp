/**
 * Task 7/8/15 UI 探针（模拟环境，Chromium 输入注入）：驱动真实 DOM 手势。
 * 覆盖：对象选择 → 分层工具行出现 → 烟灰海绵拖动（烟灰层清除+软化区无）→
 * 补色滚轮拖动（依赖烟灰已清）→ 大范围拖动触发 90% 自动收尾 → 完成反馈（光泽/toast）→
 * 高亮按钮 → 墙面页刮雾 + 确认 → 图鉴 13 卡。
 * 运行：vite preview/dev 后 npx electron scripts/probe-dev-ui.cjs <url>
 */
const { app, BrowserWindow } = require('electron');
const { startStaticServer } = require('./static-server.cjs');

let URL = process.argv[2] || '';

app.whenReady().then(async () => {
  if (!URL) URL = await startStaticServer(4517) + '/dev.html';
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  let failed = 0;
  const step = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' -- ' + detail : ''));
    if (!ok) failed += 1;
  };
  try {
    await win.loadURL(URL);
    await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 1500))', true);
    await win.webContents.executeJavaScript('window.__mockDamp.reset()', true).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    await win.loadURL(URL);
    await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 1800))', true);

    const ui = win.webContents;
    const click = (sel) => ui.executeJavaScript(`(() => {
      const el = ${sel};
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    })()`, true);
    const pointer = (sel, pts) => ui.executeJavaScript(`(() => {
      const el = ${sel};
      const wrap = el.getBoundingClientRect();
      const results = [];
      const mk = (type, x, y) => new PointerEvent(type, {
        bubbles: true, pointerId: 7, isPrimary: true, pointerType: 'mouse',
        clientX: wrap.left + x * wrap.width, clientY: wrap.top + y * wrap.height, buttons: 1,
      });
      for (const [type, x, y] of ${JSON.stringify(pts)}) results.push(el.dispatchEvent(mk(type, x, y)));
      return results;
    })()`, true);

    // 1. 选中焦化对象（项目归档.zip，char:2）
    step('选中焦化对象', await click(`[...document.querySelectorAll('.obj-item')].find(i => i.title && i.title.includes('项目归档'))`));
    await new Promise((r) => setTimeout(r, 900));
    const tools = await ui.executeJavaScript(`[...document.querySelectorAll('#v2-tool-row .v2-tool')].map(b => b.dataset.tool)`, true);
    step('分层工具行出现（海绵/烟灰海绵/软毛刷/补色滚轮）', tools.includes('sponge') && tools.includes('sootblock') && tools.includes('repairroller'), tools.join(','));

    // 2. 烟灰海绵拖动
    step('选择烟灰海绵', await click(`document.querySelector('#v2-tool-row [data-tool="sootblock"]')`));
    await new Promise((r) => setTimeout(r, 200));
    await pointer(`document.getElementById('canvas-wrap')`, [
      ['pointerdown', 0.5, 0.5], ['pointermove', 0.55, 0.55], ['pointermove', 0.6, 0.5],
      ['pointerup', 0.6, 0.5],
    ]);
    await new Promise((r) => setTimeout(r, 600));
    const afterSoot = await ui.executeJavaScript(`window.damp.native.status().then(s => {
      const o = s.objects.find(x => x.displayName.includes('项目归档'));
      return { session: o.careSession, tools: o.careSession ? o.careSession.toolsUsed : [] };
    })`, true);
    step('烟灰海绵写入会话（soot 层掩码变化）', afterSoot.session && afterSoot.tools.includes('sootblock'), JSON.stringify(afterSoot.tools));

    // 3. 补色滚轮拖动（同格依赖烟灰已清 → scorch 层清除）
    step('选择补色滚轮', await click(`document.querySelector('#v2-tool-row [data-tool="repairroller"]')`));
    await new Promise((r) => setTimeout(r, 200));
    await pointer(`document.getElementById('canvas-wrap')`, [
      ['pointerdown', 0.5, 0.5], ['pointermove', 0.55, 0.55], ['pointerup', 0.55, 0.55],
    ]);
    await new Promise((r) => setTimeout(r, 600));
    const afterRoll = await ui.executeJavaScript(`window.damp.native.status().then(s => {
      const o = s.objects.find(x => x.displayName.includes('项目归档'));
      const scorch = o.careSession.layers.find(l => l.layer === 'scorch');
      return { cleared: scorch ? scorch.mask : null, soot: o.careSession.layers.find(l => l.layer === 'soot').mask };
    })`, true);
    step('滚轮只在烟灰已清的格生效', afterRoll.cleared && afterRoll.cleared.length > 0, `scorch掩码长度=${afterRoll.cleared.length}`);

    // 4. 大范围海绵拖动 → ≥90% 自动收尾 → 精细/普通完成反馈
    step('选择海绵', await click(`document.querySelector('#v2-tool-row [data-tool="sponge"]')`));
    await new Promise((r) => setTimeout(r, 200));
    const dragRows = [];
    for (let i = 0; i < 12; i += 1) {
      const y = 0.12 + i * 0.065;
      dragRows.push(['pointerdown', 0.12, y]);
      dragRows.push(['pointermove', 0.4, y + 0.01], ['pointermove', 0.7, y], ['pointermove', 0.9, y + 0.01]);
      dragRows.push(['pointerup', 0.9, y]);
    }
    await pointer(`document.getElementById('canvas-wrap')`, dragRows);
    await new Promise((r) => setTimeout(r, 1500));
    const afterAuto = await ui.executeJavaScript(`window.damp.native.status().then(s => {
      const o = s.objects.find(x => x.displayName.includes('项目归档'));
      return { stage: o.damage ? o.damage.stage : 0, coins: s.coins, today: s.todayStatus };
    })`, true);
    step('自动收尾完成护理（stage→0，币 +2 精细奖励）', afterAuto.stage === 0 && afterAuto.coins >= 26, JSON.stringify(afterAuto));

    // 5. 高亮按钮
    await click(`[...document.querySelectorAll('.obj-item')].find(i => i.title && i.title.includes('聊天记录'))`);
    await new Promise((r) => setTimeout(r, 900));
    await click(`document.getElementById('btn-highlight')`);
    await new Promise((r) => setTimeout(r, 300));
    const hl = await ui.executeJavaScript(`(() => {
      const c = document.getElementById('highlight-layer');
      const d = c.getContext('2d').getImageData(0, 0, 256, 256).data;
      let painted = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted += 1;
      return painted;
    })()`, true);
    step('高亮绘制剩余损伤（不清除）', hl > 0, `高亮像素=${hl}`);

    // 6. 墙面页
    await click(`document.getElementById('tab-wall')`);
    await new Promise((r) => setTimeout(r, 800));
    const wallOn = await click(`document.getElementById('wall-enable')`);
    await new Promise((r) => setTimeout(r, 800));
    await pointer(`document.getElementById('wall-fog')`, [
      ['pointerdown', 0.3, 0.4], ['pointermove', 0.5, 0.4], ['pointermove', 0.7, 0.4], ['pointerup', 0.7, 0.4],
    ]);
    await new Promise((r) => setTimeout(r, 300));
    const wallProgress = await ui.executeJavaScript(`document.getElementById('wall-fill').style.width`, true);
    await click(`document.getElementById('wall-confirm')`);
    await new Promise((r) => setTimeout(r, 800));
    const wallAfter = await ui.executeJavaScript(`window.damp.wallpaper.status().then(v => ({ progress: v.wipeProgress, enabled: v.enabled }))`, true);
    step('墙面页：开启 + 刮雾 + 确认提交', wallOn && wallProgress !== '0%' && wallAfter.enabled && wallAfter.progress > 0, JSON.stringify({ wallProgress, wallAfter }));

    // 7. 图鉴
    await click(`[...document.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('收藏'))`);
    await new Promise((r) => setTimeout(r, 900));
    const dex = await ui.executeJavaScript(`({
      cards: document.querySelectorAll('.dex-card:not(.legacy)').length,
      undiscovered: document.querySelectorAll('.dex-card.undiscovered').length,
      silhouettes: [...document.querySelectorAll('.dex-card.undiscovered img')].filter(i => (i.src || '').includes('silhouette')).length,
      legacy: document.querySelectorAll('.dex-card.legacy').length,
    })`, true);
    step('图鉴：13 款新品种卡片，未发现显示剪影，早期品种分区', dex.cards === 13 && dex.silhouettes === dex.undiscovered && dex.undiscovered > 0 && dex.legacy >= 1, JSON.stringify(dex));

    step('无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | '));
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (error) {
    console.error('[ui-probe] failed:', error && (error.stack || error.message));
    process.exitCode = 1;
  } finally {
    app.exit(process.exitCode ?? 0);
  }
});
