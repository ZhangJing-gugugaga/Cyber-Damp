/**
 * 挂载与崩断控制（physics 适配层）
 * SPEC §6：崩断按字节累计判定（Σ sizeBytes 超绳型上限）；80% 预警为表现层信号
 * 架构包络：mass_eff > 10 的重文件必须 2-3 个夹子约束多点挂载（单点质量比 ≤40:1）
 */
import Matter from 'matter-js';
import { ROPE_BYTE_LIMITS } from '../../shared/constants';
import type { Rope } from './rope-factory';
import { bodySizeBytes } from './rope-factory';

const { Constraint, Composite } = Matter;

/** 重文件阈值：mass_eff > 10 多点挂载 */
export const HEAVY_MASS_THRESHOLD = 10;

export interface HangResult {
  /** 该文件的所有夹子约束 */
  clips: Matter.Constraint[];
}

/**
 * 把文件刚体夹到绳上（就近绳链 + 夹口偏移）。
 * 重文件按质量计算夹子数：mass_eff>10 时 2-3 个约束分布到相邻链点。
 */
export function hangFile(
  world: Matter.World,
  rope: Rope,
  fileBody: Matter.Body,
  mass: number,
  offsetY = -20,
): HangResult {
  // 就近绳链：按文件 x 坐标找最近链点
  let nearestIdx = 0;
  let bestDx = Infinity;
  rope.links.forEach((link, i) => {
    const dx = Math.abs(link.position.x - fileBody.position.x);
    if (dx < bestDx) {
      bestDx = dx;
      nearestIdx = i;
    }
  });

  const clips: Matter.Constraint[] = [];
  const clipCount = mass > HEAVY_MASS_THRESHOLD ? 3 : 1;
  const spread = clipCount === 1 ? 0 : 2;
  for (let c = 0; c < clipCount; c++) {
    const idx = Math.min(rope.links.length - 1, Math.max(0, nearestIdx + (c - 1) * spread));
    const link = rope.links[idx];
    clips.push(
      Constraint.create({
        bodyA: fileBody,
        pointA: { x: 0, y: offsetY },
        bodyB: link,
        stiffness: 0.9,
        damping: 0.1,
        length: 4,
        label: 'clip',
      }),
    );
  }
  Composite.add(world, clips);
  return { clips };
}

/** 该绳悬挂文件的 Σ sizeBytes */
export function ropeTotalBytes(fileBodies: Matter.Body[]): number {
  return fileBodies.reduce((sum, b) => sum + bodySizeBytes(b), 0);
}

/** 绳型字节上限（麻绳 5GB / 红塑料绳 25GB / 不锈钢 ≥100GB） */
export function ropeByteLimit(tier: string): number {
  return ROPE_BYTE_LIMITS[tier as keyof typeof ROPE_BYTE_LIMITS] ?? ROPE_BYTE_LIMITS['rope-1'];
}

export type RopeLoadState = 'safe' | 'warn' | 'break';

/**
 * 绳负载状态（字节判定，SPEC §6 / AC-12b / AC-35）：
 * Σ < 80% 上限 safe；80%-100% warn（表现层预警，不动物理）；≥100% break（移除锚点）
 */
export function ropeLoadState(totalBytes: number, tier: string): RopeLoadState {
  const limit = ropeByteLimit(tier);
  if (totalBytes >= limit) return 'break';
  if (totalBytes >= limit * 0.8) return 'warn';
  return 'safe';
}

/** 命中测试封装（input 层用 Query.point） */
export function pointHits(bodies: Matter.Body[], x: number, y: number): Matter.Body[] {
  return Matter.Query.point(bodies, { x, y });
}
