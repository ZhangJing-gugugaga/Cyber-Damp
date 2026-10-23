import { Application, Texture, Text } from 'pixi.js';
import { FileSprite, loadNativeIcon } from '../view/file-sprite';
import { MATERIAL_PRESETS, materialSample } from '../view/material-presets';
import folderUrl from '../../../previews/mildew-lifecycle/icon.png?url';
import type { FileNode } from '../../shared/types/file-node';
import './effect-library.css';

const byId = (id: string) => document.getElementById(id)!;
const app = new Application();
await app.init({ width: 1020, height: 320, resolution: devicePixelRatio, autoDensity: true, background: 0x526775, antialias: true });
byId('scene').append(app.canvas);
function node(id: string, name: string, x: number, y: number): FileNode {
  return { id, name, x, y, sizeBytes: 0, mtime: 0, realPath: '', kind: 'file', category: 'doc-code', ext: '', iconDataUrl: '',
    geometry: { x: x + 18, y: y + 4, size: 48, labelX: x, labelY: y + 56, labelWidth: 84, labelHeight: 28 } };
}
const folder = await loadNativeIcon(folderUrl), brand = await loadNativeIcon('./brand/rain-mushroom.svg');
if (!folder || !brand) throw new Error('Preview source icon failed to decode');
// Reuse the repository's neutral fallback drawing instead of drawing another document icon.
const fallback = new FileSprite(node('document-fixture', '', 0, 0), null);
const paperCanvas = app.renderer.extract.canvas({ target: fallback.artwork });
const paper = Texture.from(paperCanvas); fallback.container.destroy({ children: true });
let preset: string = MATERIAL_PRESETS[0].id, progress = 0, playing = true, original = false, time = 0;
let lastFrameAt = performance.now();
let sprites: FileSprite[] = [];
const fixtures = [{ texture: folder, name: '项目资料', kind: '文件夹' }, { texture: brand, name: '回南天', kind: '彩色应用' }, { texture: paper, name: '清单.txt', kind: '浅色文档' }];
function rebuild(): void {
  for (const sprite of sprites) sprite.container.destroy({ children: true });
  sprites = [];
  for (const [i, fixture] of fixtures.entries()) for (const zoom of [false, true]) {
    const sprite = new FileSprite(node(`${preset}-${i}`, fixture.name, i * 340 + (zoom ? 105 : 16), zoom ? 48 : 105), fixture.texture);
    sprite.finishIntro(); sprite.container.scale.set(zoom ? 2.5 : 1);
    app.stage.addChild(sprite.container); sprites.push(sprite);
  }
  byId('sample-name').textContent = MATERIAL_PRESETS.find(item => item.id === preset)!.family + '：' + MATERIAL_PRESETS.find(item => item.id === preset)!.name;
  for (const button of byId('presets').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === preset));
}
for (const item of MATERIAL_PRESETS) {
  const button = document.createElement('button'); button.dataset.id = item.id;
  button.textContent = `${item.family} · ${item.name}`;
  button.onclick = () => { preset = item.id; progress = 0; playing = true; byId('play').textContent = '暂停'; rebuild(); };
  byId('presets').append(button);
}
for (const [i, fixture] of fixtures.entries()) {
  const label = new Text({ text: fixture.kind, style: { fill: 0xe0e9e5, fontSize: 14, fontFamily: 'Microsoft YaHei' } });
  label.position.set(i * 340 + 18, 20); app.stage.addChild(label);
}
byId('replay').onclick = () => { progress = 0; playing = true; byId('play').textContent = '暂停'; };
byId('reset').onclick = () => { progress = 0; playing = false; byId('play').textContent = '播放'; };
byId('play').onclick = () => { playing = !playing; byId('play').textContent = playing ? '暂停' : '播放'; };
byId('original').onchange = event => { original = (event.target as HTMLInputElement).checked; };
byId('progress').oninput = event => {
  progress = Number((event.target as HTMLInputElement).value) / 1000; playing = false; byId('play').textContent = '播放';
  renderSample(); app.render();
};
rebuild();
const measurements = (pixels?: number) => ({ preset, progress, scope: 'mildew-and-fungi-before-deformation',
  samples: sprites.filter((_, i) => i % 2 === 0).map((sprite, i) => {
    const mask = sprite.measureMildewOcclusion(pixels);
    return mask ? { name: fixtures[i].kind, total: mask.total, covered: mask.covered, ratio: mask.ratio, pixels: mask.pixels,
      source: mask.source.toDataURL(), colonies: mask.colonies.toDataURL(), fungi: mask.fungi.toDataURL(), union: mask.union.toDataURL() } : null;
  }) });
