/** Cosmetic pigment never touches file contents. Coordinates are desktop pixels. */
export const FILE_DRIP_INTERVAL = 2;

export interface PaintPoint { u: number; v: number }
export interface PaintDrop {
  sourceId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
}
export interface PaintTarget {
  id: string;
  hit(x: number, y: number): PaintPoint | null;
}
export interface PaintImpact extends PaintPoint { id: string }

/** Releasing or drying starts a fresh two-second drip interval. */
export function dripClock(elapsed: number, eligible: boolean, dt: number): { elapsed: number; emit: boolean } {
  if (!eligible || !Number.isFinite(dt) || dt <= 0) return { elapsed: eligible ? elapsed : 0, emit: false };
  const next = elapsed + dt;
  return next + 1e-9 >= FILE_DRIP_INTERVAL
    ? { elapsed: Math.max(0, next - Math.floor((next + 1e-9) / FILE_DRIP_INTERVAL) * FILE_DRIP_INTERVAL), emit: true }
    : { elapsed: next, emit: false };
}

/** Sweep the travelled path so a low frame rate cannot skip a thin opaque edge. */
export function advancePaintDrop(drop: PaintDrop, dt: number, targets: readonly PaintTarget[]): PaintImpact | null {
  if (!Number.isFinite(dt) || dt <= 0) return null;
  const gravity = 210;
  const oldX = drop.x, oldY = drop.y, oldVy = drop.vy;
  const distance = Math.hypot(drop.vx * dt, oldVy * dt + gravity * dt * dt / 2);
  const steps = Math.max(1, Math.ceil(distance));
  for (let step = 1; step <= steps; step++) {
    const t = dt * step / steps;
    const x = oldX + drop.vx * t;
    const y = oldY + oldVy * t + gravity * t * t / 2;
    for (const target of targets) {
      if (target.id === drop.sourceId) continue;
      const point = target.hit(x, y);
      if (point) {
        drop.x = x; drop.y = y; drop.vy = oldVy + gravity * t;
        return { id: target.id, ...point };
      }
    }
  }
  drop.x = oldX + drop.vx * dt;
  drop.y = oldY + oldVy * dt + gravity * dt * dt / 2;
  drop.vy = oldVy + gravity * dt;
  return null;
}
