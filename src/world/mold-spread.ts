/**
 * 相邻蔓延（R5.2 v0.2；Task 12 纯领域逻辑）
 *
 * 相邻关系由真实图标坐标计算（Shell 只读读取，由员工 2 提供）；
 * 不移动、不重排任何图标。只有未清理的重度霉变对象可以向外蔓延；
 * 防霉期对象硬排除；蔓延占用当日额度槽位（source='spread'）；
 * 结果按事件种子固定并持久化，同坐标同种子同结果。
 */
import type { DailyEventRecordV4 } from '../shared/types/gameplay';
import type { NativeObjectState, NativeWeatherSnapshot } from '../shared/types/native';
import { availableFamilies, createRand } from './native-events';

export interface DesktopPoint {
  id: string;
  x: number;
  y: number;
}

/**
 * 桌面坐标邻接表（纯函数）。
 * - 距离阈值 maxDistance（图标网格口径，由调用方传入，例如 1.5 格）；
 * - diagonal=false 时只认正交邻居（dx=0 或 dy=0）；
 * - 空桌面 / 单对象 / 重叠坐标安全：重叠视为相邻（距离 0）；
 * - 邻居列表按稳定对象 ID 排序，同样坐标得到同样结果。
 */
export function buildAdjacency(
  points: DesktopPoint[],
  options: { maxDistance: number; diagonal: boolean },
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const sorted = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const p of sorted) adjacency.set(p.id, []);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const within = Math.max(dx, dy) <= options.maxDistance
        && (options.diagonal || dx === 0 || dy === 0);
      if (!within) continue;
      adjacency.get(a.id)!.push(b.id);
      adjacency.get(b.id)!.push(a.id);
    }
  }
  for (const list of adjacency.values()) list.sort((a, b) => (a < b ? -1 : 1));
  return adjacency;
}

export interface SpreadPair {
  sourceId: string;
  targetId: string;
}

/** 重度霉变 = 未清理（stage 3）的霉变对象；只有它可以作为传染源（R5.2）。 */
export function isSpreadSource(obj: NativeObjectState): boolean {
  return obj.damage?.family === 'mold' && obj.damage.stage === 3;
}

/**
 * 规划今日蔓延对（纯函数，不修改状态）：
 * - 源：重度霉变对象；目标：邻接的干净（stage 0 或无损伤）对象；
 * - 天气必须允许霉变（familyWeights 的 mold 权重 > 0）；
 * - 防霉期对象硬排除；删除/移动的对象不参与；
 * - maxSpreads 由调用方按当日剩余额度传入；
 * - 用 rand（注入）从候选对中不放回抽取，同输入同结果。
 */
export function planSpreadPairs(
  sources: string[],
  objects: Record<string, NativeObjectState>,
  adjacency: Map<string, string[]>,
  weather: NativeWeatherSnapshot,
  now: number,
  maxSpreads: number,
  rand: () => number,
): SpreadPair[] {
  if (maxSpreads <= 0) return [];
  if (!availableFamilies(weather, false).includes('mold')) return [];
  const pairs: SpreadPair[] = [];
  const seenTargets = new Set<string>();
  for (const sourceId of sources) {
    const source = objects[sourceId];
    if (!source || !isSpreadSource(source)) continue;
    for (const targetId of adjacency.get(sourceId) ?? []) {
      if (seenTargets.has(targetId)) continue;
      const target = objects[targetId];
      if (!target) continue;
      if (target.damage && target.damage.stage > 0) continue;
      if ((target.moldImmuneUntil ?? 0) > now) continue;
      pairs.push({ sourceId, targetId });
      seenTargets.add(targetId);
    }
  }
  // 确定性洗牌后取前 N（同坐标同种子同结果）
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.slice(0, maxSpreads);
}

/**
 * 把蔓延对插入当日记录（占用剩余额度，source='spread'）。
 * 幂等：同一目标只插一次；额度不足时多余的蔓延对被丢弃（不积欠）。
 * 返回实际插入数。
 */
export function insertSpreadSlots(
  record: DailyEventRecordV4,
  pairs: SpreadPair[],
  objects: Record<string, NativeObjectState>,
): number {
  let inserted = 0;
  for (const pair of pairs) {
    if (record.slots.length >= record.limit) break;
    if (record.slots.some((s) => s.objectId === pair.targetId)) continue;
    if (!objects[pair.targetId]) continue;
    record.slots.push({
      objectId: pair.targetId,
      source: 'spread',
      family: 'mold',
      fromStage: 0,
      toStage: 1,
      mushroom: 'none',
      fromObjectId: pair.sourceId,
      status: 'pending',
    });
    inserted += 1;
  }
  return inserted;
}
