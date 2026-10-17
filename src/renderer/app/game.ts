/**
 * 游戏总装配（app 层）：pixi + matter + world + view + input + ui + save 接线
 * renderer/index.ts 只调 createGame()；本文件只装配与逐帧编排，不写领域逻辑
 * （售卖/购买/Demo/采摘动作在 game-actions.ts，粒子效果在 input/fx-burst.ts）
 */
import type { Application } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { createMatterWorld } from './matter-world';
import { startGameLoop } from './game-loop';
import { WorldRuntime } from './world-runtime';
import { RopeManager } from './rope-manager';
import type { RopeEntry } from './rope-manager';
import { Atmosphere } from './atmosphere';
import { Opening } from './opening';
import { SnailController } from './snail-controller';
import { BoxController } from './box-controller';
import { createGameActions } from './game-actions';
import type { GameActions } from './game-actions';
import { WorldLayers } from '../view/layers';
import { FileSprite } from '../view/file-sprite';
import { MushroomView } from '../view/mushroom-view';
import { drawRope, drawRopeWarn } from '../view/rope-view';
import { ParticlePool } from '../view/particles';
import { FanView } from '../view/fan-view';
import { FILE_ICON_H } from '../view/token-colors';
import { PointerController } from '../input/pointer-controller';
import { debrisBurst } from '../input/fx-burst';
import { applyHeatFx, squeegeeFx } from './tool-fx';
import { mountUi } from '../ui/ui-root';
import { Sfx } from '../audio/sfx';
import { SaveController } from '../save/save-controller';
import { loadSave } from './save-bridge';
import type { SaveData } from '../../shared/types/save';

const AUTOSAVE_SEC = 30;

