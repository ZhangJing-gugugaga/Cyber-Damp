import { PIN_MIN_DISTANCE } from '../../world/verlet-rope';
import type { Sfx } from '../audio/sfx';
import type { RopeEntry, RopeManager } from './rope-manager';

/** Sound follows physical load/contact; resting pairs never rattle every frame. */
export class RopeAudio {
  private time = 0;
  private creakTimers = new Map<RopeEntry, number>();
  private touching = new Set<string>();
  private lastKnock = new Map<string, number>();

  constructor(private ropes: RopeManager, private sfx: Sfx) {}

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.time += Math.min(dt, 0.25);
    const touching = new Set<string>();
    const strained = new Set<RopeEntry>();
    let knock = this.ropes.drainBounceEvents().length > 0;
    for (const entry of this.ropes.entries) {
      if (entry.broken) continue;
      if (this.ropes.loadState(entry) === 'warn') {
        strained.add(entry);
        const remaining = (this.creakTimers.get(entry) ?? 0) - dt;
        if (remaining <= 0) {
          this.sfx.creak();
          this.creakTimers.set(entry, 0.8);
        } else this.creakTimers.set(entry, remaining);
      }
      const pins = [...entry.rope.pins].sort((a, b) => a.s - b.s);
      for (let i = 1; i < pins.length; i++) {
        const a = pins[i - 1], b = pins[i];
        if (b.s - a.s > PIN_MIN_DISTANCE + 0.7) continue;
        const key = JSON.stringify([a.id, b.id].sort());
        touching.add(key);
        if (!this.touching.has(key) && this.time - (this.lastKnock.get(key) ?? -Infinity) >= 0.35) {
          knock = true;
          this.lastKnock.set(key, this.time);
        }
      }
    }
    // Coincident impacts share one thunk, avoiding dozens of summed transients.
    if (knock) this.sfx.knock();
    this.touching = touching;
    for (const entry of this.creakTimers.keys()) if (!strained.has(entry)) this.creakTimers.delete(entry);
    for (const [pair, at] of this.lastKnock) if (!touching.has(pair) && this.time - at > 2) this.lastKnock.delete(pair);
  }
}