(window as unknown as Record<string, unknown>).__CD_MATERIAL_REVIEW__ = measurements;
(window as unknown as Record<string, unknown>).__CD_MATERIAL_SELECTION_REVIEW__ = () => {
  const sprite = sprites[0], node = sprite.node;
  const beforePosition = { x: node.x, y: node.y, cx: sprite.container.x, cy: sprite.container.y };
  const bounds = () => { const r = sprite.container.children[0].getLocalBounds(); return { x: r.minX, y: r.minY, width: r.maxX - r.minX, height: r.maxY - r.minY }; };
  try {
    sprite.setSelection(true, false, true); const before = bounds();
    node.x += 120; node.y += 80; sprite.container.position.set(node.x, node.y);
    sprite.setSelection(true, true, true); const after = bounds();
    const icon = sprite.iconRect;
    return { scope: 'source-preview-not-native', before, after,
      hitMovedIcon: sprite.hit(icon.x + icon.w / 2, icon.y + icon.h / 2),
      movedBy: { x: sprite.container.x - beforePosition.cx, y: sprite.container.y - beforePosition.cy } };
  } finally {
    node.x = beforePosition.x; node.y = beforePosition.y;
    sprite.container.position.set(beforePosition.cx, beforePosition.cy); sprite.setSelection(false, false, true);
  }
};
(window as unknown as Record<string, unknown>).__CD_MATERIAL_FRAME__ = () => {
  renderSample(); app.render();
  const canvas = app.renderer.extract.canvas({ target: app.stage });
  if (!canvas.toDataURL) throw new Error('Preview export requires a DOM canvas');
  return { preset, progress, png: canvas.toDataURL() };
};
const compositeMeasurements = (pixels?: number, verifyScene = false) => {
  const sceneImage = () => {
    const canvas = app.renderer.extract.canvas({ target: app.stage });
    if (!canvas.toDataURL) throw new Error('Scene integrity review requires a DOM canvas');
    return canvas.toDataURL();
  };
  const before = verifyScene ? sceneImage() : null;
  const result = { preset, progress, scope: 'mildew-fungi-scorch-crease-after-deformation',
  samples: sprites.filter((_, i) => i % 2 === 0).map((sprite, i) => {
    const mask = sprite.measureMaterialOcclusion(app.renderer, pixels);
    if (!mask) return null;
    return { name: fixtures[i].kind, pixels: mask.pixels, total: mask.total, covered: mask.covered, ratio: mask.ratio,
      projectedVisible: mask.projectedVisible, areaRatio: mask.areaRatio, scale: mask.scale,
      source: mask.source.toDataURL(), colonies: mask.colonies.toDataURL(), fungi: mask.fungi.toDataURL(),
      material: mask.material.toDataURL(), projected: mask.projected.toDataURL(), union: mask.union.toDataURL() };
  }) };
  return { ...result, sceneVerified: verifyScene, sceneUnchanged: !verifyScene || before === sceneImage() };
};
(window as unknown as Record<string, unknown>).__CD_MATERIAL_COMPOSITE_REVIEW__ = compositeMeasurements;
byId('measure-composite').onclick = () => {
  const data = compositeMeasurements();
  byId('coverage').textContent = data.samples.map(sample => `${sample?.name} 联合覆盖 ${((sample?.ratio ?? 0) * 100).toFixed(1)}%，投影面积 ${((sample?.areaRatio ?? 0) * 100).toFixed(1)}%`).join('；');
};
byId('measure').onclick = () => {
  const data = measurements();
  byId('coverage').textContent = data.samples.map(sample => `${sample?.name} ${((sample?.ratio ?? 0) * 100).toFixed(1)}%`).join('，');
};
function renderSample(): void {
  for (const sprite of sprites) {
    const sample = materialSample(preset, original ? 0 : progress);
    if (original) Object.assign(sample.state, { humidity: 0, mold: 0, char: 0, dryness: 0, mushroom: null });
    sprite.setWring(original ? 0 : sample.wring); sprite.update(sample.state, time);
  }
  (byId('progress') as HTMLInputElement).value = String(Math.round(progress * 1000));
  byId('progress-value').textContent = `${Math.round(progress * 100)}%`;
}
app.ticker.add(() => {
  const now = performance.now(), dt = Math.max(0, (now - lastFrameAt) / 1000); lastFrameAt = now; time += dt;
  if (playing) progress = Math.min(1, progress + dt / 8);
  renderSample();
});