export async function createGame(app: Application): Promise<void> {
  // 1. 存档加载（失败/损坏走新开局——契约纪律 3）
  const loaded = await loadSave();

  // 2. 世界与物理
  const matter = createMatterWorld(app.screen.width, app.screen.height);
  const runtime = new WorldRuntime();
  const ropes = new RopeManager(matter.engine.world);
  const now = Date.now();
  if (loaded) runtime.initFromSave(loaded, now);
  else runtime.initNew(now);
  console.info('[cyber-damp] 世界装配完成:', loaded ? '存档已恢复' : '新开局', runtime.entities.length, '个文件'); // 冒烟断言锚点

  // 3. 视图图层
  const layers = new WorldLayers();
  app.stage.addChild(layers.root);
  const pool = new ParticlePool();
  layers.fxLayer.addChild(pool.container);
  const sprites = new Map<string, FileSprite>();
  const shrooms = new Map<string, MushroomView>();
  for (const ent of runtime.entities) {
    const sprite = new FileSprite(ent.node);
    layers.fileLayer.addChild(sprite.container);
    sprites.set(ent.node.id, sprite);
  }

  // 4. 绳索恢复（读档）+ 绳 Graphics
  const ropeGfx = new Map<RopeEntry, Graphics>();
  function addRopeEntry(entry: RopeEntry): RopeEntry {
    const g = new Graphics();
    layers.propLayer.addChild(g);
    ropeGfx.set(entry, g);
    return entry;
  }
  if (loaded) restoreRopes(loaded);

  function restoreRopes(save: SaveData): void {
    for (const r of save.ropes) {
      const entry = ropes.spawn(r.ax, r.ay, r.bx, r.by, r.tier);
      if (!entry) continue;
      for (const id of r.fileIds) {
        const ent = runtime.byId.get(id);
        if (!ent) continue;
        const link = entry.rope.links[Math.floor((entry.rope.links.length - 1) * (0.5 + Math.random() * 0.3))];
        if (ropes.hang(entry, ent.node, { x: link.position.x, y: link.position.y })) {
          runtime.markState(id, 'hung');
        }
      }
    }
  }

  // 5. 环境表现 + 音效 + 存档
  const atmosphere = new Atmosphere(app, layers);
  const sfx = new Sfx();
  const saver = new SaveController(runtime, ropes);
  runtime.onChange = () => saver.schedule();

  // 6. 游戏动作（售卖/购买/Demo/采摘）
  const actions = createGameActions({
    app,
    runtime,
    ropes,
    pool,
    sfx,
    shrooms,
    toast: { tip: (t, o) => ui.toast.tip(t, o) },
    refresh: () => ui.refresh(),
    placeFan: () => {
      fan = atmosphere.placeFan();
    },
    retierRopes: () => ropes.setTierAll(runtime.equipped.rope),
    getTool: () => ui.getTool(),
  });

  // 7. UI 装配（含吸湿盒控制器：回收角 decor 挂 ui 层）
  const boxes = new BoxController(layers, pool, () => ({ w: app.screen.width, h: app.screen.height }), document.getElementById('ui-root') ?? document.body);
  const ui = mountUi(document.getElementById('ui-root') ?? document.body, runtime, {
    onSell: actions.onSell,
    onBuy: actions.onBuy,
    onBuyBox: (qty) => {
      const placed = boxes.place(qty);
      if (placed === 0) {
        ui.toast.tip('墙角放不下了（最多 4 只），倒掉一只满盒再来。');
        return;
      }
      const cost = placed * boxes.price;
      if (runtime.chargeCoins(cost)) {
        sfx.coin();
        ui.toast.tip(placed < qty ? `墙角只塞得下 ${placed} 只吸湿盒，已按实收币。` : `${placed} 只吸湿盒在墙角上岗。积水涨满了记得来倒。`);
      }
    },
    sfx,
    demo: actions.demo,
  });
  // onChange 已被 UI 刷新占用：包一层串上存档防抖
  const uiRefresh = runtime.onChange;
  runtime.onChange = () => {
    uiRefresh?.();
    saver.schedule();
  };

  // 8. 80% 预警角标（AC-35 表现层，pointer-events:none）
  const warnBadge = document.createElement('span');
  warnBadge.className = 'warn-badge';
  warnBadge.textContent = '绳索接近承重极限';
  warnBadge.style.cssText =
    'position:fixed;top:64px;left:50%;transform:translateX(-50%);display:none;padding:2px 10px;' +
    'font-size:var(--text-2xs);color:var(--warn);background:var(--panel-bg);border:1px solid var(--warn);border-radius:var(--radius-pill)';
  ui.mount.appendChild(warnBadge);

  // 9. 输入层 + 拉绳预览 + 蜗牛（AC-29 P0）
  const snails = new SnailController(layers, pool, () => ({ w: app.screen.width, h: app.screen.height }));
  const previewG = new Graphics();
  layers.propLayer.addChild(previewG);
  const pointer = new PointerController({
    runtime,
    ropes,
    sprites,
    pool,
    sfx,
    getTool: () => ui.getTool(),
    domHit: (x, y) => {
      const el = document.elementFromPoint(x, y);
      return !!el && el.closest('[data-ui-interactive]') !== null;
    },
    onPick: (id) => actions.pickMushroom(id),
    onHang: () => undefined,
    consumeClick: (x, y) => snails.poke(x, y),
    onSqueegee: (dist, x, y) => squeegeeFx(atmosphere, pool, dist, x, y),
    boxHit: (x, y) => boxes.hit(x, y),
    boxMove: (id, x, y) => boxes.moveTo(id, x, y),
    boxDrop: (id, x, y) => {
      const res = boxes.dropAt(id, x, y);
      if (res === 'emptied') {
        sfx.splash();
        ui.toast.tip('积水倒进了下水道，盒里颗粒又能接着干了。');
      }
      return res;
    },
    spawnRope: (ax, ay, bx, by) => {
      const entry = ropes.spawn(ax, ay, bx, by, runtime.equipped.rope);
      return entry ? addRopeEntry(entry) : null;
    },
    ropePreview: (ax, ay, bx, by) => {
      previewG.clear();
      if (by !== null) previewG.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 3, color: 0xa88b5f, alpha: 0.5 });
    },
  });
  for (const btn of document.querySelectorAll('#ui-hud button')) btn.setAttribute('data-ui-interactive', '1');

  // 10. IPC 订阅（CPU 出汗数据源 / 退出 flush）
  window.damp?.system.onCpu((usage) => {
    runtime.cpu = usage;
  });
  window.damp?.app.onBeforeQuit(() => {
    void saver.flush();
  });

  // 11. 开场演出（每次启动；读档时近似无缝）
  let opening: Opening | null = new Opening({
    runtime,
    atmosphere,
    pool,
    sfx,
    shrooms,
    onToast: (text) => ui.toast.tip(text, { actionLabel: '先去晾晒' }),
    onFinish: () => {
      opening = null;
      ui.refresh();
    },
  });

  // 12. 逐帧编排
  let tSec = 0;
  let autosaveAcc = 0;
  let fan: FanView | null = null;
  if (runtime.fanPlaced) fan = atmosphere.placeFan();
  let lastCondition = runtime.dayWeather().condition;
  const overheatWarned = new Set<string>(); // 吹风机过热警示一次

  startGameLoop({
    app,
    engine: matter.engine,
    tick: (dtSec) => {
      tSec += dtSec;
      opening?.update(dtSec);
      runtime.tick(dtSec);

      // 吹风机按住施热（P1）：局部烘干 + 焦化 + 过热警示
      const hid = pointer.heatTargetId;
      if (hid) applyHeatFx(runtime, sprites, pool, (t) => ui.toast.tip(t), overheatWarned, hid, dtSec);

      // 崩断判定（字节累计）→ 表现层反馈（含砸中吸湿盒泼洒）
      ropes.checkBreak((entry) => {
        sfx.crack();
        const link = entry.rope.links[Math.floor(entry.rope.links.length / 2)];
        debrisBurst(pool, link.position.x, link.position.y);
        ui.toast.tip('啪嗒——晾衣绳崩断了，文件摔在任务栏上弹了两下。', { warn: true });
        const hitBox = boxes.splashNear(link.position.x);
        if (hitBox) {
          runtime.triggerSurge(0.35, 8);
          sfx.splash();
          ui.toast.tip('崩落的文件砸翻了吸湿盒——半屏都在淌水，湿度暴涨！', { warn: true });
        }
      });

      // 视图同步：绳上/坠落文件跟随刚体
      for (const [id, body] of ropes.pairs()) {
        const sprite = sprites.get(id);
        if (sprite) sprite.container.position.set(body.position.x, body.position.y);
      }

      // 蘑菇视图：随 runtime 萌生/生长
      for (const ent of runtime.entities) {
        const m = ent.runtime.mushroom;
        if (m && !shrooms.has(ent.node.id)) {
          const view = new MushroomView(m.species);
          layers.shroomLayer.addChild(view.container);
          shrooms.set(ent.node.id, view);
        }
        const view = shrooms.get(ent.node.id);
        if (view && m) {
          const sp = sprites.get(ent.node.id)!.container.position;
          view.container.position.set(sp.x, sp.y - FILE_ICON_H * 0.72);
          view.update(m.growth, tSec, pointer.lastPos);
        }
      }

      // 绳渲染（唯一真相源 = Matter 链坐标，AC-34）+ 80% 预警
      let anyWarn = false;
      for (const [entry, g] of ropeGfx) {
        if (entry.broken) {
          g.clear();
          continue;
        }
        if (ropes.loadState(entry) === 'warn') {
          anyWarn = true;
          drawRopeWarn(g, entry.rope, entry.tier, tSec);
        } else {
          drawRope(g, entry.rope, entry.tier);
        }
      }
      warnBadge.style.display = anyWarn ? '' : 'none';

      pool.update(dtSec);
      atmosphere.update(runtime, dtSec, tSec, pool, fan);
      snails.update(runtime, ropes, dtSec, tSec);
      runtime.setBoxAbsorb(boxes.absorbRate);
      boxes.update(dtSec, runtime.env().humidity, tSec);

      // 雨声氛围随天气
      const cond = runtime.dayWeather().condition;
      if (cond !== lastCondition) {
        lastCondition = cond;
        sfx.setRain(cond === 'rain' || cond === 'storm' ? 0.8 : 0.15);
      }

      autosaveAcc += dtSec;
      if (autosaveAcc >= AUTOSAVE_SEC) {
        autosaveAcc = 0;
        void saver.flush();
      }
    },
  });
}
