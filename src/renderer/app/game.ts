/**
 * 游戏总装配（app 层）：真实桌面 + 原生图标 + Verlet 绳 + 6s 开场 + UI/存档接线。
 * 领域逻辑在 game-actions/world-actions；单文件 ≤300 行纪律。
 */
import type { Application } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { startGameLoop } from './game-loop';
import { WorldRuntime } from './world-runtime';
import { RopeManager } from './rope-manager';
import type { RopeEntry } from './rope-manager';
import { Atmosphere } from './atmosphere';
import { Opening } from './opening';
import { SnailController } from './snail-controller';
import { BoxController } from './box-controller';
import type { RecycleRect } from './box-controller';
import { createGameActions } from './game-actions';
import { WorldLayers } from '../view/layers';
import { FileSprite, loadNativeIcon } from '../view/file-sprite';
import { MushroomView } from '../view/mushroom-view';
import { ParticlePool } from '../view/particles';
import { GlyphPool } from '../view/glyph-pool';
import { FanView } from '../view/fan-view';
import { FILE_ICON_TOP } from '../view/token-colors';
import { PointerController } from '../input/pointer-controller';
import { squeegeeFx } from './tool-fx';
import { createGameTick } from './game-tick';
import { mountUi } from '../ui/ui-root';
import { createGuide } from '../ui/onboarding';
import { createHoverCard } from '../ui/hover-card';
import { createFpsWatch } from './fps-watch';
import { wireSystemEvents } from './system-wiring';
import { trackError } from './telemetry';
import { Sfx } from '../audio/sfx';
import { SaveController } from '../save/save-controller';
import { loadSave } from './save-bridge';
import { loadDesktopEntries, openRealPath } from './desktop-bridge';
import { restoreRopes } from './rope-restore';
import { buildFileNodes } from '../../world/desktop-layout';
const AUTOSAVE_SEC = 30;

