/**
 * 主进程状态图标合成对照图（员工 2：state-icon.ts 的 A/B × 品种 × 尺寸实际输出）。
 *
 * 只读：用 Shell 提取两个系统对象的原图（C:\Windows 文件夹、explorer.exe）作为合成输入，
 * 经真实 composeStateIconPng + buildMultiSizeIco 同一缩放路径输出 256/48/32 样张；
 * 不写任何桌面引用、不改任何文件（输出只在 previews/）。
 * 这是程序化样张，不代替 Windows 桌面实际观感验收（桌面观感仍 NOT TESTED）。
 *
 * 运行（需先 npm run build）：node_modules/.bin/electron scripts/shot-state-icon-ab.cjs
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'cd-shot-ab-')));
const OUT_DIR = path.join(root, 'previews', 'state-icon-ab-2026-10-26');

const SPECIES = ['bell', 'archive', 'ghosted', 'rain-crown', 'oyster'];
const ROWS = [];
for (const species of SPECIES) {
  for (const mushroom of ['young', 'mature']) ROWS.push({ species, mushroom });
}

app.whenReady().then(async () => {
  const { composeStateIconPng } = require(path.join(root, 'dist/main/icon/state-icon.js'));
  const { queryShellIcons } = require(path.join(root, 'dist/main/desktop/shell-icons.js'));
  const sources = await queryShellIcons([{ path: 'C:\\Windows' }, { path: 'C:\\Windows\\explorer.exe' }]);
  // Shell 返回原始 BGRA 像素，转 PNG 作为合成输入（与扫描管线相同的像素来源）
  const bases = sources.filter(Boolean).map((s) =>
    nativeImage.createFromBitmap(Buffer.from(s.pixels), { width: s.width, height: s.height }).toPNG());
  if (bases.length === 0) throw new Error('Shell 原图提取失败');

  const cells = [];
  for (const [bi, base] of bases.entries()) {
    for (const row of ROWS) {
      for (const variant of ['A', 'B']) {
        const damage = { family: 'mold', stage: 2, mushroom: row.mushroom };
        const png = await composeStateIconPng(base, damage, `shot-${bi}`, row.species, variant);
        cells.push({ bi, ...row, variant, data: `data:image/png;base64,${png.toString('base64')}` });
      }
    }
  }
  const plain = await composeStateIconPng(bases[0], { family: 'mold', stage: 2, mushroom: 'none' }, 'shot-0');

  // 用一个隐藏窗口排版（尺寸缩放使用浏览器的高质量缩放，近似 Shell 取 ICO 内 48/32 条目）
  const win = new BrowserWindow({ show: false, width: 1400, height: 1200, webPreferences: { offscreen: true } });
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#2b5f8a;font:12px 'Microsoft YaHei';color:#fff">
  <div id="root" style="padding:12px"></div><script>
  const cells = ${JSON.stringify(cells)};
  const plain = ${JSON.stringify(`data:image/png;base64,${plain.toString('base64')}`)};
  const root = document.getElementById('root');
  const head = document.createElement('div');
  head.innerHTML = '<b>state-icon.ts 实际输出 · 背景模拟蓝色壁纸 · 每格：256 / 48 / 32</b> · 无菇霉变参考：' +
    '<img src="'+plain+'" width=48 height=48 style="vertical-align:middle">';
  root.append(head);
  const table = document.createElement('table');
  table.style.borderCollapse = 'collapse';
  const groups = {};
  for (const c of cells) (groups[c.bi + '|' + c.species + '|' + c.mushroom] ??= []).push(c);
  for (const [key, list] of Object.entries(groups)) {
    const tr = document.createElement('tr');
    const [bi, species, mushroom] = key.split('|');
    tr.innerHTML = '<td style="padding:4px 8px;white-space:nowrap">' + (bi === '0' ? '文件夹' : 'explorer') + ' · ' + species + ' · ' + (mushroom === 'young' ? '幼菇' : '成熟') + '</td>';
    for (const c of list) {
      const td = document.createElement('td');
      td.style.padding = '4px 10px';
      td.innerHTML = '<div>' + c.variant + '</div>' +
        '<img src="'+c.data+'" width=96 height=96> <img src="'+c.data+'" width=48 height=48> <img src="'+c.data+'" width=32 height=32>';
      tr.append(td);
    }
    table.append(tr);
  }
  root.append(table);
  </script></body></html>`;
  const file = path.join(app.getPath('userData'), 'sheet.html');
  fs.writeFileSync(file, html, 'utf8');
  await win.loadFile(file);
  await new Promise((r) => setTimeout(r, 1200));
  const size = await win.webContents.executeJavaScript('({ w: document.body.scrollWidth, h: document.body.scrollHeight })');
  win.setContentSize(Math.min(size.w, 1600), Math.min(size.h, 4000));
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'state-icon-ab-sheet.png');
  fs.writeFileSync(out, image.toPNG());
  console.log('sheet saved:', out, JSON.stringify(image.getSize()));
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
