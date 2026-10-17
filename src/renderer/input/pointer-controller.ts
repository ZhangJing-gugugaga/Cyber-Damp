/** 指针控制器（input 层）：穿透命中 / 拖挂 / 拧干 / 采摘 / 喷雾 / 扫把 / 边缘拉绳 */
import type { RopeEntry } from '../app/rope-manager';
import type { PointerDeps, Tool } from './pointer-deps';
import { ClickThrough } from './click-through';
import { CircleWring, FULL_TURN, isClick } from './gestures';
import { splashBurst } from './fx-burst';
import { EDGE_ZONE, fileAt, mushroomAt, nearestRopePoint, worldHitAt } from './hit-tests';
import { emitAction } from '../app/events';
import { trackFirst } from '../app/telemetry';

export type { PointerDeps, Tool } from './pointer-deps';

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
  private boxDrag: string | null = null;
  private brooming = false;
  /** 八音盒旋律冷却（音频类悬停，P1） */
  private musicBoxAt = 0;

  constructor(private deps: PointerDeps) {
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    // 指针在窗外松开/失焦：取消全部手势，避免热风/拖拽/穿透卡死
    window.addEventListener('pointercancel', () => this.cancelGestures());
    window.addEventListener('blur', () => this.cancelGestures());
  }

  /** 手势兜底取消（AC-14/26：防 pointerup 丢失后的持续施热与穿透锁死） */
  private cancelGestures(): void {
    this.heatTarget = null;
    this.squeegeeing = false;
    this.boxDrag = null;
    this.brooming = false;
    this.wring.cancel();
    this.wringId = null;
    if (this.drag) {
      const id = this.drag.id;
      this.drag = null;
      this.deps.runtime.markState(id, 'idle');
    }
    if (this.ropeDraw) {
      const { ax, ay } = this.ropeDraw;
      this.ropeDraw = null;
      this.deps.ropePreview(ax, ay, 0, null);
    }
  }
  /** 最近指针位置（胆小菇缩头/悬停卡片消费） */
  get lastPos(): { x: number; y: number } {
    return { x: this.lastX, y: this.lastY };
  }
  /** 吹风机当前按住的文件 id（未按住为 null） */
  get heatTargetId(): string | null {
    return this.heatTarget;
  }

  private onMove(e: PointerEvent): void {
    const x = e.clientX;
    const y = e.clientY;
    this.lastX = x;
    this.lastY = y;

    // 演出期间：整窗拦截点击以便“点击跳过”，不做命中测试
    if (this.deps.runtime.locked) {
      this.clickThrough.update(true);
      return;
    }

    // 拖拽中
    if (this.drag) {
      const sprite = this.deps.sprites.get(this.drag.id);
      if (sprite) {
        const nx = x - this.drag.dx;
        const ny = y - this.drag.dy;
        sprite.container.position.set(nx, ny);
        sprite.node.x = nx;
        sprite.node.y = ny;
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
    // 吸湿盒拖拽（手工具优先命中盒）
    if (this.boxDrag) {
      this.deps.boxMove?.(this.boxDrag, x, y);
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
    // 小扫把拖动清扫（P1）
    if (this.brooming) {
      this.deps.sweepGlyphs?.(x, y);
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
          if (sprite) splashBurst(this.deps.pool, sprite.container.position.x, sprite.container.position.y);
          this.deps.sfx.splash();
          emitAction('wring');
          trackFirst('first_wring');
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

    // 音频类文件悬停：八音盒走调旋律（P1，6s 冷却）
    if (performance.now() - this.musicBoxAt > 6000 && fileAt(this.deps.sprites, x, y)?.node.category === 'audio') {
      this.musicBoxAt = performance.now();
      this.deps.sfx.musicBox();
    }
    // 命中测试 → 穿透跳变（AC-26）
    this.clickThrough.update(worldHitAt(this.deps, x, y, window.innerWidth));
  }

  private onDown(e: PointerEvent): void {
    if (this.deps.runtime.locked || e.button !== 0) return;
    // 捕获指针：拖出窗口/快速移位时仍能收到 pointerup（防手势卡死）
    try {
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    } catch {
      /* 合成事件不支持捕获时忽略 */
    }
    const x = e.clientX;
    const y = e.clientY;
    this.downPos = { x, y };
    this.downTime = performance.now();

    // 世界内额外点击（蜗牛戳击优先消费）
    if (this.deps.consumeClick?.(x, y)) return;

    const tool = this.deps.getTool();
    const fileId = fileAt(this.deps.sprites, x, y)?.node.id ?? null;

    if (tool === 'scissors') {
      const mid = mushroomAt(this.deps.sprites, this.deps.runtime, x, y);
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
    if (tool === 'broom') {
      this.brooming = true;
      this.deps.sweepGlyphs?.(x, y);
      return;
    }

    // 手工具：吸湿盒拖拽 > 湿文件拧干 > 拖文件 > 边缘拉绳
    if (tool === 'hand') {
      const bid = this.deps.boxHit?.(x, y);
      if (bid) {
        this.boxDrag = bid;
        this.deps.boxMove?.(bid, x, y);
        return;
      }
    }
    if (fileId) {
      const rt = this.deps.runtime.byId.get(fileId)!.runtime;
      if (rt.state === 'hung') return; // 已挂文件不可拖走
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
    this.deps.ropes.releaseFile(id); // 崩断落地文件的旧刚体先释放
    this.drag = {
      id,
      dx: x - sprite.container.position.x,
      dy: y - sprite.container.position.y,
      moved: false,
    };
  }

  private onUp(e: PointerEvent): void {    if (this.deps.runtime.locked) return;
    this.heatTarget = null; // 吹风机松手停热
    this.squeegeeing = false;
    this.brooming = false;
    if (this.boxDrag) {
      const bid = this.boxDrag;
      this.boxDrag = null;
      this.deps.boxDrop?.(bid, e.clientX, e.clientY);
      return;
    }
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
    }

    if (this.drag) {
      const { id, moved } = this.drag;
      this.drag = null;
      if (!moved) return;
      const near = nearestRopePoint(this.deps.ropes, x, y);
      if (near) {
        const sprite = this.deps.sprites.get(id);
        const node = sprite?.node;
        if (node && this.deps.ropes.hang(near.entry, node, { x: near.x, y: near.y })) {
          this.deps.runtime.markState(id, 'hung');
          this.deps.onHang(id);
          this.deps.sfx.pop(0.8);
          emitAction('hang');
          trackFirst('first_hang');
        }
      } else {
        this.deps.runtime.markState(id, 'idle');
      }
    }
  }
}
