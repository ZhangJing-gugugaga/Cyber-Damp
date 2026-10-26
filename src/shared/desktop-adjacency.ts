/**
 * 真实桌面坐标 → 蔓延邻接（R5.2 v0.2 的主进程输入；纯函数，只读坐标，不移动图标）。
 *
 * 桌面网格间距随 DPI、图标大小和"自动排列"设置变化，不能写死像素。
 * 这里以"每个图标到最近邻的距离"的中位数估计格距，阈值取 1.5 格（含对角），
 * 与 world/mold-spread.ts 测试口径（maxDistance = 1.5 格、diagonal）一致。
 */
import { buildAdjacency, type DesktopPoint } from '../world/mold-spread';

export const GRID_NEIGHBOR_FACTOR = 1.5;

/** 最近邻距离（切比雪夫距离，与 buildAdjacency 判定一致）的中位数；不足 2 点返回 null。 */
export function estimateGridPitch(points: DesktopPoint[]): number | null {
  if (points.length < 2) return null;
  const nearest: number[] = [];
  for (const a of points) {
    let best = Infinity;
    for (const b of points) {
      if (a === b) continue;
      const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      if (d > 0 && d < best) best = d;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  if (nearest.length === 0) return null;
  nearest.sort((x, y) => x - y);
  return nearest[Math.floor(nearest.length / 2)];
}

/**
 * 由带坐标的对象生成邻接表；坐标缺失或非有限数的对象不参与（视为孤立，不蔓延）。
 * 无法估计格距（少于 2 个有效点）时返回空邻接。
 */
export function adjacencyFromDesktop(points: Array<{ id: string; x?: number; y?: number }>): Map<string, string[]> {
  const valid: DesktopPoint[] = points
    .filter((p): p is { id: string; x: number; y: number } =>
      typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y))
    .map((p) => ({ id: p.id, x: p.x, y: p.y }));
  const pitch = estimateGridPitch(valid);
  if (pitch === null) {
    const empty = new Map<string, string[]>();
    for (const p of valid) empty.set(p.id, []);
    return empty;
  }
  return buildAdjacency(valid, { maxDistance: pitch * GRID_NEIGHBOR_FACTOR, diagonal: true });
}
