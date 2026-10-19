/**
 * Verlet 悬链线绳（world 纯领域层，零 DOM / 零渲染依赖）
 *
 * 规范锁定：
 * - 32 个质点；每步 15 次距离约束松弛；
 * - 挂载载荷 Fg = log10(sizeBytes+10)×1.8，线性分配到挂点两侧质点；
 * - 挂载文件沿弧长一维刚体排斥：相邻弧长 < 72px 立即位置修正 + 动量交换；
 * - 超过承重：断开右端约束 → 0.3s 后左端也脱开 → 整绳自由落体到 floorY。
 *
 * 绳形是唯一真相：渲染层只读 points / 弧长插值，禁止另算下垂。
 */
import { ropePointLoad } from '../shared/constants';

export const ROPE_NODE_COUNT = 32;
export const ROPE_ITERATIONS = 15;
export const PIN_MIN_DISTANCE = 72;
export const PIN_SNAP_RADIUS = 25;

/** 柔绳预留 4% 松弛量——没有松弛量的刚性链不可能下垂 */
const SLACK = 1.04;
const GRAVITY = 1400;
const LOAD_ACCEL_SCALE = 55;
const MAX_STEP_DISPLACEMENT = 32;
const ANCHOR_MARGIN = 36;

export interface RopePoint {
  x: number;
  y: number;
  /** 上一帧位置（Verlet 速度隐含） */
  px: number;
  py: number;
}

export interface RopePin {
  id: string;
  sizeBytes: number;
  /** 从左锚点起算的弧长 */
  s: number;
  /** 弧长方向速度（滑向最低点 / 动量交换） */
  sv: number;
}

export interface RopeStepOptions {
  floorY?: number;
  width?: number;
}

export interface NearestRopePoint {
  x: number;
  y: number;
  s: number;
  dist: number;
}

export class VerletRope {
  readonly points: RopePoint[] = [];
  readonly pins: RopePin[] = [];
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly rigid: boolean;
  readonly segLen: number;

  attachedLeft = true;
  attachedRight = true;
  broken = false;

  /** 断裂后计时：右端先断，左端在 0.3s 后撕裂脱开 */
  private breakT = 0;
  /** 当前载荷导致的弹性伸长（1 = 无额外伸长） */
  private stretch = 1;
  /** 当前折线累计弧长 */
  private arc: number[] = [];
  private total = 0;

  constructor(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    opts: { rigid?: boolean } = {},
  ) {
    this.ax = ax;
    this.ay = ay;
    this.bx = bx;
    this.by = by;
    this.rigid = opts.rigid ?? false;
    const span = Math.max(1, Math.hypot(bx - ax, by - ay));
    this.segLen = (span * (this.rigid ? 1 : SLACK)) / (ROPE_NODE_COUNT - 1);

    for (let i = 0; i < ROPE_NODE_COUNT; i++) {
      const t = i / (ROPE_NODE_COUNT - 1);
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      this.points.push({ x, y, px: x, py: y });
    }
    this.updateArc();
  }

  get length(): number {
    return this.total;
  }

  /** 固定步物理推进（dt 秒；调用方保证 ≤ 1/30） */
  step(dt: number, opts: RopeStepOptions = {}): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const h = Math.min(dt, 1 / 30);
    const floorY = opts.floorY ?? Infinity;
    const width = opts.width ?? Infinity;

    if (this.broken) {
      this.breakT += h;
      if (this.breakT >= 0.3) this.attachedLeft = false;
    }

    if (this.rigid && this.attachedLeft && this.attachedRight && !this.broken) {
      // 304 钢杆：32 质点仍在，但保持直线杆形
      this.straighten();
      this.updateArc();
      this.resolvePinCollisions();
      return;
    }

    const n = this.points.length;
    const damping = 0.992;
    const loads = new Array<number>(n).fill(0);
    let elasticLoad = 0;
    if (!this.rigid) {
      for (const pin of this.pins) {
        const w = ropePointLoad(pin.sizeBytes);
        // Kilobyte documents should add almost no rope stretch. Retain the
        // shared logarithmic gravity load, but stretch only beyond a 64KiB
        // light-file baseline; GB payloads still visibly lengthen the rope.
        elasticLoad += Math.max(0, w - ropePointLoad(64 * 1024));
        const { i, t } = this.nodeFractionForS(pin.s);
        loads[i] += w * (1 - t);
        loads[Math.min(n - 1, i + 1)] += w * t;
      }
    }
    // 4.2GiB ≈ +7% elastic length; a few KB adds none. Gravity and
    // constraint solving remain the sole source of the resulting rope shape.
    this.stretch = this.rigid ? 1 : 1 + Math.min(0.12, elasticLoad * 0.008);

