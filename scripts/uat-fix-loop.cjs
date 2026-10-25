/**
 * Goal 修复轮模块级探针（真实 Shell 桌面 + 隔离存档 + 探针对象限定）
 *
 * 覆盖本轮四项修复的模块级行为（窗口/输入层由 uat-fix-app 步骤另测）：
 *  1. 原始基准像素：INIT 写入 → 不恢复（模拟崩溃）→ 重扫描（此时桌面图标
 *     已是我们的损伤态）→ 回显；断言新 ICO 与旧 ICO 内容寻址同路径
 *     （= 从同一份原图合成，未把损伤叠进损伤）。
 *  2. 换族：护理完成（stage 0 + 保留成熟菇）→ 次日干燥高温事件 →
 *     对象按当日天气换族推进且菇保留。
 *  3. 常驻跨日：注入时钟的 resident-watch 只在日期键变化时触发一次检查，
 *     同日多 tick 不重复。
 *  4. 原始基准对渲染层的供给：pristineDataUrlFor 返回基准 PNG。
 *
 * 运行：node_modules/.bin/electron scripts/uat-fix-loop.cjs
 */
const { app, shell } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RAINY = { temperatureC: 18, humidityPct: 85, weatherCode: 61 };
const DRY_HOT = { temperatureC: 35, humidityPct: 40, weatherCode: 0 };

