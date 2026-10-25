/**
 * 13 款蘑菇素材管线（Task 3）：SVG 源 → PNG 全尺寸 + 幼菇临时版 + 剪影 + A/B 合成对照图。
 *
 * 运行：npx electron scripts/build-species-assets.cjs（需要桌面会话；Mac/Windows 均可）
 * 输出：
 *   src/renderer/public/assets/care/species/<id>/{bud,mature}-{256,48,32}.png + silhouette.png + manifest.json
 *   src/renderer/public/assets/care/species/species-manifest.json
 *   previews/species-assets-2026-10-26/composite-sheet.png（A/B 对照图，交负责人选版）
 *
 * 幼菇为临时资产（成熟图缩小+去饱和，独立轮廓待美术出稿），manifest 标记 temporary:true。
 * 对照图中的底板图标是程序画的通用文件夹形状，仅用于合成演示，不是生产素材，
 * 也不使用"叠加图标/"预览里的第三方软件 logo。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_DIR = path.join(ROOT, 'src/renderer/public/assets/care/species/_sources');
const OUT_DIR = path.join(ROOT, 'src/renderer/public/assets/care/species');
const PREVIEW_DIR = path.join(ROOT, 'previews/species-assets-2026-10-26');

// 与 src/shared/types/gameplay.ts NEW_SPECIES_IDS 一一对应（美术 01–13）
const SPECIES = [
  ['01', 'bubble', '返潮泡泡菇'],
  ['02', 'moss', '青苔披肩菇'],
  ['03', 'bell', '水滴风铃菇'],
  ['04', 'lantern', '雾灯菇'],
  ['05', 'archive', '压缩包菇'],
  ['06', 'waterfall', '截图瀑布菇'],
  ['07', 'ghosted', '已读不回菇'],
  ['08', 'sleepless', '晚安失眠菇'],
  ['09', 'timid', '社恐缩头菇'],
  ['10', 'broken', '断线菇'],
  ['11', 'pixel', '像素噪点菇'],
  ['12', 'undo', '撤销菇'],
  ['13', 'rain-crown', '雨神之冠'],
];

const SIZES = [256, 48, 32];
const BUD_SCALE = 0.56; // 临时幼菇：成熟图缩小
const SILHOUETTE_COLOR = '#39434e';

let win = null;

async function main() {
  app.whenReady().then(async () => {
    try {
      await run();
      console.log('[species-assets] done');
      app.exit(0);
    } catch (error) {
      console.error('[species-assets] failed:', error && (error.stack || error.message || String(error)));
      app.exit(1);
    }
  });
}

async function run() {
  win = new BrowserWindow({ show: false, width: 800, height: 600 });
  // file:// 起源页面才能加载 file:// 图片（data: URL 的 opaque origin 会被拦）
  const painterPath = path.join(__dirname, 'species-painter.html');
  fs.writeFileSync(painterPath, '<!doctype html><html><body>species painter</body></html>');
  await win.loadFile(painterPath);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const manifest = { generatedAt: new Date().toISOString(), temporaryBud: true, note: '幼菇为临时资产（成熟图缩小+去饱和）；最终幼菇需独立轮廓与状态。', species: [] };

  for (const [artIndex, id, nameZh] of SPECIES) {
    const svgPath = path.join(SOURCES_DIR, `${artIndex}-${nameZh}-透明.svg`);
    const fileUrl = encodeURI('file:///' + svgPath.replace(/\\/g, '/'));
    const dir = path.join(OUT_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    const files = {};
    for (const stage of ['mature', 'bud']) {
      for (const size of SIZES) {
        const png = await renderPng(fileUrl, size, stage === 'bud');
        const name = `${stage}-${size}.png`;
        fs.writeFileSync(path.join(dir, name), png);
        files[`${stage}-${size}`] = name;
      }
    }
    const silhouette = await renderSilhouette(fileUrl, 256);
    fs.writeFileSync(path.join(dir, 'silhouette.png'), silhouette);
    files.silhouette = 'silhouette.png';
    const entry = {
      id, artIndex: Number(artIndex), nameZh, sourceSvg: `_sources/${artIndex}-${nameZh}-透明.svg`,
      sizes: SIZES, files,
      temporary: { bud: '临时幼菇：成熟图 56% 缩小 + 去饱和，待独立美术稿' },
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(entry, null, 2) + '\n');
    manifest.species.push(entry);
    console.log(`[species-assets] ${id} (${nameZh}) ok`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'species-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const sheet = await renderCompositeSheet();
  fs.writeFileSync(path.join(PREVIEW_DIR, 'composite-sheet.png'), sheet);
  fs.writeFileSync(path.join(PREVIEW_DIR, 'README.md'), readmeText());
  console.log('[species-assets] composite sheet ok');
}

// ---------- 渲染（在隐藏窗口的页面里画） ----------

async function renderPng(svgUrl, size, bud) {
  const scale = bud ? BUD_SCALE : 1;
  const script = `(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(svgUrl)};
    await img.decode();
    const c = document.createElement('canvas');
    c.width = ${size}; c.height = ${size};
    const ctx = c.getContext('2d');
    const s = ${size} * ${scale} / Math.max(img.width, img.height);
    const w = img.width * s;
    const h = img.height * s;
    if (${bud ? 'true' : 'false'}) ctx.filter = 'saturate(0.8) brightness(0.96)';
    ctx.drawImage(img, (${size} - w) / 2, ${size} - h - ${size} * 0.04, w, h);
    return c.toDataURL('image/png');
  })()`;
  const dataUrl = await win.webContents.executeJavaScript(script, true);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function renderSilhouette(svgUrl, size) {
  const script = `(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(svgUrl)};
    await img.decode();
    const c = document.createElement('canvas');
    c.width = ${size}; c.height = ${size};
    const ctx = c.getContext('2d');
    const s = ${size} / Math.max(img.width, img.height);
    ctx.drawImage(img, 0, 0, img.width * s, img.height * s);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = ${JSON.stringify(SILHOUETTE_COLOR)};
    ctx.fillRect(0, 0, ${size}, ${size});
    return c.toDataURL('image/png');
  })()`;
  const dataUrl = await win.webContents.executeJavaScript(script, true);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** 通用文件夹底板（程序绘制，仅合成演示用）。 */
