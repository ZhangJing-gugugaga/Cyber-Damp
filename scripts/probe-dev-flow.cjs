/**
 * Task 2 Demo 流程探针：在浏览器模拟环境走完整玩法闭环（v2 通道 + 真实领域路径）。
 *
 * 步骤（对应计划书 Task 2 Demo / 验收）：
 *  1. 选择焦化图标 → 烟灰海绵清烟灰 → 补色滚轮补焦痕 → careCompleteV2 精细完成
 *  2. 收获菇币与光泽
 *  3. 采摘成熟菇（剪刀 harvestV2，cutQuality=0.9）
 *  4. 将孢子播种到另一对象（plantSpore，占用当日槽位）
 *  5. 推进一天 → 指定品种长出（幼菇）
 *  6. 重载页面 → 护理进度/收藏/孢子仍在（localStorage 持久化）
 *
 * 运行：先 vite preview/dev，再 npx electron scripts/probe-dev-flow.cjs <url>
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
    // 每次从干净模拟存档开始（上次运行可能已完成护理并持久化）
    await win.webContents.executeJavaScript('window.__mockDamp.reset()', true).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    await win.loadURL(URL);
    await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 1500))', true);

    const script = `(async () => {
      const damp = window.damp;
      const D = window.__domain;
      const R = [];
      const note = (k, v, d) => R.push([k, v, d]);

      let status = await damp.native.status();
      const charObj = status.objects.find((o) => o.damage && o.damage.family === 'char' && o.damage.stage >= 2);
      const matureObj = status.objects.find((o) => o.damage && o.damage.mushroom === 'mature');
      const plantObj = status.objects.find((o) => o.damage && o.damage.mushroom === 'none');
      const coinsBefore = status.coins;
      note('fixture: 焦化对象/成熟菇/可播种对象存在', !!charObj && !!matureObj && !!plantObj);

      // 1) 分层护理：烟灰海绵点按 → 补色滚轮补焦痕（焦痕格依赖烟灰已清）
      const cells = [1500, 1501, 1502, 1503];
      let session = D.createCareSession('char', charObj.damage.stage, charObj.careSession);
      session = D.applyToolStroke(session, 'sootblock', cells, { soot: 4096, scorch: 4096 });
      session = D.applyToolStroke(session, 'repairroller', cells, { soot: 4096, scorch: 4096 });
      const v1 = await damp.native.careProgressV2({ objectId: charObj.id, family: 'char', stage: charObj.damage.stage, session });
      note('careProgressV2 接受分层会话', v1.ok === true);

      // 校验回读：会话已持久化
      status = await damp.native.status();
      const savedSession = status.objects.find((o) => o.id === charObj.id).careSession;
      note('会话已保存（toolsUsed 含两个工具）', !!savedSession && savedSession.toolsUsed.includes('sootblock') && savedSession.toolsUsed.includes('repairroller'));

      // 2) 收尾到全层完成 → 回存最终会话 → 精细护理完成
      let final = D.validateCareSession(savedSession) || savedSession;
      for (const layer of final.layers) final = D.setLayerProgress(final, layer.layer, 1);
      const v1b = await damp.native.careProgressV2({ objectId: charObj.id, family: 'char', stage: charObj.damage.stage, session: final });
      note('收尾会话回存成功', v1b.ok === true);
      const fine = D.judgeFineCare(final, { quickCare: false });
      const v2 = await damp.native.careCompleteV2(charObj.id);
      note('careCompleteV2 成功', v2.ok === true);
      note('精细护理判定 = +2 币 + 光泽', fine === true && v2.bonusCoins === 2 && !!v2.glossUntil,
        JSON.stringify({ fine, bonusCoins: v2.bonusCoins, gloss: !!v2.glossUntil }));
      status = await damp.native.status();
      note('菇币增加', status.coins >= coinsBefore + 2, JSON.stringify({ before: coinsBefore, after: status.coins }));

      // 3) 采摘成熟菇（剪得准）
      const sporesBefore = status.spores[matureObj.mushroomSpecies] ?? 0;
      const hv = await damp.native.harvestV2({ objectId: matureObj.id, cutQuality: 0.9 });
      note('harvestV2 采摘成功', hv.ok === true && hv.coins === 4, 'coins=' + hv.coins + ' spore=' + hv.spore);
      status = await damp.native.status();
      note('采摘后损伤保留、菇移除', (() => {
        const o = status.objects.find((x) => x.id === matureObj.id);
        return o.damage && o.damage.stage > 0 && o.damage.mushroom === 'none';
      })());

      // 4) 播种：用采摘得到的孢子（无掉落时用库存 bell）
      const sporeSpecies = hv.spore || (status.spores.bell > 0 ? 'bell' : Object.keys(status.spores).find((k) => status.spores[k] > 0));
      const ps = await damp.native.plantSpore({ objectId: plantObj.id, species: sporeSpecies });
      note('plantSpore 播种成功（占用当日额度）', ps.ok === true, ps.message);
      status = await damp.native.status();
      note('播种对象出现 plantedSpecies', status.objects.find((x) => x.id === plantObj.id).plantedSpecies === sporeSpecies);

      // 5) 推进一天 → 播种槽结算 → 幼菇长出指定品种
      await window.__mockDamp.advanceDay();
      await new Promise((r) => setTimeout(r, 300));
      status = await damp.native.status();
      const grown = status.objects.find((x) => x.id === plantObj.id);
      note('推进一天后指定品种幼菇长出', !!grown.damage && grown.damage.mushroom === 'young' && grown.mushroomSpecies === sporeSpecies,
        JSON.stringify({ mushroom: grown.damage && grown.damage.mushroom, species: grown.mushroomSpecies }));

      // 6) localStorage 持久化重载（由探针外部执行第二次加载验证）
      return { R, reloadCheck: { charObj: charObj.id, sporeSpecies } };
    })()`;
    const { R, reloadCheck } = await win.webContents.executeJavaScript(script, true);
    for (const [name, ok, detail] of R) step(name, ok, detail);

    // 重载验证持久化
    await win.loadURL(URL + '?reload=1');
    await win.webContents.executeJavaScript('new Promise((r) => setTimeout(r, 1500))', true);
    const after = await win.webContents.executeJavaScript(`(async () => {
      const status = await window.damp.native.status();
      const obj = status.objects.find((o) => o.id === ${JSON.stringify(reloadCheck.charObj)});
      return {
        collected: Object.keys(status.collection).length,
        sporesTotal: Object.values(status.spores).reduce((a, b) => a + b, 0),
        grownSpecies: (() => {
          const found = status.objects.find((o) => o.damage && o.damage.mushroom === 'young');
          return found ? found.mushroomSpecies : null;
        })(),
        charClean: !obj.damage || obj.damage.stage === 0,
      };
    })()`, true);
    step('重载后收藏/长出的幼菇/护理完成仍在（localStorage）', after.collected > 0 && after.grownSpecies === reloadCheck.sporeSpecies && after.charClean, JSON.stringify(after));
    step('无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | '));
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (error) {
    console.error('[flow] failed:', error && (error.stack || error.message));
    process.exitCode = 1;
  } finally {
    app.exit(process.exitCode ?? 0);
  }
});
