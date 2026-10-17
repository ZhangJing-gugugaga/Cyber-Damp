/**
 * 指针控制器（input 层）：穿透命中 / 拖文件挂绳 / 拧干画圈 / 剪刀采摘 / 喷雾 / 边缘拉绳
 * 手势语义：按住湿文件画圈=拧干（AC-14）；直线位移=拖拽；抬起近绳=挂载（模块三）
 */
import Matter from 'matter-js';
import type { WorldRuntime } from '../app/world-runtime';
import type { RopeManager, RopeEntry } from '../app/rope-manager';
import type { FileSprite } from '../view/file-sprite';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';
import { ClickThrough } from './click-through';
import { CircleWring, FULL_TURN, isClick } from './gestures';
import { splashBurst } from './fx-burst';
import { FILE_ICON_W, FILE_ICON_H } from '../view/token-colors';

export type Tool = 'hand' | 'scissors' | 'spray' | 'heat' | 'squeegee';

export interface PointerDeps {
  runtime: WorldRuntime;
  ropes: RopeManager;
  sprites: Map<string, FileSprite>;
  pool: ParticlePool;
  sfx: Sfx;
  getTool(): Tool;
  /** 剪下成熟蘑菇（含视图移除），由 game 装配注入 */
  onPick(id: string): void;
  /** 挂载成功回调（视图/状态同步），由 game 装配注入 */
  onHang(id: string): void;
  /** 边缘新绳回调，返回新绳（满 2 条返回 null） */
  spawnRope(ax: number, ay: number, bx: number, by: number): RopeEntry | null;
  /** DOM 交互元素命中（pointer-events:auto 控件），由 ui 层注入 */
  domHit(x: number, y: number): boolean;
  /** 临时绳预览绘制（拖出过程），传 null 清除 */
  ropePreview(ax: number, ay: number, bx: number, by: number | null): void;
  /** 世界内额外点击消费（蜗牛戳击等），命中返回 true 短路后续手势 */
  consumeClick?(x: number, y: number): boolean;
  /** 刮水器拖动（P1）：dist=本次位移 px，(x,y) 为当前位置 */
  onSqueegee?(dist: number, x: number, y: number): void;
}

const EDGE_ZONE = 24; // 左右缘拉绳吸附区
const SNAP_DIST = 90; // 松手落绳判定距离

export class PointerController {
  readonly clickThrough = new ClickThrough();
  private wring = new CircleWring();
  private wringId: string | null = null;
  private drag: { id: string; dx: number; dy: number; moved: boolean } | null = null;
  private ropeDraw: { ax: number; ay: number } | null = null;
  private downPos = { x: 0, y: 0 };
  private downTime = 0;
  private lastX = 0;
  private lastY = 0;
  /** 吹风机按住目标（game tick 每帧施热） */
  private heatTarget: string | null = null;
  private squeegeeing = false;
  private sqLast = { x: 0, y: 0 };

  constructor(private deps: PointerDeps) {
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
  }

  /** 最近指针位置（胆小菇缩头判定等视图消费） */
  get lastPos(): { x: number; y: number } {
    return { x: this.lastX, y: this.lastY };
  }

  /** 吹风机当前按住的文件 id（未按住为 null） */
  get heatTargetId(): string | null {
    return this.heatTarget;
  }

  private fileAt(x: number, y: number): FileSprite | null {
    for (const sprite of this.deps.sprites.values()) {
      const p = sprite.container.position;
      if (Math.abs(x - p.x) <= FILE_ICON_W / 2 + 8 && y >= p.y - FILE_ICON_H * 0.75 && y <= p.y + FILE_ICON_H * 0.3) {
        return sprite;
      }
    }
    return null;
  }

  private nearestRopePoint(x: number, y: number): { entry: RopeEntry; x: number; y: number } | null {
    let best: { entry: RopeEntry; x: number; y: number; d: number } | null = null;
    for (const entry of this.deps.ropes.entries) {
      if (entry.broken) continue;
      for (const link of entry.rope.links) {
        const d = Math.hypot(link.position.x - x, link.position.y - y);
        if (!best || d < best.d) best = { entry, x: link.position.x, y: link.position.y, d };
      }
    }
    return best && best.d <= SNAP_DIST ? best : null;
  }

  private mushroomAt(x: number, y: number): string | null {
    for (const [id, sprite] of this.deps.sprites) {
      const rt = this.deps.runtime.byId.get(id)?.runtime;
      if (!rt?.mushroom) continue;
      const p = sprite.container.position;
      const mx = p.x;
      const my = p.y - FILE_ICON_H * 0.75;
      if (Math.hypot(x - mx, y - my) <= 28) return id;
    }
    return null;
  }