function folderGlyph(ctx, cx, by, w, h) {
  const r = Math.min(w, h) * 0.08;
  const tabW = w * 0.38;
  const tabH = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, by - h + tabH + r);
  ctx.lineTo(cx - w / 2, by - r);
  ctx.arcTo(cx - w / 2, by, cx - w / 2 + r, by, r);
  ctx.lineTo(cx + w / 2 - r, by);
  ctx.arcTo(cx + w / 2, by, cx + w / 2, by - r, r);
  ctx.lineTo(cx + w / 2, by - h + r);
  ctx.arcTo(cx + w / 2, by - h, cx + w / 2 - r, by - h, r);
  ctx.lineTo(cx - w / 2 + tabW, by - h);
  ctx.lineTo(cx - w / 2 + tabW + r * 0.6, by - h + tabH);
  ctx.lineTo(cx - w / 2 + r, by - h + tabH);
  ctx.arcTo(cx - w / 2, by - h + tabH, cx - w / 2, by - h + tabH + r, r);
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx - w / 2, by - h, cx + w / 2, by);
  grad.addColorStop(0, '#8fb7d9');
  grad.addColorStop(1, '#5d8db8');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,60,80,0.45)';
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  ctx.stroke();
}

/**
 * A/B 对照表：
 * A = 原图（图标）缩到底板区 0.60，菌群全幅铺在背后从边缘长出（接近美术示意）；
 * B = 原图保持 0.86，菌群压在图标边缘和外部（原图辨识度更好）。
 * 每品种 12 格：bud/mature × A/B × 256/48/32。
 */
