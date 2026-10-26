/**
 * care-v3 方向稿共用素材（只读系统、只写本目录 assets/）：
 * - Shell 提取几个 Windows 自带对象的真实图标作为"桌面对象"（演示用，不进生产包）；
 * - 用真实合成管线 dist/main/icon/state-icon.js 生成 干净 / 受潮 / 霉变 / 焦化 / 长菇 状态图，
 *   方向稿里的擦拭 = 在"损伤图"上擦出"干净图"，与产品真实材质同源。
 * 运行（需先 npm run build）：node_modules/.bin/electron design-system/care-v3/prep-assets.cjs
 */
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..', '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'cd-v3-prep-')));
const out = path.join(__dirname, 'assets', 'objects');

// id、显示名、Shell 路径、演示状态（family/stage/mushroom/species）
const OBJECTS = [
  { id: 'folder', name: '项目资料', path: 'C:\\Windows', family: 'mold', stage: 3, mushroom: 'mature', species: 'archive' },
  { id: 'explorer', name: '此电脑', path: 'C:\\Windows\\explorer.exe', family: 'damp', stage: 2, mushroom: 'none' },
  { id: 'notepad', name: '记事本', path: 'C:\\Windows\\System32\\notepad.exe', family: 'char', stage: 2, mushroom: 'none' },
  { id: 'paint', name: '画图', path: 'C:\\Windows\\System32\\mspaint.exe', family: 'mold', stage: 2, mushroom: 'young', species: 'waterfall' },
  { id: 'cmd', name: '终端', path: 'C:\\Windows\\System32\\cmd.exe', family: 'mold', stage: 3, mushroom: 'mature', species: 'broken' },
  { id: 'control', name: '控制面板', path: 'C:\\Windows\\System32\\control.exe', family: 'damp', stage: 1, mushroom: 'none' },
  { id: 'taskmgr', name: '任务管理器', path: 'C:\\Windows\\System32\\Taskmgr.exe', family: 'char', stage: 1, mushroom: 'none' },
  { id: 'charmap', name: '字符映射', path: 'C:\\Windows\\System32\\charmap.exe', family: 'mold', stage: 1, mushroom: 'none' },
];

app.whenReady().then(async () => {
  const { composeStateIconPng } = require(path.join(root, 'dist/main/icon/state-icon.js'));
  const { queryShellIcons } = require(path.join(root, 'dist/main/desktop/shell-icons.js'));
  fs.mkdirSync(out, { recursive: true });
  const icons = await queryShellIcons(OBJECTS.map((o) => ({ path: o.path })));
  const manifest = [];
  for (const [i, obj] of OBJECTS.entries()) {
    const px = icons[i];
    if (!px) { console.warn('提取失败，跳过', obj.path); continue; }
    const base = nativeImage.createFromBitmap(Buffer.from(px.pixels), { width: px.width, height: px.height }).toPNG();
    const clean = await composeStateIconPng(base, null, obj.id);
    const dirty = await composeStateIconPng(base, { family: obj.family, stage: obj.stage, mushroom: 'none' }, obj.id);
    fs.writeFileSync(path.join(out, `${obj.id}-clean.png`), clean);
    fs.writeFileSync(path.join(out, `${obj.id}-dirty.png`), dirty);
    const entry = { ...obj, clean: `assets/objects/${obj.id}-clean.png`, dirty: `assets/objects/${obj.id}-dirty.png` };
    if (obj.mushroom !== 'none') {
      // 桌面上实际显示的样子（B 版：原图 0.86 + 菌群压边）
      const desk = await composeStateIconPng(base, { family: obj.family, stage: obj.stage, mushroom: obj.mushroom }, obj.id, obj.species, 'B');
      fs.writeFileSync(path.join(out, `${obj.id}-desk.png`), desk);
      entry.desk = `assets/objects/${obj.id}-desk.png`;
    }
    manifest.push(entry);
  }
  fs.writeFileSync(path.join(__dirname, 'assets', 'objects.js'),
    `/* 由 prep-assets.cjs 生成：Shell 真实图标 + state-icon 真实材质 */\nwindow.CD_OBJECTS = ${JSON.stringify(manifest, null, 1)};\n`, 'utf8');
  console.log('objects:', manifest.length);
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
