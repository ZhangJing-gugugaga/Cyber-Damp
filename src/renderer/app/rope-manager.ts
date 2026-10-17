/**
 * 绳索管理器（app 装配层）：持有绳实体 / 文件刚体 / 崩断判定
 * SPEC §6：文件刚体仅在挂载时创建；质量走 massEff（AC-37）；崩断按 Σ sizeBytes（AC-12b）
 * AC-22：绳型切换即时改外观与承重（setTierAll）
 */
import Matter from 'matter-js';
import {
  createRope,
  breakRope,
  createFileBody,
  applyMass,
  bodySizeBytes,
} from '../physics/rope-factory';
import type { Rope } from '../physics/rope-factory';
import { hangFile, ropeByteLimit, ropeLoadState } from '../physics/hang-controller';
import type { RopeLoadState } from '../physics/hang-controller';
import { massEff } from '../physics/weight';
import { FILE_ICON_W, FILE_ICON_H } from '../view/token-colors';
import type { FileNode } from '../../shared/types/file-node';
import type { RopeSave } from '../../shared/types/save';

export interface RopeEntry {
  rope: Rope;
  tier: string;
  bodies: Matter.Body[];
  broken: boolean;
}

/** 同屏最多 2 条绳（SPEC §10 并发边界） */
export const MAX_ROPES = 2;

export class RopeManager {
  readonly entries: RopeEntry[] = [];
  private bodyByFile = new Map<string, Matter.Body>();

  constructor(private world: Matter.World) {}

  canSpawn(): boolean {
    return this.entries.filter((e) => !e.broken).length < MAX_ROPES;
  }

  spawn(ax: number, ay: number, bx: number, by: number, tier: string): RopeEntry | null {
    if (!this.canSpawn()) return null;
    const rope = createRope(this.world, ax, ay, bx, by);
    const entry: RopeEntry = { rope, tier, bodies: [], broken: false };
    this.entries.push(entry);
    return entry;
  }

  /**
   * 挂文件：创建刚体 + 指数化质量 + 夹子约束（重文件自动多点挂载）
   * @param pos 挂载点（绳链附近），文件刚体从该点垂下
   */
  hang(entry: RopeEntry, node: FileNode, pos: { x: number; y: number }): boolean {
    if (entry.broken || this.bodyByFile.has(node.id)) return false;
    const body = createFileBody(pos.x, pos.y + FILE_ICON_H * 0.4, FILE_ICON_W, FILE_ICON_H * 0.55, node.sizeBytes, node.id);
    applyMass(body, massEff(node.sizeBytes));
    Matter.Composite.add(this.world, body);
    hangFile(this.world, entry.rope, body, massEff(node.sizeBytes));
    entry.bodies.push(body);
    this.bodyByFile.set(node.id, body);
    return true;
  }

  bodyOf(fileId: string): Matter.Body | undefined {
    return this.bodyByFile.get(fileId);
  }

  /** 全部文件刚体对（视图同步用：绳上 + 坠落中） */
  pairs(): Array<[string, Matter.Body]> {
    return [...this.bodyByFile.entries()];
  }

  totalBytes(entry: RopeEntry): number {
    return entry.bodies.reduce((s, b) => s + bodySizeBytes(b), 0);
  }

  loadState(entry: RopeEntry): RopeLoadState {
    if (entry.broken) return 'break';
    return ropeLoadState(this.totalBytes(entry), entry.tier);
  }

  /** 绳型字节上限（Demo 容量预检用，AC-32） */
  limitOf(tier: string): number {
    return ropeByteLimit(tier);
  }

  /** 每步崩断判定（字节累计，AC-12b）；onBreak 交表现层处理音效/toast */
  checkBreak(onBreak: (entry: RopeEntry) => void): void {
    for (const e of this.entries) {
      if (e.broken) continue;
      if (this.loadState(e) === 'break') {
        e.broken = true;
        breakRope(this.world, e.rope);
        onBreak(e);
      }
    }
  }

  /** AC-22：购买红塑料绳即时改外观承重——既有绳整体换 tier */
  setTierAll(tier: string): void {
    for (const e of this.entries) e.tier = tier;
  }

  /** 崩断绳上的文件不再受绳约束（自由落体由 Matter 涌现） */
  bodiesOf(entry: RopeEntry): Matter.Body[] {
    return entry.bodies;
  }

  snapshot(): RopeSave[] {
    return this.entries.map((e, i) => ({
      id: `r-${String(i + 1).padStart(3, '0')}`,
      ax: e.rope.ax,
      ay: e.rope.ay,
      bx: e.rope.bx,
      by: e.rope.by,
      tier: e.tier,
      fileIds: e.bodies
        .map((b) => (b.plugin as { fileId?: string } | undefined)?.fileId ?? '')
        .filter((id) => id.length > 0),
    }));
  }
}
