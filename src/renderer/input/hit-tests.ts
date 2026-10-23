/**
 * 世界命中测试纯函数（input 层）：文件替身 / 蘑菇 / 绳点
 * 命中区域与 72px 绳上间距对齐，避免相邻图标互相抢点击。
 */
import type { WorldRuntime } from '../app/world-runtime';
import type { RopeManager, RopeEntry } from '../app/rope-manager';
import type { FileSprite } from '../view/file-sprite';
import { FILE_CELL_H, FILE_CELL_W, FILE_ICON_TOP } from '../view/token-colors';

const MUSHROOM_R = 24; // 成熟蘑菇点选半径
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
  extraHit?(x: number, y: number): boolean;
  mushroomHit?(x: number, y: number): string | null;
}

/** AC-26 悬停命中：DOM 控件 / 文件 / 蘑菇 / 绳 / 吸湿盒 / 蜗牛 / 边缘拉绳 */
export function worldHitAt(s: HitSources, x: number, y: number, viewportW: number): boolean {
  if (x < 0 || y < 0 || x >= viewportW || y >= window.innerHeight) return false;
  const edge = s.ropes.canSpawn() && (x <= EDGE_ZONE || x >= viewportW - EDGE_ZONE);
  return (
    s.domHit(x, y) ||
    !!fileAt(s.sprites, x, y) ||
    !!(s.mushroomHit ? s.mushroomHit(x, y) : mushroomAt(s.sprites, s.runtime, x, y)) ||
    !!s.ropes.nearestPoint(x, y) ||
    !!s.boxHit?.(x, y) ||
    !!s.snailHit?.(x, y) ||
    !!s.glyphHit?.(x, y) ||
    !!s.extraHit?.(x, y) ||
    edge
  );
}

/**
 * 文件替身命中：容器坐标是 100x110 网格单元左上角。
 * 横向收窄到 68px（标签宽度），保证 72px 间距下互不抢占。
 */
export function fileAt(sprites: Map<string, FileSprite>, x: number, y: number): FileSprite | null {
  for (const sprite of sprites.values()) {
    if (sprite.hit(x, y)) return sprite;
  }
  return null;
}

/** 最近绳链点（25px 吸附以内；封装 RopeManager.nearestPoint） */
export function nearestRopePoint(
  ropes: RopeManager,
  x: number,
  y: number,
): { entry: RopeEntry; x: number; y: number } | null {
  const near = ropes.nearestPoint(x, y);
  return near ? { entry: near.entry, x: near.x, y: near.y } : null;
}

/** 指针与悬停共用实际可见几何；有生长即可命中，不要求成熟。 */
export function visibleMushroomAt(
  sprites: Map<string, FileSprite>, runtime: WorldRuntime,
  views: ReadonlyMap<string, { hit(x: number, y: number): boolean }>, x: number, y: number,
): string | null {
  for (const [id, sprite] of sprites) {
    const m = runtime.byId.get(id)?.runtime.mushroom;
    if (m && m.growth > 0 && (m.species === 'oyster' || m.species === 'enoki') && sprite.mushroomHit(x, y)) return id;
  }
  for (const [id, view] of views) if ((runtime.byId.get(id)?.runtime.mushroom?.growth ?? 0) > 0 && view.hit(x, y)) return id;
  return null;
}

/** 旧调用方的成熟蘑菇近似命中；生产指针与悬停使用visibleMushroomAt。 */
export function mushroomAt(
  sprites: Map<string, FileSprite>,
  runtime: WorldRuntime,
  x: number,
  y: number,
): string | null {
  for (const [id, sprite] of sprites) {
    const rt = runtime.byId.get(id)?.runtime;
    const m = rt?.mushroom;
    if (!m || m.growth < 1) continue;
    const root = sprite.mushroomAnchor;
    if (Math.hypot(x - root.x, y - (root.y - 14)) <= MUSHROOM_R) return id;
  }
  return null;
}

/** 图标上边框 Y（蘑菇根部/夹子的像素锚点） */
export function iconTopOf(sprite: FileSprite): number {
  return sprite.container.position.y + FILE_ICON_TOP;
}
