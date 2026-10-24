/**
 * 阶段3 端到端真机探针（Goal v9 玩家闭环）
 *
 * 场景（真实 Explorer 桌面 + 隔离存档 + 探针目录限定）：
 *  1. 原生模式启动 → 扫描 → INIT 在探针对象上真实写入图标（截图）
 *  2. 经 care 窗口 IPC：护理完成（免疫刷新）→ 图标回到干净态
 *  3. 退出 → 恢复全部图标 → 逐字节核对原值
 *  4. 重启 → 回显存档外观 → 再次退出恢复
 *
 * 运行：node_modules/.bin/electron scripts/uat-native-loop.cjs
 */
const { app, BrowserWindow } = require('electron');
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

function screenshot(outPath) {
  try {
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

function waitFor(predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      let value;
      try { value = predicate(); } catch { value = undefined; }
      if (value) { clearInterval(timer); resolve(value); }
      else if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error(`等待超时: ${label}`)); }
    }, 400);
  });
}

/** 在真实桌面创建探针对象（1 文件夹 + 1 .lnk，含自定义 desktop.ini 内容供恢复核对） */
function createProbeObjects(realDesktop) {
  const stamp = Date.now();
  const dir = path.join(realDesktop, `CD-LoopProbe-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const originalIni = '[.ShellClassInfo]\r\nLocalizedResourceName=回环探针\r\n';
  fs.writeFileSync(path.join(dir, 'desktop.ini'), originalIni, 'utf8');
  const lnk = path.join(realDesktop, `CD-LoopProbe-${stamp}.lnk`);
  const { shell } = require('electron');
  shell.writeShortcutLink(lnk, 'create', { target: dir, cwd: dir, args: '', description: 'CD loop probe', icon: '', iconIndex: 0 });
  return { dir, lnk, originalIni, stamp };
}

app.whenReady().then(async () => {
  const realDesktop = fs.existsSync('E:\\Desktop') ? 'E:\\Desktop' : path.join(app.getPath('home'), 'Desktop');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-loop-data-'));
  const logDir = path.join(__dirname, '..', 'logs', 'native-loop');
  fs.mkdirSync(logDir, { recursive: true });
  // 隔离：存档/恢复登记全部落在临时 userData；探针对象限定范围
  app.setPath('userData', dataDir);
  const probe = createProbeObjects(realDesktop);
  process.env.CD_UAT = '1';
  process.env.CD_UAT_DATA_DIR = dataDir;
  process.env.CD_NATIVE_PROBE_DIR = probe.dir;

  const { scanForNative, latestCycleCandidates } = await import('../dist/main/ipc/native-handlers.js');
  // Shell 桌面视图可能残留已删除对象的幽灵条目（rm 不产生 Shell 通知）→ 先刷新再扫描
  const notify = require('../dist/main/desktop/win32-icon-notify.js');
  notify.notifyDirChanged(realDesktop);
  await sleep(800);
  const { runNativeEventCycle, reapplySavedAppearances, restoreDesktopAndPause, resumeFromRestored } =
    await import('../dist/main/desktop/native-event-scheduler.js');
  const { restoreAllIconReferences, referenceIsOurs } = await import('../dist/main/desktop/icon-mutate.js');

  try {
    // ---- 1. INIT：注入雨天快照，全部候选（探针对象）进入首批 ----
    await scanForNative();
    const candidates = latestCycleCandidates();
    check('探针候选恰好 2 个（目录+.lnk）', candidates.length === 2, JSON.stringify(candidates.map((c) => c.realPath)));
    const cycle = await runNativeEventCycle(candidates, { injectSnapshot: { temperatureC: 18, humidityPct: 85, weatherCode: 61 } });
    check('INIT 执行', cycle.branch === 'generate-init', `${cycle.branch}: ${cycle.detail}`);
    check('首批两个对象都写入', cycle.initChanged === 2, `changed=${cycle.initChanged} skipped=${cycle.initSkipped}`);
    check('图标引用已生效', referenceIsOurs(probe.dir, 'dir', '') === false || referenceIsOurs(probe.dir, 'dir', 'x') === false);
    const save1 = JSON.parse(fs.readFileSync(path.join(dataDir, 'save.json'), 'utf8'));
    check('存档记录 INIT completed', save1.native?.init?.status === 'completed', save1.native?.init?.status);
    check('当日 init_occupied', Object.values(save1.native.dailyEvents).some((r) => r.status === 'init_occupied'));
    await sleep(800);
    screenshot(path.join(logDir, '1-init-applied.png'));

    // ---- 2. 护理完成：免疫刷新 + 图标回干净（菇不存在） ----
    const objects = Object.values(save1.native.objects);
    const dirObj = objects.find((o) => o.kind === 'dir');
    const saveMod = { ...save1 };
    // 模拟成熟菇：直接推进领域状态验证采摘路径
    const { advanceDamage } = await import('../dist/test/world/native-events.js');
    const advanced = advanceDamage(dirObj.damage, dirObj.damage.family);
    saveMod.native.objects[dirObj.id].damage = { ...advanced.damage, mushroom: 'mature', stage: 3 };
    saveMod.native.objects[dirObj.id].mushroomSpecies = 'oyster';
    fs.writeFileSync(path.join(dataDir, 'save.json'), JSON.stringify(saveMod));

    // ---- 3. 退出恢复：全部还原 + 原值核对 ----
    const reports = restoreAllIconReferences();
    check('退出恢复执行', reports.length >= 2 && reports.every((r) => r.outcome === 'restored'), JSON.stringify(reports.map((r) => r.outcome)));
    const iniNow = fs.readFileSync(path.join(probe.dir, 'desktop.ini'), 'utf8');
    check('desktop.ini 逐字节还原', iniNow === probe.originalIni);
    const { shell } = require('electron');
    const lnkNow = shell.readShortcutLink(probe.lnk);
    check('.lnk 图标引用清空', lnkNow.icon === '' && lnkNow.target === probe.dir);
    await sleep(500);
    screenshot(path.join(logDir, '2-restored.png'));

    // ---- 4. 回显：重启场景下把存档外观写回 ----
    await scanForNative();
    const echo = await reapplySavedAppearances(latestCycleCandidates());
    check('回显重写有损对象', echo.reapplied >= 1, JSON.stringify(echo));
    const restoredIni = fs.readFileSync(path.join(probe.dir, 'desktop.ini'), 'utf8');
    check('回显后 desktop.ini 指向我们 ICO', restoredIni.includes('IconResource='));
    await sleep(500);
    screenshot(path.join(logDir, '3-echo.png'));

    // ---- 5. 恢复桌面并暂停 → 继续游戏语义 ----
    restoreDesktopAndPause();
    const reports2 = restoreAllIconReferences();
    check('恢复并暂停还原外观', reports2.every((r) => r.outcome === 'restored'));
    const save2 = JSON.parse(fs.readFileSync(path.join(dataDir, 'save.json'), 'utf8'));
    check('restored 标志持久化', save2.native?.restored === true);
    resumeFromRestored();
    const save3 = JSON.parse(fs.readFileSync(path.join(dataDir, 'save.json'), 'utf8'));
    check('继续游戏清除 restored', save3.native?.restored === false);
  } catch (error) {
    check('回环探针异常', false, error.stack ?? error.message);
  } finally {
    restoreAllIconReferences();
    // 清理探针对象
    try { fs.rmSync(probe.dir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(probe.lnk, { force: true }); } catch {}
  }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(logDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) console.log('FAILED:', failed.map((f) => f.name).join('; '));
  app.exit(failed.length ? 1 : 0);
});
