/**
 * 世界命中测试纯函数（input 层）：文件替身 / 蘑菇 / 绳链最近点
 * 从 pointer-controller.ts 拆出（单文件 ≤300 行纪律）
 */
import type { WorldRuntime } from '../app/world-runtime';
import type { RopeManager, RopeEntry } from '../app/rope-manager';
import type { FileSprite } from '../view/file-sprite';
import { FILE_ICON_W, FILE_ICON_H } from '../view/token-colors';

const SNAP_DIST = 90;   // 松手落绳判定距离
const MUSHROOM_R = 28;  // 蘑菇点选半径

/** 文件替身命中（按替身包围盒外扩 8px） */
export function fileAt(sprites: Map<string, FileSprite>, x: number, y: number): FileSprite | null {
  for (const sprite of sprites.values()) {
    const p = sprite.container.position;
    if (Math.abs(x - p.x) <= FILE_ICON_W / 2 + 8 && y >= p.y - FILE_ICON_H * 0.75 && y <= p.y + FILE_ICON_H * 0.3) {
      return sprite;
    }
  }
  return null;
}

/** 最近绳链点（未崩断绳内全域最近链，≤SNAP_DIST 才返回） */
export function nearestRopePoint(
  ropes: RopeManager,
  x: number,
  y: number,
): { entry: RopeEntry; x: number; y: number } | null {
  let best: { entry: RopeEntry; x: number; y: number; d: number } | null = null;
  for (const entry of ropes.entries) {
    if (entry.broken) continue;
    for (const link of entry.rope.links) {
      const d = Math.hypot(link.position.x - x, link.position.y - y);
      if (!best || d < best.d) best = { entry, x: link.position.x, y: link.position.y, d };
    }
  }
  return best && best.d <= SNAP_DIST ? best : null;
}

/** 蘑菇点选（蘑菇挂在文件替身顶部） */
export function mushroomAt(sprites: Map<string, FileSprite>, runtime: WorldRuntime, x: number, y: number): string | null {
  for (const [id, sprite] of sprites) {
    const rt = runtime.byId.get(id)?.runtime;
    if (!rt?.mushroom) continue;
    const p = sprite.container.position;
    if (Math.hypot(x - p.x, y - (p.y - FILE_ICON_H * 0.75)) <= MUSHROOM_R) return id;
  }
  return null;
}
