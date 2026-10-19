import { Graphics, Sprite, type Application, type Container } from 'pixi.js';
import type { WorldRuntime } from './world-runtime';
import type { MushroomView } from '../view/mushroom-view';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';
import type { Tool } from '../input/pointer-deps';
import type { MushroomState } from '../../shared/types/file-runtime';
import { SPECIES } from '../../world/mushroom-species';
import { cutMushroom, tickCutMushroom, boleteCutColor, heatSpecialMushroom, mushroomSaleEffect } from '../../world/special-mushrooms';
import { Hallucination } from '../view/hallucination';
import { sporeBurst } from '../input/fx-burst';
import { emitAction } from './events';
import { trackEvent, trackFirst } from './telemetry';
import { isUiElement } from '../ui/interactive-surface';

interface HarvestDeps {
  app: Application;
  runtime: WorldRuntime;
  shrooms: Map<string, MushroomView>;
  sfx: Sfx;
  pool: ParticlePool;
  layer: Container;
  getTool(): Tool;
  refresh(): void;
}
interface Detached {
  item: MushroomState;
  view: MushroomView;
  cutFace: Graphics;
  vy: number;
  falling: boolean;
  bounces: number;
  smoke: number;
}
interface Gesture {
  target: Detached;
  pointerId: number;
  mode: 'drag' | 'heat';
  dx: number;
  dy: number;
  x: number;
  y: number;
}

/** Detached fungi use native pointer events through the same transparent desktop canvas. */
export class HarvestController {
  private readonly detached: Detached[] = [];
  private readonly hallucination: Hallucination;
  private gesture: Gesture | null = null;
  private time = 0;

  constructor(private readonly deps: HarvestDeps) {
    this.hallucination = new Hallucination(deps.app);
    window.addEventListener('pointerdown', this.onDown, true);
    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('pointerup', this.onUp, true);
    window.addEventListener('pointercancel', this.cancel, true);
    window.addEventListener('blur', this.cancel);
  }

  /** Return true for special species even when unavailable, preventing ordinary auto-sale. */
  pick(id: string): boolean {
    const entity = this.deps.runtime.byId.get(id);
    const mushroom = entity?.runtime.mushroom;
    if (!mushroom || mushroom.species !== 'bolete' && mushroom.species !== 'lava') return false;
    if (this.deps.runtime.locked || this.detached.length >= 16) return true;
    const item = cutMushroom(mushroom), view = this.deps.shrooms.get(id);
    if (!item || !view || !entity) return true;
    entity.runtime.mushroom = null;
    this.deps.shrooms.delete(id);
    view.setDetached();
    this.deps.layer.addChild(view.container);
    const cutFace = new Graphics(); view.container.addChild(cutFace);
    this.detached.push({ item, view, cutFace, vy: 0, falling: false, bounces: 0, smoke: 0 });
    this.deps.runtime.stats.harvested += 1;
    this.deps.runtime.onChange?.(); this.deps.refresh(); this.deps.sfx.snip();
    sporeBurst(this.deps.pool, view.container.x, view.container.y);
    emitAction('pick'); trackFirst('first_pick');
    return true;
  }

  /** Active drags retain canvas input even between the mushroom and its selling target. */
  hit(x: number, y: number): boolean {
    return !this.deps.runtime.locked && (!!this.gesture || !!this.at(x, y));
  }

