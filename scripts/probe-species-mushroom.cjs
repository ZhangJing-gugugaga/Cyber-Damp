/** 验证护理台菇层显示 13 款新品种素材。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { startStaticServer, verifyMockBuild } = require('./static-server.cjs');

let URL = process.argv[2] || '';
app.whenReady().then(async () => {
  verifyMockBuild();
  if (!URL) URL = await startStaticServer(4525) + '/dev.html';
  const win = new BrowserWindow({ show: false, width: 1180, height: 860 });
  const ui = win.webContents;
  const evalJs = (code) => ui.executeJavaScript(code, true).catch((e) => ({ err: String(e).slice(0, 150) }));
  await win.loadURL(URL);
  await evalJs('new Promise((r) => setTimeout(r, 1800))');
  await evalJs('window.__mockDamp.reset()');
  await new Promise((r) => setTimeout(r, 1200));
  await win.loadURL(URL);
  await evalJs('new Promise((r) => setTimeout(r, 1800))');
  for (let i = 0; i < 8; i += 1) {
    const visible = await evalJs(`!document.getElementById('onboarding').classList.contains('hidden')`);
    if (!visible) break;
    await evalJs(`document.getElementById('ob-skip')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await new Promise((r) => setTimeout(r, 300));
  }
  const check = await evalJs(`(async () => {
    const s = await window.damp.native.status();
    const ghost = s.objects.find(o => o.mushroomSpecies === 'ghosted');
    [...document.querySelectorAll('.obj-item')].find(i => i.title === ghost.displayName)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1200));
    const el = document.getElementById('mushroom-layer');
    const loadState = await new Promise((resolve) => {
      if (el.complete && el.naturalWidth > 0) return resolve('loaded');
      if (el.complete) return resolve('error(complete,naturalWidth=0)');
      const ok = () => resolve('loaded');
      el.addEventListener('load', ok, { once: true });
      el.addEventListener('error', () => resolve('error(event)'), { once: true });
      setTimeout(() => resolve('timeout'), 3000);
    });
    const wrapRect = document.getElementById('canvas-wrap').getBoundingClientRect();
    const glyph = document.elementFromPoint(wrapRect.left + 20, wrapRect.top + 24);
    const imgs = [...document.querySelectorAll('#canvas-wrap img')].map((i) => ({
      id: i.id, complete: i.complete, nw: i.naturalWidth, src: (i.src || '').slice(-46),
    }));
    return { species: ghost.mushroomSpecies, hidden: el.classList.contains('hidden'), loadState, glyph: glyph ? glyph.id || glyph.tagName : null, imgs };
  })()`);
  console.log('mushroom:', JSON.stringify(check));
  const img = await win.webContents.capturePage();
  const out = path.resolve(__dirname, '..', 'previews/care-v2-mock-2026-10-26/4-care-desk-species-mushroom.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('shot saved:', out);
  const mushroomImg = check && check.imgs ? check.imgs.find((i) => i.id === 'mushroom-layer') : null;
  const ok = Boolean(
    mushroomImg
    && mushroomImg.complete
    && mushroomImg.nw > 0
    && mushroomImg.src.includes('/species/ghosted/')
    && check.loadState === 'loaded',
  );
  process.exitCode = ok ? 0 : 1;
  console.log('verify:', JSON.stringify({ ok, mushroomImg, loadState: check && check.loadState }));
  app.exit(process.exitCode ?? 0);
});
