/**
 * 晾衣绳护理台端到端探针（0.1.29）：真实 care.html + 真实 preload + 真实 native IPC + 临时存档。
 * 图标用 Shell 只读提取的 Windows 自带对象（同扫描管线的像素来源）；对象路径指向不存在的探针目录，
 * 图标写入必然失败并只记日志，不改任何真实桌面引用。
 * 鼠标经 webContents.sendInputEvent（Chromium 输入管线）注入，不等于 Windows 原生输入验收。
 * 输出截图到 previews/clothesline-0.1.29/。
 *
 * 运行（需先 npm run build）：node_modules/.bin/electron scripts/uat-clothesline.cjs
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-clothesline-'));
app.setPath('userData', dataDir);
const savePath = path.join(dataDir, 'save.json');
const readSave = () => JSON.parse(fs.readFileSync(savePath, 'utf8'));
const shotDir = path.join(root, 'previews', 'clothesline-0.1.29');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`); };

const PROBE = 'C:\\CD-clothesline-probe';
const SOURCES = [
  ['folder', '项目资料', 'C:\\Windows', { family: 'mold', stage: 3, mushroom: 'mature' }, 'archive'],
  ['explorer', '此电脑', 'C:\\Windows\\explorer.exe', { family: 'damp', stage: 2, mushroom: 'none' }],
  ['notepad', '记事本', 'C:\\Windows\\System32\\notepad.exe', { family: 'char', stage: 2, mushroom: 'none' }],
  ['paint', '画图', 'C:\\Windows\\System32\\mspaint.exe', { family: 'mold', stage: 2, mushroom: 'young' }, 'waterfall'],
  ['cmd', '终端', 'C:\\Windows\\System32\\cmd.exe', { family: 'mold', stage: 0, mushroom: 'mature' }, 'broken'],
  ['control', '控制面板', 'C:\\Windows\\System32\\control.exe', { family: 'damp', stage: 1, mushroom: 'none' }],
  ['taskmgr', '任务管理器', 'C:\\Windows\\System32\\Taskmgr.exe', { family: 'char', stage: 1, mushroom: 'none' }],
  ['charmap', '字符映射', 'C:\\Windows\\System32\\charmap.exe', { family: 'mold', stage: 1, mushroom: 'none' }],
  ['regedit', '注册表', 'C:\\Windows\\regedit.exe', { family: 'damp', stage: 3, mushroom: 'none' }],
  ['calc', '计算器', 'C:\\Windows\\System32\\calc.exe', { family: 'char', stage: 3, mushroom: 'none' }],
  ['mstsc', '远程桌面', 'C:\\Windows\\System32\\mstsc.exe', { family: 'damp', stage: 1, mushroom: 'none' }],
];

app.whenReady().then(async () => {
  const { queryShellIcons } = require(path.join(root, 'dist/main/desktop/shell-icons.js'));
  const icons = await queryShellIcons(SOURCES.map(([, , p]) => ({ path: p })));
  const objects = {};
  const entries = [];
  const firstIcon = icons.find(Boolean);
  SOURCES.forEach(([id, name, , damage, species], i) => {
    // 部分系统程序（UWP 化的计算器等）Shell 提取不到：借用第一张图标，夹具数量保持不变
    const px = icons[i] ?? firstIcon;
    if (!px) return;
    const url = nativeImage.createFromBitmap(Buffer.from(px.pixels), { width: px.width, height: px.height }).toDataURL();
    objects[id] = { id, realPath: `${PROBE}\\${id}`, kind: 'dir', displayName: name, originalMtime: 1 + i, damage, careProgress: 0, moldImmuneUntil: 0, lastAdvanceAt: 100 - i, ...(species ? { mushroomSpecies: species } : {}) };
    entries.push({ id, name, ext: '', category: 'folder', sizeBytes: 0, mtime: 1, realPath: `${PROBE}\\${id}`, kind: 'dir', iconDataUrl: url, displayName: name, geometry: { x: 20, y: 10 + i * 90, size: 48, labelX: 0, labelY: 0, labelWidth: 0, labelHeight: 0 } });
  });
  fs.writeFileSync(savePath, JSON.stringify({
    schemaVersion: 3, savedAt: Date.now(),
    player: { coins: 24, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'chongqing', migratedOn: '2026-10-26' }, files: [], ropes: [], stats: { harvested: 0, earned: 0, playedMs: 0 },
    native: {
      init: { status: 'completed', k: 1, n: 1, seed: 1, targets: [], snapshot: { temperatureC: 18, humidityPct: 92, weatherCode: 61, observedAt: '2026-10-26T09:40', fetchedAt: Date.now() }, generatedAt: 1, completedAt: 2 },
      onboarded: true, dailyEvents: {}, objects,
      lastSnapshot: { temperatureC: 18, humidityPct: 92, weatherCode: 61, observedAt: '2026-10-26T09:40', fetchedAt: Date.now() },
      location: { cityId: '1814906', label: '重庆市', latitude: 29.56, longitude: 106.55 },
      alert: { active: true, precipitationStreak: 3, startedAt: Date.now(), endsAt: Date.now() + 86400e3, reason: 'humidity' },
    },
  }), 'utf8');

  const nh = require(path.join(root, 'dist/main/ipc/native-handlers.js'));
  nh.updateNativeEntries(entries);
  const win = new BrowserWindow({
    width: 900, height: 640, useContentSize: true, show: true, frame: false,
    webPreferences: { preload: path.join(root, 'dist/preload/index.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false },
  });
  nh.registerNativeHandlers(() => win.webContents);
  require(path.join(root, 'dist/main/ipc/wallpaper-handlers.js')).registerWallpaperHandlers(() => win.webContents);
  const errors = [];
  win.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
  const exec = (code) => win.webContents.executeJavaScript(code);
  const info = () => exec('window.__clothesline.info()');
  const shot = async (name) => { fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, name), (await win.webContents.capturePage()).toPNG()); };
  const send = (type, x, y) => win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...(type === 'mouseMove' ? { modifiers: ['leftButtonDown'] } : {}) });
  async function scrubArea(passes, from = 0.06, to = 0.94) {
    const r = await exec(`(() => { const c = document.querySelector('#cl-wipe canvas'); const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
    const [x, y, w, h] = r;
    for (let p = 0; p < passes; p += 1) {
      const row = y + h * (from + (to - from) * (p / Math.max(1, passes - 1)));
      send('mouseDown', x + 2, row);
      for (let i = 0; i <= 16; i += 1) { send('mouseMove', x + 2 + (w - 4) * (i / 16), row); await sleep(10); }
      send('mouseUp', x + w - 2, row);
      await sleep(40);
    }
    await sleep(400);
  }
  const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } return false; };

  try {
    await win.loadFile(path.join(root, 'dist/renderer/care.html'));
    await sleep(2200);
    const mode = await exec(`({ cl: document.body.classList.contains('cl-mode'), tabs: getComputedStyle(document.getElementById('tabs')).display, scene: !!document.getElementById('cl-stage') })`);
    check('护理台默认进入晾衣绳场景（旧页签隐藏）', mode.cl && mode.scene && mode.tabs === 'none', JSON.stringify(mode));
    let st = await info();
    check('主绳最多挂 9 件，按优先级（成熟菇在前）', st.main.length === 9 && st.main[0] === 'folder' && st.main.includes('cmd'), st.main.join(','));
    check('其余收在衣篓并提示数量', /还有 2 件/.test(st.pending), st.pending);
    const note = await exec(`document.querySelector('#cl-note').innerText`);
    check('天气便签显示城市、湿度与警报', note.includes('重庆市') && note.includes('92') && await exec(`getComputedStyle(document.querySelector('#cl-note .stamp')).display !== 'none'`), note.replace(/\s+/g, ' ').slice(0, 60));
    await shot('1-idle.png');

    // 1. 受潮对象：拽下 → 拿海绵 → 擦一半 → 松手保存
    await exec(`window.__clothesline.pull(${st.main.indexOf('explorer')})`);
    check('拽下的对象进入搪瓷盆', await waitFor(async () => (await info()).current === 'explorer' && !!(await exec(`!!document.querySelector('#cl-wipe canvas')`))));
    await exec('window.__clothesline.selectTool(0)');
    await scrubArea(2, 0.4, 0.55);
    const half = readSave().native.objects.explorer;
    const partial = (await info()).progress;
    check('部分擦拭不会自动完成', half.damage.stage === 2 && partial > 0.05 && partial < 0.9, `progress=${partial?.toFixed(2)}`);
    check('松手后进度与掩码写入存档', half.careProgress > 0.05 && typeof half.careMask === 'string', `progress=${half.careProgress?.toFixed(2)}`);
    await shot('2-wipe.png');

    // 2. 关窗重开：进度恢复（掩码按格还原，不缩水）
    await win.webContents.reload();
    await sleep(2200);
    await waitFor(async () => !!(await exec('!!window.__clothesline')) && (await info()).main.length > 0, 6000);
    st = await info();
    await exec(`window.__clothesline.pull(${st.main.indexOf('explorer')})`);
    await waitFor(async () => (await info()).current === 'explorer');
    await sleep(500);
    const restored = (await info()).progress;
    check('重开后进度从掩码恢复', restored >= half.careProgress - 0.02, `存档=${half.careProgress.toFixed(2)} 恢复=${restored?.toFixed(2)}`);

    // 3. 擦完自动收尾 → 完成 → 挂去晒太阳
    await exec('window.__clothesline.selectTool(1)');
    await scrubArea(22);
    const done = await waitFor(() => readSave().native.objects.explorer.damage.stage === 0, 6000);
    const ex = readSave().native.objects.explorer;
    check('≥90% 自动收尾并完成护理（损伤清零、写 240h 防霉）', done && ex.moldImmuneUntil > Date.now() + 239 * 3600e3, `stage=${ex.damage.stage}`);
    check('完成后挂到晒太阳的短绳', await waitFor(async () => (await info()).sun.includes('explorer'), 4000), JSON.stringify((await info()).sun));
    st = await info();
    check('衣篓里的下一件补上主绳', st.main.length === 9 && /还有 1 件/.test(st.pending), `${st.main.length} · ${st.pending}`);

    // 4. 干净但长着成熟菇：拽下 → 剪刀 → 一刀划过虚线 → 收菇结算
    const coinsBefore = readSave().player.coins;
    await exec(`window.__clothesline.pull(${st.main.indexOf('cmd')})`);
    await waitFor(async () => (await info()).current === 'cmd');
    await exec('window.__clothesline.selectTool(3)');
    await sleep(200);
    const line = await exec(`(() => { const b = document.getElementById('cl-cutline').getBoundingClientRect(); return [b.left, b.top, b.width]; })()`);
    send('mouseDown', line[0] + line[2] / 2, line[1] - 30);
    for (let i = 0; i <= 10; i += 1) { send('mouseMove', line[0] + line[2] / 2, line[1] - 30 + i * 6); await sleep(16); }
    send('mouseUp', line[0] + line[2] / 2, line[1] + 30);
    const cut = await waitFor(() => readSave().native.objects.cmd.damage.mushroom === 'none', 4000);
    const cmd = readSave().native.objects.cmd;
    check('剪刀采摘：菇收下、+4 菇币、品种入收藏', cut && readSave().player.coins === coinsBefore + 4 && !!readSave().native.collection?.broken, `coins ${coinsBefore}→${readSave().player.coins}`);
    check('采摘不改损伤（stage 保持 0）', cmd.damage.stage === 0);
    await sleep(1600);
    await shot('3-after.png');

    // 5. 手账打开收藏页，返回晾衣绳
    await exec(`document.getElementById('cl-journal').click()`);
    await sleep(300);
    const journal = await exec(`({ open: document.body.classList.contains('cl-journal'), page: document.querySelector('.page.active')?.id, tabs: getComputedStyle(document.getElementById('tabs')).display })`);
    check('菇菇手账打开收藏页', journal.open && journal.page === 'page-collection' && journal.tabs !== 'none', JSON.stringify(journal));
    await shot('4-journal.png');
    await exec(`document.getElementById('cl-back').click()`);
    await sleep(300);
    check('返回晾衣绳', !(await exec(`document.body.classList.contains('cl-journal')`)));
    check('渲染进程无 error 级控制台输出', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (error) {
    check('探针执行无异常', false, String(error && error.stack ? error.stack : error));
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(`\nSUMMARY ${results.length - failed}/${results.length} passed`);
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* Chromium 占用 */ }
  app.exit(failed === 0 ? 0 : 1);
});
