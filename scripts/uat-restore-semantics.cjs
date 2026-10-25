/**
 * R1/A19 恢复语义探针（真实桌面 + 隔离存档 + 探针对象，自动清理）
 *
 * 覆盖"删除/移动后不复活、不覆盖新同名对象、用户改值保留"三个此前
 * 未实测的恢复分支：
 *  1. 用户自行改值 → 恢复保留用户值（文件夹版）
 *  2. 对象删除后恢复 → missing，不复活
 *  3. 同路径新对象（旧对象删除后重建）→ 恢复不得覆盖新对象的原始内容
 *  4. 对象改名/移动后恢复 → missing（旧路径不复活）
 *
 * 运行：node_modules/.bin/electron scripts/uat-restore-semantics.cjs
 */
const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readIni(dir) {
  return fs.readFileSync(path.join(dir, 'desktop.ini'));
}

app.whenReady().then(async () => {
  const realDesktop = fs.existsSync('E:\\Desktop') ? 'E:\\Desktop' : path.join(app.getPath('home'), 'Desktop');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-rst-data-'));
  app.setPath('userData', dataDir);
  process.env.CD_UAT = '1';
  process.env.CD_UAT_DATA_DIR = dataDir;

  const stamp = Date.now();
  const dirUser = path.join(realDesktop, `CD-RstProbe-A-${stamp}`);
  const dirDelete = path.join(realDesktop, `CD-RstProbe-B-${stamp}`);
  const dirReplace = path.join(realDesktop, `CD-RstProbe-C-${stamp}`);
  const dirMove = path.join(realDesktop, `CD-RstProbe-D-${stamp}`);
  const customIni = (label) => `[.ShellClassInfo]\r\nLocalizedResourceName=恢复语义探针 ${label}\r\n`;

  const notify = require('../dist/main/desktop/win32-icon-notify.js');
  const { applyIconMutation, restoreIconReferences } = await import('../dist/main/desktop/icon-mutate.js');
  const { writeIcoCache } = await import('../dist/main/icon/ico-builder.js');
  const { composeStateIconPng } = await import('../dist/main/icon/state-icon.js');

  async function makeIco(name) {
    // 真实 256px PNG → 多尺寸 ICO（内容寻址缓存），供引用写入
    const png = await composeStateIconPng(
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
      null, name);
    return writeIcoCache(png, ['rst-probe', name]);
  }

  const created = [];
  function createProbe(dir, label) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'desktop.ini'), customIni(label), 'utf8');
    created.push(dir);
    return { id: `d-rst-${label}`, realPath: dir, kind: 'dir' };
  }

  try {
    notify.notifyDirChanged(realDesktop);
    await sleep(800);
    const icoA = await makeIco('A');
    const icoB = await makeIco('B');
    const icoC = await makeIco('C');
    const icoD = await makeIco('D');

    // ---- 场景 1：用户自行改值 → 保留用户值 ----
    const pA = createProbe(dirUser, 'A');
    let r = applyIconMutation({ ...pA, iconPath: icoA, eventId: 'rst' });
    check('场景1 初始应用成功', r.ok === true, r.reason);
    check('场景1 引用已写入', (() => {
      // encodeIni 按原文件编码回写（utf8 或 utf16le），按 BOM 检测解码后再断言
      const b = readIni(dirUser);
      const text = (b[0] === 0xff && b[1] === 0xfe) ? b.toString('utf16le') : b.toString('utf8');
      return text.includes('IconResource=');
    })(), readIni(dirUser).slice(0, 80).toString('hex'));
    // 用户把 IconResource 改成自己的图标（先归一化属性再写）
    notify.setFileAttributes(path.join(dirUser, 'desktop.ini'), 0x80);
    const userIni = `[.ShellClassInfo]\r\nIconResource=C:\\Users\\Public\\user-custom.ico,0\r\n`;
    fs.writeFileSync(path.join(dirUser, 'desktop.ini'), userIni, 'utf8');
    r = restoreIconReferences({ ids: [pA.id] })[0];
    check('场景1 恢复保留用户值', r.outcome === 'kept-user-value', r.outcome + ' ' + (r.detail ?? ''));
    check('场景1 用户内容未被覆盖', readIni(dirUser).toString('utf8') === userIni);

    // ---- 场景 2：对象删除 → missing 不复活 ----
    const pB = createProbe(dirDelete, 'B');
    r = applyIconMutation({ ...pB, iconPath: icoB, eventId: 'rst' });
    check('场景2 初始应用成功', r.ok === true, r.reason);
    fs.rmSync(dirDelete, { recursive: true, force: true });
    notify.notifyDirChanged(realDesktop);
    await sleep(600);
    r = restoreIconReferences({ ids: [pB.id] })[0];
    check('场景2 删除后恢复报 missing', r.outcome === 'missing', r.outcome);
    check('场景2 不复活对象', !fs.existsSync(dirDelete));

    // ---- 场景 3：同路径新对象 → 不覆盖其原始内容 ----
    const pC = createProbe(dirReplace, 'C');
    r = applyIconMutation({ ...pC, iconPath: icoC, eventId: 'rst' });
    check('场景3 初始应用成功', r.ok === true, r.reason);
    // 旧对象删除，用户新建一个同名文件夹（无我们的引用）
    fs.rmSync(dirReplace, { recursive: true, force: true });
    notify.notifyDirChanged(realDesktop);
    await sleep(600);
    fs.mkdirSync(dirReplace, { recursive: true });
    const newUserIni = `[.ShellClassInfo]\r\nLocalizedResourceName=用户新建的文件夹\r\n`;
    fs.writeFileSync(path.join(dirReplace, 'desktop.ini'), newUserIni, 'utf8');
    created.push(dirReplace);
    r = restoreIconReferences({ ids: [pC.id] })[0];
    check('场景3 新同名对象不被覆盖为旧值', r.outcome !== 'restored', r.outcome);
    check('场景3 新同名对象内容原样', readIni(dirReplace).toString('utf8') === newUserIni);
    check('场景3 新同名对象仍存在', fs.existsSync(dirReplace));

    // ---- 场景 4：对象改名/移动 → missing，旧路径不复活 ----
    const pD = createProbe(dirMove, 'D');
    r = applyIconMutation({ ...pD, iconPath: icoD, eventId: 'rst' });
    check('场景4 初始应用成功', r.ok === true, r.reason);
    const dirMoved = dirMove + '-moved';
    fs.renameSync(dirMove, dirMoved);
    created.push(dirMoved);
    notify.notifyDirChanged(realDesktop);
    await sleep(600);
    r = restoreIconReferences({ ids: [pD.id] })[0];
    check('场景4 移动后恢复报 missing', r.outcome === 'missing', r.outcome);
    check('场景4 旧路径不复活', !fs.existsSync(dirMove));
    check('场景4 移动后的新位置仍在', fs.existsSync(dirMoved));

    const failed = results.filter((x) => !x.ok);
    console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} PASS`);
    app.exit(failed.length ? 1 : 0);
  } catch (error) {
    check('探针异常', false, error.stack ?? error.message);
    console.log('SUMMARY: 0/1 PASS');
    app.exit(1);
  } finally {
    // 尽力恢复并清理全部探针对象（场景内部已逐个处理，这里兜底）
    try { restoreIconReferences(); } catch { /* 尽力 */ }
    await sleep(400);
    for (const dir of created) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不阻塞 */ }
    }
    notify.notifyDirChanged(realDesktop);
  }
});
