/**
 * 阶段1A 原生可行性实测：文件夹/快捷方式图标引用 替换→恢复 往返（Goal v9 R1）
 *
 * 在真实桌面创建临时探针对象（自动清理），验证：
 *  1. desktop.ini 外科级编辑 + 原有内容保留 + 隐藏/系统属性
 *  2. .lnk 仅改 icon 引用，目标/参数等不变
 *  3. 恢复逐字节还原原始值（不是系统默认）
 *  4. 用户改值后恢复保留用户值
 *  5. SHChangeNotify 刷新调用成功（Explorer 可见性配合截图人工核对）
 *
 * 运行：node_modules/.bin/electron scripts/uat-icon-mutate.cjs
 * 退出码 0 = 全部断言通过。截图输出 logs/icon-probe/。
 */
const { app, nativeImage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

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
    return fs.existsSync(outPath);
  } catch (err) {
    console.warn('[probe] 截图失败:', err.message);
    return false;
  }
}

app.whenReady().then(async () => {
  const desktop = path.join(process.env.USERPROFILE || '', '..',  /* 占位 */ '') || '';
  // 真实桌面在 E:\Desktop（项目环境事实）；公共桌面兜底用 USERPROFILE\Desktop
  const realDesktop = 'E:\\Desktop';
  const desktopRoot = fs.existsSync(realDesktop) ? realDesktop : path.join(app.getPath('home'), 'Desktop');
  const stamp = Date.now();
  const probeDir = path.join(desktopRoot, `CD-IconProbe-${stamp}`);
  const logDir = path.join(__dirname, '..', 'logs', 'icon-probe');
  fs.mkdirSync(logDir, { recursive: true });
  // 隔离 userData：恢复登记不污染正式存档
  app.setPath('userData', path.join(os.tmpdir(), `cd-icon-probe-${stamp}`));

  try {
    // ---- 准备探针对象 ----
    fs.mkdirSync(probeDir);
    const iniPath = path.join(probeDir, 'desktop.ini');
    const originalIni = '[.ShellClassInfo]\r\nLocalizedResourceName=探针原值\r\nInfoTip=保留我\r\n';
    fs.writeFileSync(iniPath, originalIni, 'utf8'); // 模拟用户已有自定义内容
    const lnkPath = path.join(desktopRoot, `CD-IconProbe-${stamp}.lnk`);
    shell.writeShortcutLink(lnkPath, 'create', {
      target: probeDir, cwd: probeDir, args: '', description: 'CD icon probe', icon: '', iconIndex: 0,
    });
    const originalLnk = shell.readShortcutLink(lnkPath);
    check('探针 .lnk 创建且无自定义图标', originalLnk.icon === '' && originalLnk.target === probeDir);

    // ---- 生成源 PNG 与 ICO ----
    const size = 256;
    const bmp = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      bmp[i * 4] = 0xe0; bmp[i * 4 + 1] = 0x50; bmp[i * 4 + 2] = 0x20; bmp[i * 4 + 3] = 0xff; // BGRA 橙色
    }
    const png = nativeImage.createFromBitmap(bmp, { width: size, height: size }).toPNG();
    const { writeIcoCache } = require('../dist/main/icon/ico-builder.js');
    const icoPath = await writeIcoCache(png, [`probe-${stamp}`]);
    check('多尺寸 ICO 生成', fs.existsSync(icoPath) && fs.statSync(icoPath).size > 0, icoPath);
    const icoHeader = fs.readFileSync(icoPath).subarray(0, 4);
    check('ICO 文件头合法', icoHeader[0] === 0 && icoHeader[1] === 0 && icoHeader[2] === 1 && icoHeader[3] === 0);

    // ---- 应用变更 ----
    const { applyIconMutation, restoreAllIconReferences, referenceIsOurs } = require('../dist/main/desktop/icon-mutate.js');
    screenshot(path.join(logDir, '0-before.png'));
    const r1 = applyIconMutation({ id: 'probe-dir', realPath: probeDir, kind: 'dir', iconPath: icoPath, eventId: 'uat' });
    check('文件夹应用成功', r1.ok === true, r1.ok ? undefined : r1.reason);
    const iniNow = fs.readFileSync(iniPath, 'utf8');
    check('desktop.ini 保留原有行', iniNow.includes('LocalizedResourceName=探针原值') && iniNow.includes('InfoTip=保留我'));
    check('desktop.ini 指向我们的 ICO', iniNow.includes(`IconResource=${icoPath},0`));
    const r2 = applyIconMutation({ id: 'probe-lnk', realPath: lnkPath, kind: 'lnk', iconPath: icoPath, eventId: 'uat' });
    check('.lnk 应用成功', r2.ok === true, r2.ok ? undefined : r2.reason);
    const lnkNow = shell.readShortcutLink(lnkPath);
    check('.lnk 仅图标变化，目标不变', lnkNow.icon.toLowerCase() === icoPath.toLowerCase() && lnkNow.target === probeDir && lnkNow.description === 'CD icon probe');
    check('引用核对 referenceIsOurs', referenceIsOurs(probeDir, 'dir', icoPath) && referenceIsOurs(lnkPath, 'lnk', icoPath));
    screenshot(path.join(logDir, '1-applied.png'));

    // ---- 用户改值分支：直接改 .lnk 图标后要求恢复 ----
    shell.writeShortcutLink(lnkPath, 'update', { ...lnkNow, icon: 'C:\\Windows\\System32\\shell32.dll', iconIndex: 3 });
    const reportsUser = restoreAllIconReferences();
    const lnkReport = reportsUser.find((r) => r.realPath === lnkPath);
    check('用户改值 → 保留用户值', lnkReport?.outcome === 'kept-user-value', lnkReport?.detail);
    const lnkAfterUser = shell.readShortcutLink(lnkPath);
    check('用户值未被覆盖', lnkAfterUser.icon === 'C:\\Windows\\System32\\shell32.dll');
    // 同一次恢复中，未被动过的文件夹应已恢复原值（restoreAll 处理全部登记）
    const dirReport = reportsUser.find((r) => r.realPath === probeDir);
    check('文件夹恢复执行', dirReport?.outcome === 'restored', dirReport?.detail);

    // ---- 正常恢复 ----
    const reports = restoreAllIconReferences();
    const dirReport2 = reports.find((r) => r.realPath === probeDir);
    check('文件夹登记已清（无重复处理）', dirReport2 === undefined);
    const iniRestored = fs.readFileSync(iniPath);
    check('desktop.ini 逐字节还原', iniRestored.equals(Buffer.from(originalIni, 'utf8')));
    check('desktop.ini 属性还原（无 hidden/system 残留）', (() => {
      const attrs = fs.statSync(iniPath).attributes & 0x6; // HIDDEN|SYSTEM
      return attrs === 0;
    })());
    screenshot(path.join(logDir, '2-restored.png'));

    // 恢复后的 .lnk 已在"用户改值"分支被移出登记，此处手动验证恢复原值路径：
    // 此时的"原始值"是用户改值分支留下的 shell32.dll 图标
    const r3 = applyIconMutation({ id: 'probe-lnk2', realPath: lnkPath, kind: 'lnk', iconPath: icoPath, eventId: 'uat' });
    check('.lnk 二次应用成功', r3.ok === true, r3.ok ? undefined : r3.reason);
    const reports2 = restoreAllIconReferences();
    const lnkReport2 = reports2.find((r) => r.realPath === lnkPath);
    check('.lnk 恢复原值', lnkReport2?.outcome === 'restored', lnkReport2?.detail);
    const lnkRestored = shell.readShortcutLink(lnkPath);
    check('.lnk 图标回到该次快照原值（shell32.dll,3）', lnkRestored.icon === 'C:\\Windows\\System32\\shell32.dll' && lnkRestored.iconIndex === 3 && lnkRestored.target === probeDir);

    // ---- 登记清空核对 ----
    const store = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'icon-restores.json'), 'utf8'));
    check('恢复登记已清空', Array.isArray(store.entries) && store.entries.length === 0);

    // ---- 汇总 ----
    const failed = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(logDir, 'results.json'), JSON.stringify({ results, icoPath, logDir }, null, 2));
    console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} PASS`);
    if (failed.length) console.log('FAILED:', failed.map((f) => f.name).join('; '));
  } finally {
    // 清理探针对象（本脚本创建的内容）
    try { fs.rmSync(probeDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(lnkPath, { force: true }); } catch {}
  }
  app.exit(results.some((r) => !r.ok) ? 1 : 0);
});
