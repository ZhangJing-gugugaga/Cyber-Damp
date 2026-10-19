/**
 * 绳索管理器（app 装配层）
 * - 持有 VerletRope（32 质点 / 15 次约束）；
 * - 25px 吸附判定 → PINNED；挂载点沿弧长一维排斥（≥72px）；
 * - 80%~99% 返回 warn（渲染层抖动 + 挂钩裂纹）；≥100% 断右端 → 图标与绳落体。
 */
import { PIN_SNAP_RADIUS, VerletRope } from '../../world/verlet-rope';
import {
  ropeByteLimit,
  ropeLoadRatio,
  ropeLoadState,
  type RopeLoadState,
} from '../../world/rope-load';
import { FILE_CELL_W, FILE_ICON_TOP } from '../view/token-colors';
import type { FileNode } from '../../shared/types/file-node';
import type { RopeSave } from '../../shared/types/save';
import { createFallingBody, stepFallingBody, type FallingBody } from '../../world/falling-file';

export interface RopeEntry {
  rope: VerletRope;
  tier: string;
  broken: boolean;
}

interface FallingFile extends FallingBody {
  id: string;
}

export interface PinnedPosition {
  id: string;
  /** FileSprite 容器（网格单元左上角）坐标 */
  x: number;
  y: number;
  /** Scatter rotation in radians; rope-pinned files omit this. */
  angle?: number;
}

export interface LandedFile {
  id: string;
  x: number;
  y: number;
  angle: number;
}

export interface FloorContact {
  id: string;
  /** First and second contacts rebound; the third comes to rest. */
  contact: number;
}

export interface NearestRope {
  entry: RopeEntry;
  x: number;
  y: number;
  s: number;
  dist: number;
}

/** 同屏最多 2 条绳（SPEC §10 并发边界） */
export const MAX_ROPES = 2;
const TASKBAR_GAP = 60;
// Fallen files use the 92px desktop label, rather than the 68px pinned label.
// Leave room for the icon's scatter tilt and its complete filename as well.
const LANDING_SLOT_DISTANCE = 120;

export class RopeManager {
  readonly entries: RopeEntry[] = [];
  private falling: FallingFile[] = [];
  private floorContacts: FloorContact[] = [];
  private landedSlots = new Map<string, { x: number; y: number }>();
  private width = 1920;
  private height = 1040;

  setViewport(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  canSpawn(): boolean {
    return this.entries.filter((e) => !e.broken).length < MAX_ROPES;
  }

  spawn(ax: number, ay: number, bx: number, by: number, tier: string): RopeEntry | null {
    if (!this.canSpawn()) return null;
    const rope = new VerletRope(ax, ay, bx, by, { rigid: tier === 'rope-3' });
    const entry: RopeEntry = { rope, tier, broken: false };
    this.entries.push(entry);
    return entry;
  }

  /**
   * 挂文件：距绳质点 < 25px 才允许 PINNED。
   * @param pos 松手位置（屏幕坐标）
   */
  hang(entry: RopeEntry, node: FileNode, pos: { x: number; y: number }): boolean {
    if (entry.broken || node.kind === 'recycle') return false;
    if (this.isPinned(node.id)) return false;
    const near = entry.rope.nearest(pos.x, pos.y);
    if (near.dist > PIN_SNAP_RADIUS) return false;
    this.landedSlots.delete(node.id);
    return entry.rope.attach(node.id, node.sizeBytes, near.s) !== null;
  }

  /** 读档恢复：按给定弧长挂载 */
  pinAt(entry: RopeEntry, node: FileNode, s: number): boolean {
    if (entry.broken || node.kind === 'recycle') return false;
    if (this.isPinned(node.id)) return false;
    this.landedSlots.delete(node.id);
    return entry.rope.attach(node.id, node.sizeBytes, s) !== null;
  }

  isPinned(fileId: string): boolean {
    return this.entries.some((e) => e.rope.pins.some((p) => p.id === fileId));
  }

  releaseFile(fileId: string): boolean {
    let removed = false;
    for (const e of this.entries) {
      if (e.rope.detach(fileId)) removed = true;
    }
    const before = this.falling.length;
    this.falling = this.falling.filter((f) => f.id !== fileId);
    this.landedSlots.delete(fileId);
    removed = removed || before !== this.falling.length;
    return removed;
  }

  /** Explosion throws share the same bounded fall and landing slots as rope breaks. */
  throwFile(node: FileNode, position: { x: number; y: number }, velocity: { vx: number; vy: number }): void {
    this.releaseFile(node.id);
    this.beginFall(node.id, position, velocity);
  }

  private beginFall(id: string, position: { x: number; y: number }, velocity: { vx: number; vy: number }): void {
    this.falling.push({ id, ...createFallingBody(id, position, velocity) });
  }

  /** 最近绳点（25px 内才算，命中测试与吸附共用） */
  nearestPoint(x: number, y: number): NearestRope | null {
    let best: NearestRope | null = null;
    for (const entry of this.entries) {
      if (entry.broken) continue;
      const near = entry.rope.nearest(x, y);
      if (near.dist > PIN_SNAP_RADIUS) continue;
      if (!best || near.dist < best.dist) {
        best = { entry, x: near.x, y: near.y, s: near.s, dist: near.dist };
      }
    }
    return best;
  }

  /** 所有 PINNED 图标的容器坐标（图标上边框 = 绳质点） */
  pinnedPositions(): PinnedPosition[] {
    const out: PinnedPosition[] = [];
    for (const entry of this.entries) {
      if (entry.broken) continue;
      for (const pin of entry.rope.pins) {
        const p = entry.rope.pointAtS(pin.s);
        out.push({ id: pin.id, x: p.x - FILE_CELL_W / 2, y: p.y - FILE_ICON_TOP });
      }
    }
    return out;
  }

  /** 断绳后自由落体中的图标（容器坐标） */
  fallingPositions(): PinnedPosition[] {
    return this.falling.map((f) => ({ id: f.id, x: f.x, y: f.y, angle: f.angle }));
  }

  /** Consume physical impacts once; audio remains outside the simulation. */
  drainBounceEvents(): FloorContact[] {
    return this.floorContacts.splice(0);
  }

  /** 固定步推进；返回本步落地的文件（调用方置 idle + 写回 node 坐标） */
  update(dt: number): LandedFile[] {
    const floorY = this.height - TASKBAR_GAP;
    for (const entry of this.entries) {
      entry.rope.step(dt, { floorY, width: this.width });
    }

    const landed: LandedFile[] = [];
    // 网格单元高 110：单元底边落在任务栏上方（Y = screenHeight - 60）
    const iconFloorTop = floorY - 110;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      const before = f.bounces;
      stepFallingBody(f, dt, { width: this.width, cellWidth: FILE_CELL_W, floorTop: iconFloorTop });
      for (let contact = before + 1; contact <= f.bounces; contact++) {
        this.floorContacts.push({ id: f.id, contact });
      }
      if (f.settled) this.floorContacts.push({ id: f.id, contact: 3 });
      if (this.floorContacts.length > 128) this.floorContacts.splice(0, this.floorContacts.length - 128);
      if (!f.settled) continue;
      const slot = this.claimLandingSlot(f.x);
      this.falling.splice(i, 1);
      this.landedSlots.set(f.id, slot);
      landed.push({ id: f.id, x: slot.x, y: slot.y, angle: f.restAngle });
    }
    return landed;
  }

