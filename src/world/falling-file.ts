/** Bounded icon flight: two visible, damped rebounds before the final rest. */
export interface FallingBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  restAngle: number;
  bounces: number;
  settled: boolean;
}

export interface FallingBounds {
  width: number;
  cellWidth: number;
  floorTop: number;
}

/** Stable per-file tilt avoids a new random pose on every render frame. */
export function scatterAngle(id: string): number {
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619);
  return (((hash >>> 0) % 1001) / 1000 - 0.5) * 0.34;
}

export function createFallingBody(
  id: string,
  position: { x: number; y: number },
  velocity: { vx: number; vy: number },
): FallingBody {
  const restAngle = scatterAngle(id);
  const finite = (n: number) => Number.isFinite(n) ? n : 0;
  return {
    x: finite(position.x), y: finite(position.y),
    vx: finite(velocity.vx), vy: finite(velocity.vy),
    angle: restAngle * 0.4,
    spin: Math.sign(velocity.vx || restAngle || 1) * 1.2,
    restAngle, bounces: 0, settled: false,
  };
}

/** Small substeps keep fast explosion throws from tunnelling through boundaries. */
export function stepFallingBody(body: FallingBody, dt: number, bounds: FallingBounds): void {
  if (body.settled || !Number.isFinite(dt) || dt <= 0) return;
  const elapsed = Math.min(dt, 0.25);
  const steps = Math.ceil(elapsed * 120);
  const h = elapsed / steps;
  const maxX = Math.max(0, bounds.width - bounds.cellWidth);
  const floor = Math.max(0, bounds.floorTop);
  body.x = Math.max(0, Math.min(maxX, body.x));
  body.y = Math.max(0, Math.min(floor, body.y));
  for (let i = 0; i < steps && !body.settled; i++) {
    body.vy += 2200 * h;
    body.x += body.vx * h;
    body.y += body.vy * h;
    body.vx *= Math.exp(-0.9 * h);
    body.angle += body.spin * h;
    body.spin *= Math.exp(-1.1 * h);
    if (body.x < 0 || body.x > maxX) {
      body.x = Math.max(0, Math.min(maxX, body.x));
      body.vx *= -0.35;
      body.spin *= -0.5;
    }
    if (body.y < 0) {
      body.y = 0;
      body.vy = Math.abs(body.vy) * 0.3;
    }
    if (body.y < floor || body.vy < 0) continue;
    body.y = floor;
    if (body.bounces < 2 && floor > 0) {
      const first = body.bounces === 0;
      body.vy = -Math.max(first ? 520 : 240, body.vy * (first ? 0.44 : 0.42));
      body.vx *= first ? 0.56 : 0.45;
      body.spin *= -0.4;
      body.bounces++;
    } else {
      body.vx = body.vy = body.spin = 0;
      body.angle = body.restAngle;
      body.settled = true;
    }
  }
}
