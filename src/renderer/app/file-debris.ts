/** Held / hung wet files lose ink and pigment. Static desktop icons stay quiet. */
import { Graphics } from 'pixi.js';
import type { WorldRuntime } from './world-runtime';
import type { FileSprite } from '../view/file-sprite';
import { PARTICLE_BUDGET, type ParticlePool } from '../view/particles';
import type { GlyphPool } from '../view/glyph-pool';
import { advancePaintDrop, dripClock, type PaintDrop, type PaintTarget } from '../../world/pigment-drips';

interface PigmentSurface {
  readonly container: FileSprite['container'];
  readonly dripOrigin?: { x: number; y: number };
  readonly mediaDripColor?: number;
  paintHit?(x: number, y: number): { u: number; v: number } | null;
  addPaintStain?(u: number, v: number, color: number): void;
}
interface DebrisState {
  clocks: Map<string, number>;
  drops: PaintDrop[];
  graphics: Graphics;
}
export interface FileDebrisOptions { draggedId?: string | null; floorY?: number }
const states = new WeakMap<ParticlePool, DebrisState>();
const PALETTE = [0xe54e78, 0x28a4d5, 0xe4aa2b, 0x8f63cb];

export function updateFileDebris(
  runtime: WorldRuntime,
  sprites: Map<string, FileSprite>,
  pool: ParticlePool,
  glyphs: GlyphPool,
  dtSec: number,
  options: FileDebrisOptions = {},
): void {
  let state = states.get(pool);
  if (!state) {
    const graphics = new Graphics(); graphics.eventMode = 'none';
    pool.container.addChild(graphics);
    state = { clocks: new Map(), drops: [], graphics };
    states.set(pool, state);
  }
  const floorY = options.floorY ?? window.innerHeight - 40;
  const targets: PaintTarget[] = [];
  const present = new Set<string>();
  for (const ent of runtime.entities) {
    const id = ent.node.id;
    present.add(id);
    const sprite = sprites.get(id);
    if (!sprite) continue;
    const surface: PigmentSurface = sprite;
    if (ent.node.category === 'doc-code' && ent.node.kind === 'file' && surface.paintHit) {
      targets.push({ id, hit: (x, y) => surface.paintHit!(x, y) });
    }
    const lifted = ent.runtime.state === 'hung' || options.draggedId === id;
    const eligible = !runtime.locked && ent.node.kind === 'file' && ent.runtime.humidity > 0.65 && lifted
      && (ent.node.category === 'doc-code' || ent.node.category === 'image-video');
    const clock = dripClock(state.clocks.get(id) ?? 0, eligible, dtSec);
    state.clocks.set(id, clock.elapsed);
    if (!clock.emit) continue;
    const origin = surface.dripOrigin ?? { x: sprite.container.x + 50, y: sprite.container.y + 68 };
    if (ent.node.category === 'doc-code') {
      glyphs.spawn(origin.x, origin.y, floorY);
    } else if (state.drops.length < 24 && pool.count + state.drops.length < PARTICLE_BUDGET) {
      state.drops.push({ sourceId: id, x: origin.x, y: origin.y + 2, vx: (Math.random() - 0.5) * 6,
        vy: 12, color: surface.mediaDripColor ?? PALETTE[Math.floor(Math.random() * PALETTE.length)] });
    }
  }
  for (const id of state.clocks.keys()) if (!present.has(id)) state.clocks.delete(id);
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const drop = state.drops[i];
    const impact = advancePaintDrop(drop, Math.min(dtSec, 0.1), targets);
    if (impact) (sprites.get(impact.id) as PigmentSurface | undefined)?.addPaintStain?.(impact.u, impact.v, drop.color);
    if (impact || drop.y >= floorY) state.drops.splice(i, 1);
  }
  const g = state.graphics;
  g.clear();
  for (const drop of state.drops) {
    g.moveTo(drop.x, drop.y - 7).bezierCurveTo(drop.x - 1, drop.y - 2, drop.x - 3, drop.y - 1, drop.x - 2.7, drop.y + 1.2)
      .bezierCurveTo(drop.x - 2, drop.y + 4.2, drop.x + 2, drop.y + 4.2, drop.x + 2.7, drop.y + 1.2)
      .bezierCurveTo(drop.x + 3, drop.y - 1, drop.x + 1, drop.y - 2, drop.x, drop.y - 7).fill({ color: drop.color, alpha: 0.95 });
    g.ellipse(drop.x - 0.8, drop.y - 0.1, 0.65, 1.4).fill({ color: 0xffffff, alpha: 0.65 });
  }
}
