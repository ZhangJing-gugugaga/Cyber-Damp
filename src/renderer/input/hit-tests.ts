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
export const EDGE_ZONE = 24; // 左右缘拉绳吸附区

/** 悬停命中输入（PointerDeps 结构兼容） */
export interface HitSources {
  domHit(x: number, y: number): boolean;
  sprites: Map<string, FileSprite>;
  runtime: WorldRuntime;
  ropes: RopeManager;
  boxHit?(x: number, y: number): string | null;
  snailHit?(x: number, y: number): boolean;
  glyphHit?(x: number, y: number): boolean;
}

/** AC-26 悬停命中：DOM 控件 / 文件 / 蘑菇 / 绳 / 吸湿盒 / 蜗牛 / 边缘拉绳 */
export function worldHitAt(s: HitSources, x: number, y: number, viewportW: number): boolean {
  const edge = s.ropes.canSpawn() && (x <= EDGE_ZONE || x >= viewportW - EDGE_ZONE);
  return (
    s.domHit(x, y) ||
    !!fileAt(s.sprites, x, y) ||
    !!mushroomAt(s.sprites, s.runtime, x, y) ||
    !!nearestRopePoint(s.ropes, x, y) ||
    !!s.boxHit?.(x, y) ||
    !!s.snailHit?.(x, y) ||
    !!s.glyphHit?.(x, y) ||
    edge
  );
}

/** 文件替身命中（按图标实际绘制范围：y ∈ [p.y+14, p.y+58]，外扩容差 8px） */
export function fileAt(sprites: Map<string, FileSprite>, x: number, y: number): FileSprite | null {
  for (const sprite of sprites.values()) {
    const p = sprite.container.position;
    if (Math.abs(x - p.x) <= FILE_ICON_W / 2 + 8 && y >= p.y + 6 && y <= p.y + FILE_ICON_H - 8) {
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

/** 蘑菇点选（蘑菇容器挂在图标顶部中心 (p.x+W/2, p.y+10)，向上生长） */
export function mushroomAt(sprites: Map<string, FileSprite>, runtime: WorldRuntime, x: number, y: number): string | null {
  for (const [id, sprite] of sprites) {
    const rt = runtime.byId.get(id)?.runtime;
    if (!rt?.mushroom) continue;
    const p = sprite.container.position;
    if (Math.hypot(x - (p.x + FILE_ICON_W / 2), y - (p.y - 4)) <= MUSHROOM_R) return id;
  }
  return null;
}