export async function createGame(app: Application): Promise<void> {
  // 1. 真实桌面 + 存档并行读取；绝不生成 Mock 文件
  const [loaded, entries] = await Promise.all([loadSave(), loadDesktopEntries()]);
  const nodes = buildFileNodes(entries, app.screen.width, app.screen.height);
  const runtime = new WorldRuntime();
  const ropes = new RopeManager();
  ropes.setViewport(app.screen.width, app.screen.height);
  const now = Date.now();
  if (loaded) runtime.initFromSave(loaded, nodes, now);
  else runtime.initNew(nodes, now);
  console.info(
    '[cyber-damp] 真实桌面装配完成:',
    loaded ? '存档已恢复' : '新开局',
    runtime.entities.length,
    '个文件',
    'viewport',
    app.screen.width,
    'x',
    app.screen.height,
  );

  // 2. 视图图层 + 原生图标纹理（并发解码）
  const layers = new WorldLayers();
  app.stage.addChild(layers.root);
  const pool = new ParticlePool();
  layers.fxLayer.addChild(pool.container);
  const glyphs = new GlyphPool();
  layers.fxLayer.addChild(glyphs.container);
  const textures = await Promise.all(nodes.map((n) => loadNativeIcon(n.iconDataUrl)));
  const sprites = new Map<string, FileSprite>();
  const shrooms = new Map<string, MushroomView>();
  nodes.forEach((node, i) => {
    const sprite = new FileSprite(node, textures[i]);
    layers.fileLayer.addChild(sprite.container);
    sprites.set(node.id, sprite);
  });
  function ensureShroom(id: string): void {
    const ent = runtime.byId.get(id);
    const m = ent?.runtime.mushroom;
    if (!ent || !m || shrooms.has(id)) return;
    const view = new MushroomView(m.species);
    layers.shroomLayer.addChild(view.container);
    shrooms.set(id, view);
  }
  for (const ent of runtime.entities) ensureShroom(ent.node.id);

  // 3. 绳索 + 存档恢复
  const ropeGfx = new Map<RopeEntry, Graphics>();
  function addRopeEntry(entry: RopeEntry): RopeEntry {
    const g = new Graphics();
    layers.propLayer.addChild(g);
    ropeGfx.set(entry, g);
    return entry;
  }
  if (loaded) restoreRopes(loaded, runtime, ropes, addRopeEntry);
  // 入场前给所有绳一个稳定下垂姿态
  for (let i = 0; i < 30; i++) ropes.update(1 / 60);

  const atmosphere = new Atmosphere(app, layers);
  const sfx = new Sfx();
  const saver = new SaveController(runtime, ropes);
  runtime.onChange = () => saver.schedule();

  // 4. 吸湿盒（回收站碰撞盒由替身真实坐标提供）
  const recycleNode = runtime.entities.find((e) => e.node.kind === 'recycle');
  const recycleRect = (): RecycleRect | null => {
    if (!recycleNode) return null;
    const s = sprites.get(recycleNode.node.id);
    if (!s) return null;
    return { x: s.container.position.x + 18, y: s.container.position.y + FILE_ICON_TOP, w: 64, h: 64 };
  };
  const boxes = new BoxController(layers, pool, () => ({ w: app.screen.width, h: app.screen.height }), recycleRect);

  // 5. 动作 + UI
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
      runtime.setFanAnchor(fan.container.position.x, fan.container.position.y);
    },
    retierRopes: () => ropes.setTierAll(runtime.equipped.rope),
    registerRope: (entry) => addRopeEntry(entry),
    getTool: () => ui.getTool(),
  });
  const ui = mountUi(document.getElementById('ui-root') ?? document.body, runtime, {
    onSell: actions.onSell,
    onBuy: actions.onBuy,
    onBuyBox: (qty) => {
      const want = Math.min(qty, boxes.freeSlots());
      if (want === 0) {
        ui.toast.tip('墙角放不下了（最多 4 只），倒掉一只满盒再来。');
        return;
      }
      const cost = want * boxes.price;
      if (!runtime.chargeCoins(cost)) {
        ui.toast.tip('币不够。蘑菇还在长，急不来。');
        return;
      }
      const placed = boxes.place(want);
      if (placed < want) runtime.chargeCoins(-(want - placed) * boxes.price);
      sfx.coin();
      ui.toast.tip(placed < qty ? `墙角只塞得下 ${placed} 只吸湿盒，已按实收币。` : `${placed} 只吸湿盒在墙角上岗。积水涨满记得拖去回收站倒掉。`);
    },
    sfx,
    demo: actions.demo,
  });
  const uiRefresh = runtime.onChange;
  runtime.onChange = () => {
    uiRefresh?.();
    saver.schedule();
  };

  // 6. 新手引导 / 悬停卡片 / 蜗牛 / 指针
  const guide = createGuide(ui.toast);
  const hoverCard = createHoverCard(ui.mount, runtime, sprites);
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
    onOpen: (id) => {
      const ent = runtime.byId.get(id);
      if (!ent) return;
      ropes.releaseFile(id);
      runtime.dryFile(id);
      void openRealPath(ent.node.realPath).then((ok) => {
        ui.toast.tip(ok ? `打开「${ent.node.name}」，桌面上的潮气被带走了。` : `「${ent.node.name}」打不开，但湿气已经散了。`);
      });
      sfx.pop(1.2);
    },
    onHang: () => undefined,
    consumeClick: (x, y) => snails.poke(x, y),
    onSqueegee: (dist, x, y) => squeegeeFx(atmosphere, pool, dist, x, y),
    boxHit: (x, y) => boxes.hit(x, y),
    snailHit: (x, y) => snails.hit(x, y),
    sweepGlyphs: (x, y) => { if (glyphs.sweep(x, y) > 0) sfx.swish(); },
    glyphHit: (x, y) => glyphs.hit(x, y),
    boxMove: (id, x, y) => boxes.moveTo(id, x, y),
    boxDrop: (id, x, y) => {
      const res = boxes.dropAt(id, x, y);
      if (res === 'emptied') {
        sfx.splash();
        ui.toast.tip('积水倒进了回收站，盒里颗粒又能接着干了。');
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
  wireSystemEvents(runtime, saver);
  window.damp?.system.onDisplayChanged(({ width, height }) => {
    ropes.setViewport(width, height);
  });

  // 7. 6 秒开场（锁拖拽 + 按真实 mtime 分档腐化）
  let opening: Opening | null = new Opening({
    runtime,
    atmosphere,
    pool,
    sfx,
    sprites,
    shrooms,
    onToast: (text) => ui.toast.tip(text, { actionLabel: '先去晾晒' }),
    onFinish: () => {
      opening = null;
      pointer.clickThrough.update(false);
      if (!loaded) guide.start();
      ui.refresh();
    },
  });
  pointer.clickThrough.update(true); // 演出期间捕获点击，让“点击跳过”生效

  let fan: FanView | null = null;
  if (runtime.fanPlaced) {
    fan = atmosphere.placeFan();
    runtime.setFanAnchor(fan.container.position.x, fan.container.position.y);
  }
  const fpsWatch = createFpsWatch(app);
  const gameTick = createGameTick({
    app,
    runtime,
    ropes,
    sprites,
    shrooms,
    ensureShroom,
    ropeGfx,
    pool,
    glyphs,
    boxes,
    atmosphere,
    snails,
    pointer,
    hoverCard,
    fpsWatch,
    ui,
    sfx,
    saver,
    getOpening: () => opening,
    getFan: () => fan,
    autosaveSec: AUTOSAVE_SEC,
  });
  startGameLoop({
    app,
    onError: (err) =>
      trackError(
        'tick',
        err instanceof Error ? err.message : String(err),
        err instanceof Error ? err.stack : undefined,
      ),
    tick: gameTick,
  });

  // 首帧渲染后挂 WorkerW + 隐藏原生图标（失败则保持图标显示）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void window.damp?.app.desktopReady();
    });
  });

  // QA 只读探针（仅 ?qa=1）：自动化验收用于定位蘑菇/绳/图标，不进入正常发布路径
  if (location.search.includes('qa=1')) {
    (window as unknown as Record<string, unknown>).__CD_DEBUG__ = {
      runtime,
      ropes,
      sprites,
      shrooms,
    };
  }
}
