/**
 * 逐帧世界推进（app 层）：Verlet 绳 / 断绳落体 / 图标同步 / 蘑菇锚点 / 渲染刷新。
 * 从 game.ts 拆出以守住单文件 ≤300 行门禁。
 */
import type { Application, Graphics } from 'pixi.js';
import type { WorldRuntime } from './world-runtime';
import type { RopeManager, RopeEntry } from './rope-manager';
import type { FileSprite } from '../view/file-sprite';
import type { MushroomView } from '../view/mushroom-view';
import type { ParticlePool } from '../view/particles';
import type { GlyphPool } from '../view/glyph-pool';
import type { BoxController } from './box-controller';
import type { Atmosphere } from './atmosphere';
import type { SnailController } from './snail-controller';
import type { PointerController } from '../input/pointer-controller';
import type { FanView } from '../view/fan-view';
import type { UiRoot } from '../ui/ui-root';
import type { Sfx } from '../audio/sfx';
import type { SaveController } from '../save/save-controller';
import type { Opening } from './opening';
import { updateFileDebris } from './file-debris';
import { applyHeatFx } from './tool-fx';
import { drawRope } from '../view/rope-view';
import { debrisBurst } from '../input/fx-burst';

export interface GameTickDeps {
  app: Application;
  runtime: WorldRuntime;
  ropes: RopeManager;
  sprites: Map<string, FileSprite>;
  shrooms: Map<string, MushroomView>;
  ensureShroom(id: string): void;
  ropeGfx: Map<RopeEntry, Graphics>;
  pool: ParticlePool;
  glyphs: GlyphPool;
  boxes: BoxController;
  atmosphere: Atmosphere;
  snails: SnailController;
  pointer: PointerController;
  hoverCard: { update(x: number, y: number, locked: boolean): void };
  fpsWatch: (dtSec: number) => void;
  ui: UiRoot;
  sfx: Sfx;
  saver: SaveController;
  getOpening(): Opening | null;
  getFan(): FanView | null;
  autosaveSec: number;
}

export function createGameTick(deps: GameTickDeps): (dtSec: number) => void {
  const {
    runtime,
    ropes,
    sprites,
    shrooms,
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
  } = deps;
  let tSec = 0;
  let autosaveAcc = 0;
  let lastCondition = runtime.dayWeather().condition;
  const overheatWarned = new Set<string>();

  return (dtSec: number): void => {
    tSec += dtSec;
    const opening = deps.getOpening();
    opening?.update(dtSec);

    const landed = ropes.update(dtSec);
    for (const f of landed) {
      runtime.markState(f.id, 'idle');
      const ent = runtime.byId.get(f.id);
      if (ent) {
        ent.node.x = f.x;
        ent.node.y = f.y;
      }
      sprites.get(f.id)?.container.position.set(f.x, f.y);
    }
    runtime.tick(dtSec);

    const hid = pointer.heatTargetId;
    if (hid) applyHeatFx(runtime, sprites, pool, (t) => ui.toast.tip(t), overheatWarned, hid, dtSec);

    // 承重 >100%：断右端 → 图标自由落体 → 绳落地（纯物理反馈，无文字胶囊）
    ropes.checkBreak((entry) => {
      sfx.crack();
      const link = entry.rope.pointAtS(entry.rope.length / 2);
      debrisBurst(pool, link.x, link.y);
      ui.toast.tip('啪嗒——晾衣绳被重量扯断了，文件摔在任务栏边上。', { warn: true });
      const hitBox = boxes.splashNear(link.x);
      if (hitBox) {
        runtime.triggerSurge(0.35, 8);
        sfx.splash();
        ui.toast.tip('崩落的文件砸翻了吸湿盒——半屏都在淌水，湿度暴涨！', { warn: true });
      }
    });

    // 绳上/落体图标同步（唯一真相 = Verlet 质点）
    const pinnedIds = new Set<string>();
    for (const p of ropes.pinnedPositions()) {
      const sprite = sprites.get(p.id);
      if (sprite) {
        sprite.container.position.set(p.x, p.y);
        sprite.setPinned(true);
      }
      const ent = runtime.byId.get(p.id);
      if (ent) {
        ent.node.x = p.x;
        ent.node.y = p.y;
      }
      pinnedIds.add(p.id);
    }
    for (const f of ropes.fallingPositions()) {
      sprites.get(f.id)?.container.position.set(f.x, f.y);
    }
    for (const [id, sprite] of sprites) {
      if (!pinnedIds.has(id)) sprite.setPinned(false);
    }

    // 文件四阶段视觉 + 蘑菇根部锚点（图标上边框零间隙）
    for (const ent of runtime.entities) {
      const sprite = sprites.get(ent.node.id);
      if (!sprite) continue;
      sprite.update(ent.runtime, tSec);
      const m = ent.runtime.mushroom;
      if (m) deps.ensureShroom(ent.node.id);
      const view = shrooms.get(ent.node.id);
      if (!view) continue;
      if (!m) {
        view.container.destroy({ children: true });
        shrooms.delete(ent.node.id);
        continue;
      }
      const anchor = sprite.mushroomAnchor;
      view.container.position.set(anchor.x, anchor.y);
      if (!opening) view.update(m.growth, tSec, pointer.lastPos);
    }

    // 绳索渲染：平滑曲线 + 80%~99% 随机抖动/挂钩裂纹
    for (const [entry, g] of ropeGfx) {
      drawRope(g, entry.rope, entry.tier, tSec, ropes.loadState(entry) === 'warn');
    }

    pool.update(dtSec);
    glyphs.update(dtSec);
    updateFileDebris(runtime, sprites, pool, glyphs, dtSec);
    hoverCard.update(pointer.lastPos.x, pointer.lastPos.y, runtime.locked);
    fpsWatch(dtSec);
    atmosphere.update(runtime, dtSec, tSec, pool, deps.getFan());
    snails.update(runtime, ropes, dtSec, tSec);
    runtime.setBoxAbsorb(boxes.absorbRate);
    boxes.update(dtSec, runtime.env().humidity, tSec);

    const cond = runtime.dayWeather().condition;
    if (cond !== lastCondition) {
      lastCondition = cond;
      sfx.setRain(cond === 'rain' || cond === 'storm' ? 0.8 : 0.15);
    }

    autosaveAcc += dtSec;
    if (autosaveAcc >= deps.autosaveSec) {
      autosaveAcc = 0;
      void saver.flush();
    }
  };
}
