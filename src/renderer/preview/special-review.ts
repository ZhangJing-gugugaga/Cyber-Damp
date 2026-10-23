import { Application, Graphics, Text } from 'pixi.js';
import { MushroomView } from '../view/mushroom-view';
import { loadMushroomAssets } from '../view/mushroom-assets';
import './effect-library.css';
const app = new Application();
await app.init({ width: 960, height: 340, background: 0x526775, antialias: true, resolution: devicePixelRatio, autoDensity: true });
document.getElementById('scene')!.append(app.canvas);
await loadMushroomAssets();
const entries = (['shy', 'bolete', 'lava'] as const).flatMap((species, index) => [false, true].map(near => {
  const view = new MushroomView(species);
  view.container.position.set(index * 320 + (near ? 225 : 80), 225); view.container.scale.set(1.8);
  const marker = new Graphics().moveTo(-10, 0).lineTo(10, 0).moveTo(0, -6).lineTo(0, 6).stroke({ color: 0xcadad1, width: 1 });
  marker.position.copyFrom(view.container.position); app.stage.addChild(marker, view.container);
  const text = new Text({ text: near ? '靠近时' : '平静时', style: { fill: 0xe8eeeb, fontSize: 14, fontFamily: 'Microsoft YaHei' } });
  text.position.set(view.container.x - 24, 255); app.stage.addChild(text);
  return { species, view, near };
}));
let growth = 1, near = false, time = 0, usingShovel = false;
document.getElementById('shovel')!.onclick = event => { usingShovel = !usingShovel; (event.target as HTMLElement).textContent = usingShovel ? '收起铲子' : '装备铲子'; };
document.getElementById('restart')!.onclick = () => { growth = 0; };
document.getElementById('anger')!.onclick = event => { near = !near; (event.target as HTMLElement).textContent = near ? '模拟移远' : '模拟靠近'; };
app.canvas.addEventListener('pointerdown', event => {
  const bounds = app.canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * 960 / bounds.width, y = (event.clientY - bounds.top) * 340 / bounds.height;
  const target = entries.find(entry => entry.view.hit(x, y));
  document.getElementById('hit-result')!.textContent = target ? `命中：${target.species}（${target.near ? '右侧' : '左侧'}）` : '透明区域，未命中。';
});
app.ticker.add(ticker => {
  const dt = Math.min(.05, ticker.deltaMS / 1000); time += dt; growth = Math.min(1, growth + dt / 4);
  for (const entry of entries) {
    const root = entry.view.container.position;
    entry.view.update(growth, time, entry.near && near ? { x: root.x + 30, y: root.y - 30 } : { x: -999, y: -999 }, usingShovel);
    entry.view.setCondition({ species: entry.species, growth }, time);
  }
  document.getElementById('phase')!.textContent = `生长 ${Math.round(growth * 100)}% · ${near ? '右侧正在靠近' : '指针移远'}`;
});
(window as unknown as Record<string, unknown>).__CD_SPECIAL_REVIEW__ = () => ({ growth, near, usingShovel, species: entries.map(entry => entry.species) });
