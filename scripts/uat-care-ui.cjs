/**
 * 护理台界面端到端探针（真实护理页 + 真实 preload + 真实 native IPC + 临时存档）。
 *
 * 鼠标经 webContents.sendInputEvent 注入（Chromium 输入管线，非 JS 合成事件），
 * 不触碰桌面：对象为存档内虚拟记录，图标为脚本生成的 PNG 并经 updateNativeEntries 注入。
 * 证据范围：渲染层与 IPC 接线；不代表 Explorer 原生输入或真机感官验收。
 *
 * 覆盖：列表状态、快速拖动无断点且掩码连续、进度与存档一致、重开不缩水、
 * 擦净损伤层后自动收尾、采摘经界面结算一次、余额不足购买经界面显示失败。
 *
 * 运行（需先 npm run build）：node_modules/electron/dist/electron.exe scripts/uat-care-ui.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-care-ui-'));
app.setPath('userData', dataDir);
const savePath = path.join(dataDir, 'save.json');
const readSave = () => JSON.parse(fs.readFileSync(savePath, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

// ---- 测试图标：透明留白 + 色块（RGBA） ----
function makeIconPixels(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const o = (y * size + x) * 4;
      const inside = x >= 24 && x < size - 24 && y >= 28 && y < size - 20;
      if (!inside) continue; // alpha 保持 0
      const stripe = (y >> 5) % 2 === 0;
      px[o] = stripe ? 222 : 190; px[o + 1] = stripe ? 170 : 140; px[o + 2] = stripe ? 80 : 60; px[o + 3] = 255;
    }
  }
  return px;
}

// ---- 最小 PNG 编码（RGBA 8bit） ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size * 4; x += 1) raw[y * (size * 4 + 1) + 1 + x] = px[y * size * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function nativeObject(id, damage, progress) {
  return {
    id, realPath: `C:\\CD-ui-probe\\${id}`, kind: 'dir', displayName: id, originalMtime: 1,
    damage, careProgress: progress ?? 0, moldImmuneUntil: 0, lastAdvanceAt: 0,
  };
}

app.whenReady().then(async () => {
  fs.writeFileSync(savePath, JSON.stringify({
    schemaVersion: 3,
    savedAt: Date.now(),
    player: { coins: 0, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'changsha', migratedOn: '2026-10-25' },
    files: [], ropes: [], stats: { harvested: 0, earned: 0, playedMs: 0 },
    native: {
      init: { status: 'legacy-initialized' },
      onboarded: true, // 已完成引导，否则引导遮罩会挡住护理画布
      dailyEvents: {},
      objects: {
        dirty: nativeObject('dirty', { family: 'damp', stage: 2, mushroom: 'none' }),
        clean: nativeObject('clean', { family: 'damp', stage: 0, mushroom: 'none' }),
        ripe: nativeObject('ripe', { family: 'mold', stage: 0, mushroom: 'mature' }),
      },
      lastSnapshot: null,
    },
  }), 'utf8');

  const { updateNativeEntries, registerNativeHandlers } = require(path.join(root, 'dist/main/ipc/native-handlers.js'));
  const { decodeCareMask } = require(path.join(root, 'dist/shared/care-mask.js'));
  const { applyDamageMaterial, damageVariant } = require(path.join(root, 'dist/shared/material/effects.js'));

  // 复算页面中的损伤层（与 care.ts buildDamageLayer 同一判定），得到可擦区域的边界
  const pristine = makeIconPixels(256);
  const damaged = new Uint8ClampedArray(pristine);
  applyDamageMaterial({ data: damaged, width: 256, height: 256, stage: 2, type: damageVariant('dirty', 'damp') });
  let minY = 256; let maxY = -1; let layerCount = 0;
  for (let p = 0; p < 256 * 256; p += 1) {
    const i = p * 4;
    if (pristine[i + 3] < 24) continue;
    const delta = Math.abs(damaged[i] - pristine[i]) + Math.abs(damaged[i + 1] - pristine[i + 1]) + Math.abs(damaged[i + 2] - pristine[i + 2]);
    if (delta <= 6) continue;
    layerCount += 1;
    const y = Math.floor(p / 256);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const icon = encodePng(makeIconPixels(256), 256);
  const entry = (id) => ({
    id, name: id, ext: '', category: 'folder', sizeBytes: 0, mtime: 1,
    realPath: `C:\\CD-ui-probe\\${id}`, kind: 'dir', iconDataUrl: icon, displayName: id,
  });
  updateNativeEntries(['dirty', 'clean', 'ripe'].map(entry));

  const win = new BrowserWindow({
    width: 1000, height: 720, show: true,
    webPreferences: { preload: path.join(root, 'dist/preload/index.js'), contextIsolation: true, sandbox: false },
  });
  registerNativeHandlers(() => win.webContents);
  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) consoleErrors.push(message); });

  const exec = (code) => win.webContents.executeJavaScript(code);
  const rectOf = (sel) => exec(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  const text = (sel) => exec(`document.querySelector(${JSON.stringify(sel)}).textContent`);
  const clickItem = (name) => exec(`(() => { const el = [...document.querySelectorAll('.obj-item')].find((i) => i.title === ${JSON.stringify(name)}); if (!el) return false; el.click(); return true; })()`);
  const pctText = async () => Number((await text('#progress-text')).replace('%', ''));

  // 画布坐标（0–256）→ 窗口 DIP 坐标
  async function canvasToWin(cx, cy) {
    const r = await rectOf('#canvas-wrap');
    return { x: Math.round(r.left + (cx / 256) * r.width), y: Math.round(r.top + (cy / 256) * r.height) };
  }
  // 经 Chromium 输入管线按下、逐点移动、抬起（移动之间不补采样）
  async function stroke(points) {
    const first = await canvasToWin(points[0][0], points[0][1]);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: first.x, y: first.y, button: 'left', clickCount: 1 });
    await sleep(30);
    for (const [px, py] of points.slice(1)) {
      const p = await canvasToWin(px, py);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y, modifiers: ['leftButtonDown'] });
      await sleep(20);
    }
    const last = await canvasToWin(points[points.length - 1][0], points[points.length - 1][1]);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: last.x, y: last.y, button: 'left', clickCount: 1 });
    await sleep(250);
  }

  try {
    await win.loadFile(path.join(root, 'dist/renderer/care.html'));
    await sleep(1500);

    // U1 列表状态：可采摘优先，干净对象仍在列表中
    const labels = await exec(`[...document.querySelectorAll('.obj-item')].map((i) => [i.title, i.querySelector('.flag').textContent])`);
    const byName = Object.fromEntries(labels);
    check('列表：成熟菇标为可采摘', (byName.ripe || '').includes('可采'), JSON.stringify(labels));
    check('列表：干净但未带菇对象仍可找到', byName.clean === '已干净', String(byName.clean));
    check('列表：待护理对象标注损伤族', (byName.dirty || '').includes('待护理'), String(byName.dirty));

    // U2 部分护理：只在损伤层上沿顶边一条横线擦（不应自动收尾）
    // 横线跨越整幅宽度，每段 ~60px，不补采样：掩码应仍连续
    await clickItem('dirty');
    await sleep(400);
    const rowY = minY + 3;
    const canvasOpaque = () => exec(`(() => { const c = document.getElementById('dirt-layer'); const d = c.getContext('2d').getImageData(0, 0, 256, 256).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 24) n += 1; return n; })()`);
    await exec(`window.__pd = 0; document.getElementById('canvas-wrap').addEventListener('pointerdown', () => { window.__pd += 1; }, true);`);
    const startPoint = await canvasToWin(20, rowY);
    const hitChain = await exec(`(() => { let el = document.elementFromPoint(${startPoint.x}, ${startPoint.y}); const c = []; while (el && c.length < 4) { c.push(el.tagName + '#' + el.id); el = el.parentElement; } return c.join('<'); })()`);
    console.log(`DEBUG start=${JSON.stringify(startPoint)} hit=${hitChain} win=${await exec('document.hasFocus()')} vis=${await exec('document.visibilityState')} selected=${await text('#stage-name')}`);
    const beforeProgress = await pctText();
    check('未擦拭时进度为 0%（非整图不透明面积）', beforeProgress === 0, `progress=${beforeProgress}%`);
    win.focus();
    await sleep(200);
    await stroke([[20, rowY], [80, rowY], [140, rowY], [200, rowY], [236, rowY]]);
    const pointerDowns = await exec('window.__pd');
    check('拖动起点落在护理画布上（输入已送达）', pointerDowns >= 1, `pointerdown=${pointerDowns}`);
    const afterStroke = readSave().native.objects.dirty;
    const mask = decodeCareMask(afterStroke.careMask || '');
    let gap = 0;
    const gy = Math.floor(rowY / 4);
    for (let gx = 5; gx <= 58; gx += 1) if (!mask || !mask[gy * 64 + gx]) gap += 1;
    check('快速拖动掩码无断点（整行覆盖）', gap === 0, `缺口格数=${gap} 行=${rowY}`);
    check('部分护理不自动收尾', afterStroke.damage.stage === 2, `stage=${afterStroke.damage.stage}`);

    // U3 进度界面与存档一致（1pp 内），且为正值
    const shown = await pctText();
    const saved = Math.round(afterStroke.careProgress * 100);
    check('进度界面与存档一致', shown > 0 && Math.abs(shown - saved) <= 1, `界面=${shown}% 存档=${saved}%`);

    // U4 重开不缩水：重载页面后进度不低于重载前
    await win.webContents.reload();
    await sleep(1500);
    await clickItem('dirty');
    await sleep(400);
    const reopened = await pctText();
    check('重开后进度不缩水', reopened >= shown - 0.5, `重开前=${shown}% 重开后=${reopened}%`);

    // U5 擦净损伤层：逐行扫过损伤层边界，达到 90% 后自动收尾
    const t0 = Date.now();
    for (let row = minY; row <= maxY && readSave().native.objects.dirty.damage.stage !== 0; row += 16) {
      await stroke([[10, row], [70, row], [130, row], [190, row], [250, row]]);
    }
    if (readSave().native.objects.dirty.damage.stage !== 0) {
      await stroke([[10, maxY], [250, maxY]]);
    }
    const finalObj = readSave().native.objects.dirty;
    check('擦净损伤层后自动收尾为干净', finalObj.damage.stage === 0 && finalObj.damage.mushroom === 'none',
      `耗时=${Date.now() - t0}ms stage=${finalObj.damage.stage}`);
    check('收尾后写入 240h 免疫', finalObj.moldImmuneUntil > Date.now() + 239 * 3600e3);
    check('损伤层像素数记录（探针信息）', layerCount > 0, `layer=${layerCount} rows=${minY}-${maxY}`);
    await sleep(400);
    const nextName = await text('#stage-name');
    check('完成后自然引向下一个可处理对象', nextName === 'ripe', `当前=${nextName}`);

    // U6 采摘：界面按钮经真实 IPC 结算一次
    await clickItem('ripe');
    await sleep(400);
    await exec(`document.getElementById('btn-harvest').click()`);
    await sleep(600);
    check('采摘经界面结算 4 币', readSave().player.coins === 4, `coins=${readSave().player.coins}`);
    const firstHarvestToast = await text('#toast');
    check('采摘提示新收藏品种', firstHarvestToast.includes('新收藏：平菇'), firstHarvestToast);
    await exec(`document.getElementById('btn-harvest').click()`);
    await sleep(600);
    check('重复点击采摘不重复结算', readSave().player.coins === 4, `coins=${readSave().player.coins}`);
    const harvestToast = await text('#toast');
    check('重复采摘界面显示失败原因', harvestToast.includes('没有可采摘'), harvestToast);
    await clickItem('ripe');
    await sleep(300);
    const collectionText = await exec(`document.getElementById('collection-grid').textContent`);
    check('收藏展示全部 5 个品种的发现进度', collectionText.includes('已发现 1 / 5'), collectionText.slice(0, 40));

    // U7 余额不足购买：界面显示失败，不扣币，不持有
    await exec(`document.querySelector('#tabs .tab[data-tab="shop"]')?.click()`);
    await sleep(300);
    await exec(`[...document.querySelectorAll('#shop-list .shop-item button')][0].click()`);
    await sleep(200);
    await exec(`document.getElementById('confirm-ok').click()`);
    await sleep(600);
    const shopToast = await text('#toast');
    check('余额不足购买界面显示失败', shopToast.includes('菇币不足'), shopToast);
    check('余额不足购买不扣币不持有', readSave().player.coins === 4 && !readSave().player.owned.includes('big-sponge'));
    const shopNote = await text('#page-shop .shop-note');
    check('小铺显示当前余额', shopNote.includes('余额 4'), shopNote);
  } catch (error) {
    check('探针执行无异常', false, String(error && error.stack ? error.stack : error));
  }

  check('渲染进程无 error 级控制台输出', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSUMMARY ${results.length - failed}/${results.length} passed`);
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (error) {
    console.warn(`临时目录未清理（可手动删除）: ${dataDir} ${error.code || error.message}`);
  }
  app.exit(failed === 0 ? 0 : 1);
});