  /** Read-only evidence for native UAT; no input or state mutation is exposed. */
  snapshot(): { species: string; cooking: number; cutAgeSeconds: number; x: number; y: number }[] {
    return this.detached.map(({ item, view }) => ({ species: item.species,
      cooking: item.cooking ?? 0, cutAgeSeconds: item.cutAgeSeconds ?? 0,
      x: view.container.x, y: view.container.y }));
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.deps.runtime.locked) return;
    this.time += dt; this.hallucination.update(dt);
    for (const target of this.detached) {
      tickCutMushroom(target.item, dt);
      target.view.update(1, this.time);
      target.cutFace.clear();
      if (target.item.species === 'bolete') {
        target.cutFace.ellipse(0, 1, 6, 3.2).fill(boleteCutColor(target.item))
          .stroke({ color: 0x514226, width: 0.7 });
        target.cutFace.ellipse(-1.4, 0, 2.8, 0.7).fill({ color: 0xfff2cd, alpha: 0.4 });
      }
      const gesture = this.gesture;
      if (gesture?.target === target && gesture.mode === 'heat' && this.contains(target, gesture.x, gesture.y)) {
        const wasCooked = (target.item.cooking ?? 0) >= 1;
        const cooked = heatSpecialMushroom(target.item, dt);
        if (cooked && !wasCooked) this.deps.sfx.pop(0.8);
        target.smoke += dt;
        if (target.smoke >= 0.12) {
          target.smoke = 0;
          this.deps.pool.spawn({ x: target.view.container.x, y: target.view.container.y - 28,
            vx: (Math.random() - 0.5) * 10, vy: -16, gravity: -8, color: 0xf6f3df,
            size: 2.8, life: 0.9, shape: 'circle', alpha: 0.3 });
        }
      }
      const cooking = target.item.cooking ?? 0;
      target.view.container.tint = (255 << 16) | ((255 - Math.round(cooking * 60)) << 8) | (255 - Math.round(cooking * 130));
      if (!target.falling || gesture?.target === target) continue;
      target.vy += dt * 900;
      target.view.container.y += target.vy * dt;
      const floor = this.deps.app.screen.height - 54;
      if (target.view.container.y < floor) continue;
      target.view.container.y = floor;
      if (target.bounces++ === 0 && target.vy > 50) target.vy *= -0.22;
      else { target.falling = false; target.vy = 0; }
    }
  }

  private at(x: number, y: number): Detached | null {
    return [...this.detached].reverse().find((target) => this.contains(target, x, y)) ?? null;
  }

  private contains(target: Detached, x: number, y: number): boolean {
    // A MushroomView's mask is intentionally wider than its artwork. Do not
    // let that invisible clipping rectangle steal neighbouring file clicks.
    const art = target.view.container.children.find((child) => child instanceof Sprite);
    const bounds = (art ?? target.view.container).getBounds();
    return x >= bounds.x - 8 && x <= bounds.x + bounds.width + 8
      && y >= bounds.y - 8 && y <= bounds.y + bounds.height + 8;
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.deps.runtime.locked) return;
    if (isUiElement(event.target)) return;
    const target = this.at(event.clientX, event.clientY);
    if (!target) return;
    this.gesture = { target, pointerId: event.pointerId,
      mode: this.deps.getTool() === 'heat' ? 'heat' : 'drag',
      dx: event.clientX - target.view.container.x, dy: event.clientY - target.view.container.y,
      x: event.clientX, y: event.clientY };
    target.falling = false;
    try { (event.target as Element | null)?.setPointerCapture(event.pointerId); } catch { /* Browser may have already captured it. */ }
    event.preventDefault(); event.stopImmediatePropagation();
  };

  private readonly onMove = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    g.x = event.clientX; g.y = event.clientY;
    if (g.mode === 'drag') this.moveDrag(g, event.clientX, event.clientY);
    event.preventDefault(); event.stopImmediatePropagation();
  };

  private moveDrag(g: Gesture, x: number, y: number): void {
    g.target.view.container.position.set(
      Math.max(16, Math.min(this.deps.app.screen.width - 16, x - g.dx)),
      Math.max(36, Math.min(this.deps.app.screen.height - 54, y - g.dy)));
  }

  private readonly onUp = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    this.gesture = null;
    if (g.mode === 'drag') {
      // Native fast drags can coalesce their last pointermove. Use the actual
      // release coordinate before selling or starting the dropped item's fall.
      this.moveDrag(g, event.clientX, event.clientY);
      if (this.overCoins(event.clientX, event.clientY)) this.sell(g.target);
      else { g.target.falling = true; g.target.vy = 0; g.target.bounces = 0; }
    }
    event.preventDefault(); event.stopImmediatePropagation();
  };

  private overCoins(x: number, y: number): boolean {
    const rect = document.querySelector('.coin-pill')?.getBoundingClientRect();
    return !!rect && rect.width > 0 && x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12;
  }

  private sell(target: Detached): void {
    const effect = mushroomSaleEffect(target.item), price = SPECIES[target.item.species].price;
    this.deps.runtime.chargeCoins(-price);
    this.deps.runtime.stats.earned += price;
    this.deps.runtime.onChange?.(); this.deps.refresh(); this.deps.sfx.coin();
    const pos = target.view.container.position;
    this.deps.pool.burst(pos.x, pos.y - 18, 8, () => ({ x: pos.x, y: pos.y - 18, vx: (Math.random() - 0.5) * 120,
      vy: -80 - Math.random() * 90, gravity: 260, color: 0xe3b95f, size: 2, life: 0.7, shape: 'circle' }));
    this.detached.splice(this.detached.indexOf(target), 1); target.view.container.destroy({ children: true });
    if (effect) this.hallucination.trigger(effect.seconds);
    emitAction('sell'); trackFirst('first_sale'); trackEvent('mushroom_sold', { earned: price, species: target.item.species });
  }

  private readonly cancel = (): void => { this.gesture = null; };

  destroy(): void {
    window.removeEventListener('pointerdown', this.onDown, true);
    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('pointerup', this.onUp, true);
    window.removeEventListener('pointercancel', this.cancel, true);
    window.removeEventListener('blur', this.cancel);
    for (const target of this.detached) target.view.container.destroy({ children: true });
    this.detached.length = 0; this.hallucination.destroy();
  }
}