app.whenReady().then(async () => {
  const realDesktop = fs.existsSync('E:\\Desktop') ? 'E:\\Desktop' : path.join(app.getPath('home'), 'Desktop');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-fix-data-'));
  const logDir = path.join(__dirname, '..', 'logs', 'native-fix');
  fs.mkdirSync(logDir, { recursive: true });
  app.setPath('userData', dataDir);
  process.env.CD_UAT = '1';
  process.env.CD_UAT_DATA_DIR = dataDir;

  const stamp = Date.now();
  const probeDir = path.join(realDesktop, `CD-FixProbe-${stamp}`);
  fs.mkdirSync(probeDir, { recursive: true });
  const originalIni = '[.ShellClassInfo]\r\nLocalizedResourceName=修复轮探针\r\n';
  fs.writeFileSync(path.join(probeDir, 'desktop.ini'), originalIni, 'utf8');
  const lnk = path.join(realDesktop, `CD-FixProbe-${stamp}.lnk`);
  shell.writeShortcutLink(lnk, 'create', { target: probeDir, cwd: probeDir, args: '', description: 'CD fix probe', icon: '', iconIndex: 0 });
  process.env.CD_NATIVE_PROBE_DIR = probeDir;

  const { scanForNative, latestCycleCandidates } = await import('../dist/main/ipc/native-handlers.js');
  const notify = require('../dist/main/desktop/win32-icon-notify.js');
  const { runNativeEventCycle, reapplySavedAppearances, pristineDataUrlFor } =
    await import('../dist/main/desktop/native-event-scheduler.js');
  const { restoreAllIconReferences } = await import('../dist/main/desktop/icon-mutate.js');
  const restoreStore = require('../dist/main/desktop/icon-restore-store.js');
  const { completeCare } = await import('../dist/world/native-care.js');

  const savePath = () => path.join(dataDir, 'save.json');
  const readSave = () => JSON.parse(fs.readFileSync(savePath(), 'utf8'));

  try {
    notify.notifyDirChanged(realDesktop);
    await sleep(800);

    // ---- 1. INIT 在探针对象上写入 ----
    await scanForNative();
    let cycle = await runNativeEventCycle(latestCycleCandidates(), { injectSnapshot: RAINY });
    check('INIT 执行且两对象写入', cycle.branch === 'generate-init' && cycle.initChanged === 2, `${cycle.branch} ${cycle.detail}`);
    const save1 = readSave();
    const dirObj = Object.values(save1.native.objects).find((o) => o.kind === 'dir');
    const lnkObj = Object.values(save1.native.objects).find((o) => o.kind === 'lnk');
    check('探针对象进入首批', Boolean(dirObj && lnkObj));

    // ---- 2. 崩溃模拟：不恢复 → 重扫描（图标已是我们的损伤态）→ 回显 ----
    const entryBefore = restoreStore.findEntry(probeDir);
    const icoBefore = entryBefore ? entryBefore.appliedIconPath : null;
    check('INIT 后有恢复登记与 ICO 路径', Boolean(icoBefore), String(icoBefore));
    await scanForNative(); // 此时扫描到的 iconDataUrl 已是损伤图标像素
    const echo = await reapplySavedAppearances(latestCycleCandidates());
    check('回显重写有损对象', echo.reapplied >= 1, JSON.stringify(echo));
    const entryAfter = restoreStore.findEntry(probeDir);
    // 内容寻址路径受 key 组成影响（预热 key 含 species），跨路径比较必须比字节：
    // 基准同为原图时，同状态合成出的 ICO 字节完全一致；损伤叠加则必不同。
    const icoAfter = entryAfter && entryAfter.appliedIconPath;
    const bytesBefore = icoBefore ? fs.readFileSync(icoBefore) : null;
    const bytesAfter = icoAfter ? fs.readFileSync(icoAfter) : null;
    check('回显后 ICO 字节一致（无损伤叠加）', Boolean(bytesBefore && bytesAfter) && bytesBefore.equals(bytesAfter),
      `${icoBefore}(${bytesBefore && bytesBefore.length}) -> ${icoAfter}(${bytesAfter && bytesAfter.length})`);
    const dataUrl = pristineDataUrlFor(dirObj.id, dirObj.realPath, '');
    check('pristineDataUrlFor 提供基准原图', dataUrl.startsWith('data:image/png;base64,') && dataUrl.length > 1000, `len=${dataUrl.length}`);

    // ---- 3. 换族：护理完成（保留成熟菇）→ 次日干燥高温 ----
    const saveCare = readSave();
    saveCare.native.objects[dirObj.id].damage = { family: 'mold', stage: 3, mushroom: 'mature' };
    fs.writeFileSync(savePath(), JSON.stringify(saveCare));
    const careNow = Date.now();
    const careState = readSave();
    const careResult = completeCare(careState.native, dirObj.id, careNow);
    check('completeCare 成功', careResult.ok === true, careResult.error);
    // 另一对象设为干燥日不可入选的终态（重霉+成熟菇），保证当日配额确定性落在被清理对象上
    careState.native.objects[lnkObj.id].damage = { family: 'mold', stage: 3, mushroom: 'mature' };
    fs.writeFileSync(savePath(), JSON.stringify(careState)); // completeCare 是纯函数，落盘由调用方负责
    const afterCare = readSave().native.objects[dirObj.id];
    check('护理后 stage 0 且保留成熟菇', afterCare.damage.stage === 0 && afterCare.damage.mushroom === 'mature',
      JSON.stringify(afterCare.damage));
    await scanForNative();
    const nextDay = careNow + 24 * 60 * 60 * 1000 + 60 * 1000;
    cycle = await runNativeEventCycle(latestCycleCandidates(), { injectSnapshot: DRY_HOT, now: nextDay });
    check('次日 DAILY 创建', cycle.branch === 'daily-create', `${cycle.branch} ${cycle.detail}`);
    const save3 = readSave();
    const todayKey = Object.keys(save3.native.dailyEvents).pop();
    check('当日记录 success', save3.native.dailyEvents[todayKey].status === 'success');
    const advanced = Object.values(save3.native.objects).find((o) => (o.lastAdvanceAt ?? 0) >= nextDay);
    check('换族推进且不被旧 mold 族锁死', advanced && ['damp', 'char'].includes(advanced.damage.family),
      advanced ? advanced.damage.family : '无推进对象');
    check('换族保留未采摘的成熟菇', advanced && advanced.damage.mushroom === 'mature', advanced && advanced.damage.mushroom);
    check('已清理对象重新进入轻度', advanced && advanced.damage.stage === 1, String(advanced && advanced.damage.stage));

    // ---- 4. 常驻跨日（注入时钟）：同日多 tick 不触发，跨日只触发一次 ----
    const { installResidentWatch } = await import('../dist/main/desktop/resident-watch.js');
    let clock = careNow;
    const calls = [];
    const uninstall = installResidentWatch(
      { runCheck: async (reason) => { calls.push(reason); } },
      { now: () => clock, tickMs: 70 },
    );
    await sleep(400); // 同日若干 tick
    check('同日 tick 不触发检查', calls.length === 0, calls.join(','));
    clock = clock + 24 * 60 * 60 * 1000 + 60 * 1000; // 跨日
    await sleep(400);
    check('跨日恰好触发一次检查', calls.length === 1 && calls[0] === '跨日', calls.join(','));
    await sleep(300); // 新的一天再 tick
    check('跨日后同日不重复触发', calls.length === 1, calls.join(','));
    uninstall();
  } catch (error) {
    check('修复轮探针异常', false, error.stack ?? error.message);
  } finally {
    try { restoreAllIconReferences(); } catch { /* 尽力恢复 */ }
    try { fs.rmSync(probeDir, { recursive: true, force: true }); } catch { /* 清理 */ }
    try { fs.rmSync(lnk, { force: true }); } catch { /* 清理 */ }
    notify.notifyDirChanged(realDesktop);
  }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(logDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) console.log('FAILED:', failed.map((f) => f.name).join('; '));
  app.exit(failed.length ? 1 : 0);
});