  /** 底边散落：桌面标签和散落旋转需要120px槽位。 */
  private claimLandingSlot(desiredX: number): { x: number; y: number } {
    const y = this.height - TASKBAR_GAP - 110;
    const maxSlot = Math.max(0, Math.floor((this.width - FILE_CELL_W - 8) / LANDING_SLOT_DISTANCE));
    const used = new Set<number>();
    for (const p of this.landedSlots.values()) {
      used.add(Math.round((p.x - 8) / LANDING_SLOT_DISTANCE));
    }
    const base = Math.max(0, Math.min(maxSlot, Math.round((desiredX - 8) / LANDING_SLOT_DISTANCE)));
    for (let step = 0; step <= maxSlot; step++) {
      for (const candidate of step === 0 ? [base] : [base + step, base - step]) {
        if (candidate >= 0 && candidate <= maxSlot && !used.has(candidate)) {
          return { x: 8 + candidate * LANDING_SLOT_DISTANCE, y };
        }
      }
    }
    return { x: 8 + base * LANDING_SLOT_DISTANCE, y };
  }

  totalBytes(entry: RopeEntry): number {
    return entry.rope.totalBytes();
  }

  loadState(entry: RopeEntry): RopeLoadState {
    if (entry.broken) return 'break';
    return ropeLoadState(this.totalBytes(entry), entry.tier);
  }

  loadRatio(entry: RopeEntry): number {
    return ropeLoadRatio(this.totalBytes(entry), entry.tier);
  }

  /** 绳型字节上限（Demo 容量预检用） */
  limitOf(tier: string): number {
    return ropeByteLimit(tier);
  }

  /**
   * 超载断绳：断开右端 → 挂载图标脱落进入自由落体；0.3s 后左端撕裂，整绳落地。
   * onBreak 只做表现层反馈（音效/toast/吸湿盒泼洒）。
   */
  checkBreak(onBreak: (entry: RopeEntry) => void): void {
    for (const e of this.entries) {
      if (e.broken) continue;
      if (ropeLoadState(this.totalBytes(e), e.tier) !== 'break') continue;
      e.broken = true;
      e.rope.breakRight();
      const pins = [...e.rope.pins];
      for (const pin of pins) {
        const p = e.rope.pointAtS(pin.s);
        const v = e.rope.velocityAtS(pin.s);
        this.beginFall(pin.id, {
          x: p.x - FILE_CELL_W / 2,
          y: p.y - FILE_ICON_TOP,
        }, {
          vx: v.vx * 60 + (Math.random() - 0.5) * 40,
          vy: Math.max(0, v.vy * 60),
        });
        e.rope.detach(pin.id);
      }
      onBreak(e);
    }
  }

  /** 购买新绳型：既有绳即时换材质与承重 */
  setTierAll(tier: string): void {
    for (const e of this.entries) e.tier = tier;
  }

  snapshot(): RopeSave[] {
    return this.entries
      .filter((e) => !e.broken)
      .map((e, i) => ({
        id: `r-${String(i + 1).padStart(3, '0')}`,
        ax: e.rope.ax,
        ay: e.rope.ay,
        bx: e.rope.bx,
        by: e.rope.by,
        tier: e.tier,
        fileIds: e.rope.pins.map((p) => p.id),
      }));
  }
}
