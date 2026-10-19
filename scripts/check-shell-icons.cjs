// Run with electron, not Node. Reads Shell icon artwork and metadata only.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(() => {
  const { extractShellIconImage } = require('../dist/main/native/win32-icons');
  const manifestPath = 'logs/material-uat/fixtures.json';
  const fixture = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')) : null;
  const desktop = app.getPath('desktop');
  const ownedPath = name => fixture && path.join(fixture.desktop, fixture[name]);
  const folder = ownedPath('folder'), paper = ownedPath('paper');
  const sources = [
    ['recycle', '::{645FF040-5081-101B-9F08-00AA002F954E}'],
    ['folder', folder && fs.existsSync(folder) ? folder : path.resolve('src')],
    ['paper', paper && fs.existsSync(paper) ? paper : path.resolve('README.md')],
  ];
  const shortcut = fs.readdirSync(desktop).find(name => name.toLowerCase().endsWith('.lnk'));
  if (shortcut) sources.push(['shortcut', path.join(desktop, shortcut)]);
  const results = [];
  const evidence = process.argv[2] ?? 'logs/icon-uat';
  const koffi = require('koffi');
  const getProcess = koffi.load('kernel32.dll').func('void *GetCurrentProcess()');
  const getResources = koffi.load('user32.dll').func('uint32 GetGuiResources(void *process, uint32 flags)');
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, source] of sources) {
    const image = extractShellIconImage(source);
    if (!image || image.isEmpty()) throw new Error(`No artwork for ${name}`);
    const { width, height } = image.getSize();
    const pixels = image.toBitmap();
    let minX = width, minY = height, maxX = -1, maxY = -1, opaque = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); opaque++;
      }
    }
    if (!opaque) throw new Error(`Transparent artwork for ${name}`);
    fs.writeFileSync(path.join(evidence, `${name}-source.png`), image.toPNG());
    results.push({ name, width, height, visibleWidth: maxX - minX + 1, visibleHeight: maxY - minY + 1, opaquePixels: opaque });
  }
  const before = { gdi: getResources(getProcess(), 0), user: getResources(getProcess(), 1) };
  for (let i = 0; i < 100; i++) {
    if (!extractShellIconImage(sources[i % sources.length][1])) throw new Error('Repeated extraction failed');
  }
  const after = { gdi: getResources(getProcess(), 0), user: getResources(getProcess(), 1) };
  fs.writeFileSync(path.join(evidence, 'resources.json'), JSON.stringify({ extractions: 100, before, after }, null, 2));
  if (after.gdi > before.gdi || after.user > before.user) throw new Error('GDI/USER resources grew during repeated icon extraction');
  fs.writeFileSync(path.join(evidence, 'source-dimensions.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
