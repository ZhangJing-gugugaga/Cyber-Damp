/**
 * 指针控制器依赖契约（input 层类型）
 * 从 pointer-controller.ts 拆出（单文件 ≤300 行纪律）；调用方仍可从 pointer-controller 导入。
 */
import type { WorldRuntime } from '../app/world-runtime';
import type { RopeManager, RopeEntry } from '../app/rope-manager';
import type { FileSprite } from '../view/file-sprite';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';

export type Tool = 'hand' | 'scissors' | 'spray' | 'heat' | 'squeegee' | 'broom';

export interface PointerDeps {
  runtime: WorldRuntime;
  ropes: RopeManager;
  sprites: Map<string, FileSprite>;
  pool: ParticlePool;
  sfx: Sfx;
  getTool(): Tool;
  /** 剪下成熟蘑菇（含视图移除），由 game 装配注入 */
  onPick(id: string): void;
  /** 双击替身图标：打开真实文件并重置受潮状态 */
  onOpen?(id: string): void;
  /** 挂载成功回调（视图/状态同步），由 game 装配注入 */
  onHang(id: string): void;
  /** 边缘新绳回调，返回新绳（满 2 条返回 null） */
  spawnRope(ax: number, ay: number, bx: number, by: number): RopeEntry | null;
  /** DOM 交互元素命中（pointer-events:auto 控件），由 ui 层注入 */
  domHit(x: number, y: number): boolean;
  /** 临时绳预览绘制（拖出过程），传 null 清除 */
  ropePreview(ax: number, ay: number, bx: number, by: number | null): void;
  consumeClick?(x: number, y: number): boolean;
  /** 刮水器拖动（P1）：dist=本次位移 px，(x,y) 为当前位置 */
  onSqueegee?(dist: number, x: number, y: number): void;
  /** 吸湿盒拖拽（P1）：命中/移动/松手（dropAt 判定回收站/底边倾倒） */
  boxHit?(x: number, y: number): string | null;
  boxMove?(id: string, x: number, y: number): void;
  boxDrop?(id: string, x: number, y: number): 'emptied' | 'kept';
  snailHit?(x: number, y: number): boolean;
  /** 小扫把清扫（P1）：清除点附近滴落字符 */
  sweepGlyphs?(x: number, y: number): void;
  /** 滴落字符悬停命中（AC-26：可扫地必须拦截穿透） */
  glyphHit?(x: number, y: number): boolean;
}
