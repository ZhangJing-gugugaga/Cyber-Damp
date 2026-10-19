import { Container, Graphics } from 'pixi.js';
import { tickSpecialMushrooms } from '../../world/special-mushrooms';
import type { WorldRuntime } from './world-runtime';
import type { RopeManager } from './rope-manager';
import type { FileSprite } from '../view/file-sprite';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';

/** Logical fungal events become desktop-only visual scars and physical impulses. */
export class SpecialMushroomController {
  private readonly craters: Graphics[] = [];
  constructor(private readonly deps: { runtime: WorldRuntime; ropes: RopeManager; sprites: Map<string, FileSprite>;
    layer: Container; pool: ParticlePool; sfx: Sfx }) {}

  update(dt: number): void {
    const { runtime, ropes, sprites, pool, sfx } = this.deps;
    if (runtime.locked) return;
    const files = runtime.entities.map((e) => {
      const p = sprites.get(e.node.id)?.container.position ?? e.node;
      return { ...e.node, x: p.x + 50, y: p.y + 36, runtime: e.runtime };
    });
    const hung = ropes.entries.flatMap((entry, i) => entry.broken ? [] : entry.rope.pins.map((p) => ({ id: p.id, s: p.s, ropeId: String(i) })));
    for (const event of tickSpecialMushrooms(files, hung, dt)) {
      if (event.type === 'sprout') { sfx.pop(0.7); continue; }
      this.crater(event.x, event.y, event.craterDiameter / 2);
      sfx.explosion();
      pool.burst(event.x, event.y, 44, () => ({ x: event.x, y: event.y,
        vx: (Math.random() - 0.5) * 600, vy: -100 - Math.random() * 420, gravity: 620,
        color: Math.random() < 0.5 ? 0x221b19 : 0xe0752e, size: 2 + Math.random() * 4, life: 1.6, alpha: 0.85, shape: 'circle' }));
      for (const impulse of event.impulses) {
        const ent = runtime.byId.get(impulse.id), sp = sprites.get(impulse.id);
        if (ent && sp) ropes.throwFile(ent.node, sp.container.position, impulse);
      }
      runtime.onChange?.();
    }
  }

  private crater(x: number, y: number, radius: number): void {
    const g = new Graphics(); g.eventMode = 'none'; g.position.set(x, y);
    // The outer diameter is exactly 200 logical pixels, with a soot-softened rim.
    for (let i = 12; i >= 0; i--) g.circle(0, 0, radius * (0.75 + i / 48)).fill({ color: 0x100c0b, alpha: 0.035 + (12 - i) * 0.008 });
    for (let i = 0; i < 34; i++) {
      const a = i * 2.39996, r = radius * (0.55 + (i % 9) / 24);
      g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.86, 2 + i % 5, 1 + i % 3).fill({ color: 0x211914, alpha: 0.6 });
    }
    this.deps.layer.addChild(g); this.craters.push(g);
    if (this.craters.length > 8) this.craters.shift()!.destroy();
  }
}