async function renderCompositeSheet() {
  const cell = 140;
  const labelW = 96;
  const headerH = 34;
  const cols = 12;
  const rows = SPECIES.length;
  const sheetW = labelW + cols * cell;
  const sheetH = headerH + rows * cell + 40;
  const jobs = [];
  for (const [, id] of SPECIES) {
    const fileUrl = encodeURI('file:///' + path.join(OUT_DIR, id, 'mature-256.png').replace(/\\/g, '/'));
    const budUrl = encodeURI('file:///' + path.join(OUT_DIR, id, 'bud-256.png').replace(/\\/g, '/'));
    jobs.push({ id, fileUrl, budUrl });
  }
  const script = `(async () => {
    const jobs = ${JSON.stringify(jobs)};
    for (const job of jobs) {
      job.mature = new Image(); job.mature.src = job.fileUrl; await job.mature.decode();
      job.bud = new Image(); job.bud.src = job.budUrl; await job.bud.decode();
    }
    const c = document.createElement('canvas');
    c.width = ${sheetW}; c.height = ${sheetH};
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, c.width, c.height);
    const colTitles = ['幼A·256', '幼A·48', '幼A·32', '幼B·256', '幼B·48', '幼B·32',
      '成A·256', '成A·48', '成A·32', '成B·256', '成B·48', '成B·32'];
    ctx.fillStyle = '#333';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    colTitles.forEach((t, i) => ctx.fillText(t, ${labelW} + i * ${cell} + ${cell / 2}, 22));
    const drawCell = (img, x, y, variant, display) => {
      // 底板：通用文件夹形状
      const baseW = ${cell} * (variant === 'A' ? 0.60 : 0.86) * (display / 256);
      const baseH = baseW * 0.82;
      const cx = x + ${cell / 2};
      const by = y + ${cell} - 16;
      window.__folderGlyph(ctx, cx, by, baseW, baseH);
      // 菌群：全幅 256 绘制在底板之后（背后），A/B 只差底板大小
      const mw = display * (256 / 256);
      ctx.drawImage(img, cx - mw / 2, by - baseH - mw * 0.42, mw, mw);
    };
    ctx.textAlign = 'left';
    ${JSON.stringify(SPECIES)}.forEach(([artIndex, id, nameZh], row) => {
      const y = ${headerH} + row * ${cell};
      const job = jobs[row];
      ctx.fillStyle = '#333';
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillText(\`\${artIndex} \${nameZh}\`, 8, y + ${cell / 2});
      let col = 0;
      for (const stage of ['bud', 'mature']) {
        for (const variant of ['A', 'B']) {
          for (const display of [128, 48, 32]) {
            const x = ${labelW} + col * ${cell};
            ctx.strokeStyle = 'rgba(0,0,0,0.08)';
            ctx.strokeRect(x + 0.5, y + 0.5, ${cell} - 1, ${cell} - 1);
            drawCell(job[stage], x, y, variant, display);
            col += 1;
          }
        }
      }
    });
    ctx.fillStyle = '#667';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('A = 原图缩小到底板区（菌群在外围生长） · B = 原图保持较大（菌群压边缘） · 幼菇为临时资产 · 底板为程序绘制的通用文件夹演示形状', 8, ${sheetH} - 14);
    return c.toDataURL('image/png');
  })()`;
  // 注入文件夹绘制函数与 drawCell 到页面（void 防止把函数当返回值传回 IPC）
  await win.webContents.executeJavaScript(
    `void (window.__folderGlyph = ${folderGlyph.toString()});`, true,
  );
  const dataUrl = await win.webContents.executeJavaScript(script, true);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

function readmeText() {
  return `# 13 款蘑菇素材 A/B 对照图（2026-10-26，员工 1 生成）

- 源 SVG：\`src/renderer/public/assets/care/species/_sources/\`（来自「蘑菇图标-差异化修改版/透明菌群」，美术 01–13 对应品种 ID 见 \`species-manifest.json\`）。
- \`composite-sheet.png\`：每品种 幼/成 × A/B × 256/48/32。
  - **版本 A**：原图缩小到底板区（0.60），菌群全幅长在外围 —— 接近美术示意，需检查原图是否显得过小。
  - **版本 B**：原图保持较大（0.86），菌群压在边缘外部 —— 原图辨识度更好，需检查菌群是否不够明显。
- 底板是程序绘制的通用文件夹形状，仅合成演示；未使用「叠加图标/」预览中的第三方软件 logo。
- 幼菇为**临时资产**（成熟图 56% 缩小 + 去饱和），manifest 已标 \`temporary\`；最终幼菇需要独立轮廓与状态。
- 32px 已单独渲染检查（非缩放 256 图）；48/32 在浅色底上可辨认主轮廓与主色。
- 待负责人在 Windows 桌面实际选定 A/B 后，把选择写回 \`gameplay-v2.md\` 与存档 overlayVariant 默认值。
`;
}

main();