    for (let i = 0; i < n; i++) {
      if (this.isAnchored(i)) continue;
      const p = this.points[i];
      let vx = (p.x - p.px) * damping;
      let vy = (p.y - p.py) * damping;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_STEP_DISPLACEMENT) {
        const k = MAX_STEP_DISPLACEMENT / speed;
        vx *= k;
        vy *= k;
      }
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + (GRAVITY + loads[i] * LOAD_ACCEL_SCALE) * h * h;
    }

    this.pinAnchors();
    for (let iter = 0; iter < ROPE_ITERATIONS; iter++) this.satisfySegments();
    this.pinAnchors();

    if (Number.isFinite(floorY)) {
      for (const p of this.points) {
        if (p.y > floorY) {
          p.y = floorY;
          p.py = p.y;
        }
      }
    }
    if (Number.isFinite(width)) {
      for (const p of this.points) {
        if (p.x < 4) {
          p.x = 4;
          p.px = p.x;
        } else if (p.x > width - 4) {
          p.x = width - 4;
          p.px = p.x;
        }
      }
    }

    this.updateArc();
    if (!this.rigid) {
      this.slidePins(h);
      this.resolvePinCollisions();
    }
  }

  /** 最近绳点（线段投影，供 25px 吸附判定） */
  nearest(x: number, y: number): NearestRopePoint {
    let best: NearestRopePoint = { x: this.points[0].x, y: this.points[0].y, s: 0, dist: Infinity };
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const dist = Math.hypot(x - px, y - py);
      if (dist < best.dist) {
        best = { x: px, y: py, s: this.arc[i] + Math.sqrt(len2) * t, dist };
      }
    }
    return best;
  }

  /** 按弧长取点（图标挂点位置） */
  pointAtS(s: number): { x: number; y: number } {
    const q = Math.max(0, Math.min(this.total, s));
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const seg = this.arc[i + 1] - this.arc[i];
      if (q <= this.arc[i + 1] || i === this.points.length - 2) {
        const t = seg > 1e-6 ? (q - this.arc[i]) / seg : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return { x: this.points[this.points.length - 1].x, y: this.points[this.points.length - 1].y };
  }

  /** 该弧长处的质点速度（断裂时给图标初速度） */
  velocityAtS(s: number): { vx: number; vy: number } {
    const i = this.nodeIndexForS(s);
    const p = this.points[i];
    return { vx: p.x - p.px, vy: p.y - p.py };
  }

  /** 挂载（s 会被夹到锚点安全区并解决重叠）；重复 id 返回 false */
  attach(id: string, sizeBytes: number, s: number): RopePin | null {
    if (this.broken) return null;
    if (this.pins.some((p) => p.id === id)) return null;
    const pin: RopePin = {
      id,
      sizeBytes,
      s: Math.max(ANCHOR_MARGIN, Math.min(this.total - ANCHOR_MARGIN, s)),
      sv: 0,
    };
    this.pins.push(pin);
    this.resolvePinCollisions();
    return pin;
  }

  detach(id: string): RopePin | null {
    const idx = this.pins.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    return this.pins.splice(idx, 1)[0];
  }

  /** 超过承重：先断右端；0.3s 后左端脱开，整绳自由落体 */
  breakRight(): void {
    if (this.broken) return;
    this.broken = true;
    this.attachedRight = false;
    this.breakT = 0;
  }

  /** 该绳挂载总字节 */
  totalBytes(): number {
    return this.pins.reduce((sum, p) => sum + p.sizeBytes, 0);
  }

  private isAnchored(i: number): boolean {
    return (
      (i === 0 && this.attachedLeft) ||
      (i === this.points.length - 1 && this.attachedRight)
    );
  }

  private pinAnchors(): void {
    const last = this.points.length - 1;
    if (this.attachedLeft) {
      const p = this.points[0];
      p.x = this.ax;
      p.y = this.ay;
      p.px = this.ax;
      p.py = this.ay;
    }
    if (this.attachedRight) {
      const p = this.points[last];
      p.x = this.bx;
      p.y = this.by;
      p.px = this.bx;
      p.py = this.by;
    }
  }

  private straighten(): void {
    for (let i = 0; i < this.points.length; i++) {
      const t = i / (this.points.length - 1);
      const p = this.points[i];
      p.x = this.ax + (this.bx - this.ax) * t;
      p.y = this.ay + (this.by - this.ay) * t;
      p.px = p.x;
      p.py = p.y;
    }
  }

  private satisfySegments(): void {
    const n = this.points.length;
    const targetLen = this.segLen * this.stretch;
    for (let i = 0; i < n - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const diff = (dist - targetLen) / dist;
      const aFixed = this.isAnchored(i);
      const bFixed = this.isAnchored(i + 1);
      if (aFixed && bFixed) continue;
      const wa = aFixed ? 0 : bFixed ? 1 : 0.5;
      const wb = bFixed ? 0 : aFixed ? 1 : 0.5;
      const totalW = wa + wb;
      if (totalW <= 0) continue;
      dx *= diff;
      dy *= diff;
      a.x += (dx * wa) / totalW;
      a.y += (dy * wa) / totalW;
      b.x -= (dx * wb) / totalW;
      b.y -= (dy * wb) / totalW;
    }
  }

  private updateArc(): void {
    this.arc = [0];
    let sum = 0;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      sum += Math.hypot(b.x - a.x, b.y - a.y);
      this.arc.push(sum);
    }
    this.total = sum;
  }

  private nodeFractionForS(s: number): { i: number; t: number } {
    const q = Math.max(0, Math.min(this.total, s));
    for (let i = 0; i < this.arc.length - 1; i++) {
      if (q <= this.arc[i + 1] || i === this.arc.length - 2) {
        const seg = this.arc[i + 1] - this.arc[i];
        return { i, t: seg > 1e-6 ? (q - this.arc[i]) / seg : 0 };
      }
    }
    return { i: this.points.length - 1, t: 0 };
  }

  private nodeIndexForS(s: number): number {
    const { i, t } = this.nodeFractionForS(s);
    return t > 0.5 ? Math.min(this.points.length - 1, i + 1) : i;
  }

  /** 重力导致挂载点向绳最低点滑动（轻文件也会滑，重文件更快） */
  private slidePins(dt: number): void {
    if (this.pins.length === 0) return;
    let lowIdx = 0;
    for (let i = 1; i < this.points.length; i++) {
      if (this.points[i].y > this.points[lowIdx].y) lowIdx = i;
    }
    const lowS = this.arc[lowIdx];
    for (const pin of this.pins) {
      const delta = lowS - pin.s;
      if (Math.abs(delta) < 1.5) {
        pin.sv *= 0.85;
        continue;
      }
      // 目标速度 60~180 px/s：轻文件也能在数秒内滑到最低点，随后由 72px 排斥排开
      const speed = 60 + Math.min(120, ropePointLoad(pin.sizeBytes) * 6);
      const targetV = Math.sign(delta) * speed;
      pin.sv += (targetV - pin.sv) * Math.min(1, dt * 5);
      pin.s += pin.sv * dt;
    }
    this.clampPins();
  }

  private clampPins(): void {
    const maxS = Math.max(ANCHOR_MARGIN, this.total - ANCHOR_MARGIN);
    for (const pin of this.pins) {
      if (pin.s < ANCHOR_MARGIN) {
        pin.s = ANCHOR_MARGIN;
        if (pin.sv < 0) pin.sv = 0;
      } else if (pin.s > maxS) {
        pin.s = maxS;
        if (pin.sv > 0) pin.sv = 0;
      }
    }
  }

  /** 一维刚体排斥：相邻弧长 < 72px 时位置修正 + 动量交换 */
  private resolvePinCollisions(): void {
    if (this.pins.length < 2) return;
    this.pins.sort((a, b) => a.s - b.s);
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (let i = 0; i < this.pins.length - 1; i++) {
        const a = this.pins[i];
        const b = this.pins[i + 1];
        const gap = b.s - a.s;
        if (gap >= PIN_MIN_DISTANCE) continue;
        const mid = (a.s + b.s) / 2;
        a.s = mid - PIN_MIN_DISTANCE / 2;
        b.s = mid + PIN_MIN_DISTANCE / 2;
        // 动量交换：重载一侧获得更多反向冲量（等质量近似下交换 50%）
        const va = a.sv;
        const vb = b.sv;
        a.sv = vb * 0.5;
        b.sv = va * 0.5;
        moved = true;
      }
      this.clampPins();
      if (!moved) break;
    }
    this.pins.sort((a, b) => a.s - b.s);
  }
}