  private onMove(e: PointerEvent): void {
    const x = e.clientX;
    const y = e.clientY;
    this.lastX = x;
    this.lastY = y;

    // 拖拽中
    if (this.drag) {
      const sprite = this.deps.sprites.get(this.drag.id);
      if (sprite) {
        const nx = x - this.drag.dx;
        const ny = y - this.drag.dy;
        sprite.container.position.set(nx, ny);
        const node = sprite.node;
        node.x = nx;
        node.y = ny;
        this.drag.moved = true;
      }
      this.clickThrough.update(true);
      return;
    }

    // 边缘拉绳预览
    if (this.ropeDraw) {
      this.deps.ropePreview(this.ropeDraw.ax, this.ropeDraw.ay, x, y);
      this.clickThrough.update(true);
      return;
    }

    // 刮水器拖动（P1）：擦雾 + 水痕
    if (this.squeegeeing) {
      const dist = Math.hypot(x - this.sqLast.x, y - this.sqLast.y);
      this.sqLast = { x, y };
      if (dist > 1) this.deps.onSqueegee?.(dist, x, y);
      this.clickThrough.update(true);
      return;
    }

    // 拧干画圈（按住的湿文件）
    if (this.wring.active && this.wringId) {
      const acc = this.wring.feed(x, y);
      if (acc >= FULL_TURN) {
        const id = this.wringId;
        this.wring.cancel();
        this.wringId = null;
        if (this.deps.runtime.wring(id)) {
          const sprite = this.deps.sprites.get(id);
          if (sprite) {
            const p = sprite.container.position;
            splashBurst(this.deps.pool, p.x, p.y);
          }
          this.deps.sfx.splash();
        }
      } else if (!this.wring.active) {
        // 画偏自动取消，转入拖拽
        const id = this.wringId;
        this.wringId = null;
        this.startDrag(id, x, y);
      }
      this.clickThrough.update(true);
      return;
    }

    // 命中测试 → 穿透跳变（AC-26）
    const hit =
      this.deps.domHit(x, y) ||
      !!this.fileAt(x, y) ||
      !!this.mushroomAt(x, y) ||
      !!this.nearestRopePoint(x, y) ||
      (x <= EDGE_ZONE && this.deps.ropes.canSpawn()) ||
      (x >= window.innerWidth - EDGE_ZONE && this.deps.ropes.canSpawn());
    this.clickThrough.update(hit, this.deps.runtime.locked);
  }

  private onDown(e: PointerEvent): void {
    if (this.deps.runtime.locked || e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    this.downPos = { x, y };
    this.downTime = performance.now();

    // 世界内额外点击（蜗牛戳击优先消费）
    if (this.deps.consumeClick?.(x, y)) return;

    const tool = this.deps.getTool();
    const fileId = this.fileAt(x, y)?.node.id ?? null;

    if (tool === 'scissors') {
      const mid = this.mushroomAt(x, y);
      if (mid) this.deps.onPick(mid);
      return;
    }
    if (tool === 'spray') {
      if (fileId) {
        const rt = this.deps.runtime.byId.get(fileId)!.runtime;
        if (rt.char > 0 && this.deps.runtime.useSpray(fileId)) this.deps.sfx.pop(1.4);
      }
      return;
    }
    if (tool === 'heat') {
      // 吹风机：按住施热（game tick 每帧 applyHeat；焦化由演化域产出）
      if (fileId) this.heatTarget = fileId;
      return;
    }
    if (tool === 'squeegee') {
      this.squeegeeing = true;
      this.sqLast = { x, y };
      return;
    }

    // 手工具：湿文件按压 → 先按拧干手势处理（画圈优先，直线位移转拖拽）
    if (fileId) {
      const rt = this.deps.runtime.byId.get(fileId)!.runtime;
      if (rt.state === 'hung') return; // 已挂文件不可拖走（摘取走 P1 滑落）
      if (rt.humidity > 0.3 && rt.state !== 'burnt') {
        this.wring.start(x, y);
        this.wringId = fileId;
        return;
      }
      this.startDrag(fileId, x, y);
      return;
    }

    // 左右边缘拉绳（模块三：边缘拖出）
    if (x <= EDGE_ZONE || x >= window.innerWidth - EDGE_ZONE) {
      const ax = x <= EDGE_ZONE ? 10 : window.innerWidth - 10;
      this.ropeDraw = { ax, ay: Math.min(y, window.innerHeight - 120) };
      this.deps.ropePreview(ax, this.ropeDraw.ay, x, y);
    }
  }

  private startDrag(id: string | null, x: number, y: number): void {
    if (!id) return;
    const sprite = this.deps.sprites.get(id);
    if (!sprite) return;
    this.drag = {
      id,
      dx: x - sprite.container.position.x,
      dy: y - sprite.container.position.y,
      moved: false,
    };
  }

  private onUp(e: PointerEvent): void {
    if (this.deps.runtime.locked) return;
    this.heatTarget = null; // 吹风机松手停热
    this.squeegeeing = false;
    const x = e.clientX;
    const y = e.clientY;

    // 拉绳落定
    if (this.ropeDraw) {
      const { ax, ay } = this.ropeDraw;
      this.ropeDraw = null;
      this.deps.ropePreview(ax, ay, x, null);
      if (Math.hypot(x - ax, y - ay) > 300) {
        const bx = Math.min(window.innerWidth - 10, Math.max(10, x));
        const by = Math.min(window.innerHeight - 120, Math.max(60, y));
        const entry = this.deps.spawnRope(ax, ay, bx, by);
        if (entry) this.deps.sfx.pop(0.6);
      }
      return;
    }

    // 拧干中断 → 单击判定 / 拖拽落绳
    if (this.wring.active && this.wringId) {
      const id = this.wringId;
      this.wring.cancel();
      this.wringId = null;
      if (isClick(this.downPos.x, this.downPos.y, x, y, performance.now() - this.downTime)) return;
      this.startDrag(id, x, y);
      // 继续落入下方拖拽分支
    }

    if (this.drag) {
      const { id, moved } = this.drag;
      this.drag = null;
      if (!moved) return;
      const near = this.nearestRopePoint(x, y);
      if (near) {
        const sprite = this.deps.sprites.get(id);
        const node = sprite?.node;
        if (node && this.deps.ropes.hang(near.entry, node, { x: near.x, y: near.y })) {
          this.deps.runtime.markState(id, 'hung');
          this.deps.onHang(id);
          this.deps.sfx.pop(0.8);
        }
      } else {
        this.deps.runtime.markState(id, 'idle');
      }
    }
  }
}
