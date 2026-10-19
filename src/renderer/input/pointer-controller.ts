/** 指针控制器（input 层）：穿透命中 / 拖挂 / 拧干 / 采摘 / 喷雾 / 扫把 / 边缘拉绳 */
import type { RopeEntry } from '../app/rope-manager';
import type { PointerDeps, Tool } from './pointer-deps';
import { ClickThrough } from './click-through';
import { CircleWring, FULL_TURN } from './gestures';
import { splashBurst } from './fx-burst';
import { EDGE_ZONE, fileAt, mushroomAt, nearestRopePoint, worldHitAt } from './hit-tests';
import { emitAction } from '../app/events';
import { trackFirst } from '../app/telemetry';

export type { PointerDeps, Tool } from './pointer-deps';

export class PointerController {
  readonly clickThrough = new ClickThrough();
  private wring = new CircleWring();
  private wringId: string | null = null;
  private drag: { id: string; dx: number; dy: number; moved: boolean; ox: number; oy: number } | null = null;
  private ropeDraw: { ax: number; ay: number } | null = null;
  private downPos = { x: 0, y: 0 };
  private downTime = 0;
  private lastX = 0;
  private lastY = 0;
  /** Double click follows the user's Windows interval. */
  private lastClick = { id: '', at: 0 };
  private doubleClickMs = 500;
  /** 吹风机按住目标（game tick 每帧施热） */
  private heatTarget: string | null = null;
  private squeegeeing = false;
  private sqLast = { x: 0, y: 0 };
  private boxDrag: string | null = null;
  private brooming = false;
  /** 八音盒旋律冷却（音频类悬停，P1） */
  private musicBoxAt = 0;

  constructor(private deps: PointerDeps) {
    void window.damp?.window.getInputSettings().then(({ doubleClickMs }) => { this.doubleClickMs = doubleClickMs; });
    window.damp?.window.onCursor(({ x, y }) => {
      this.lastX = x; this.lastY = y;
      if (this.drag || this.ropeDraw || this.boxDrag || this.squeegeeing || this.brooming || this.heatTarget) return;
      this.clickThrough.update(this.deps.runtime.locked || worldHitAt(this.deps, x, y, window.innerWidth));
    });
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
    this.setScissorsCursor(false);
    this.wring.cancel();
    this.wringId = null;
    if (this.drag) {
      const { id, ox, oy } = this.drag;
      this.drag = null;
      const sprite = this.deps.sprites.get(id);
      if (sprite) {
        sprite.setWring(0);
        sprite.previewPin(null);
        sprite.container.position.set(ox, oy);
        sprite.node.x = ox;
        sprite.node.y = oy;
      }
      this.deps.runtime.markState(id, 'idle');
    }
    if (this.ropeDraw) {
      const { ax, ay } = this.ropeDraw;
      this.ropeDraw = null;
      this.deps.ropePreview(ax, ay, 0, null);
    }
  }

  /** 成熟蘑菇 hover → 剪刀光标（CSS 类，data-URI 剪刀图标） */
  private setScissorsCursor(on: boolean): void {
    document.documentElement.classList.toggle('cursor-scissors', on);
  }
  /** 最近指针位置（胆小菇缩头/悬停卡片消费） */
  get lastPos(): { x: number; y: number } {
    return { x: this.lastX, y: this.lastY };
  }
  /** 吹风机当前按住的文件 id（未按住为 null） */
  get heatTargetId(): string | null {
    return this.heatTarget;
  }
  get draggedFileId(): string | null { return this.drag?.id ?? null; }

  private onMove(e: PointerEvent): void {
    const x = e.clientX;
    const y = e.clientY;
    this.lastX = x;
    this.lastY = y;

    // 演出期间：整窗拦截点击以便“点击跳过”，不做命中测试
    if (this.deps.runtime.locked) {
      this.setScissorsCursor(false);
      this.clickThrough.update(true);
      return;
    }

    // 拖拽中
    if (this.drag) {
      if (this.wring.active && this.wringId) {
        const angle = this.wring.feed(x, y);
        this.deps.sprites.get(this.drag.id)?.setWring(this.wring.active ? angle : 0);
        if (angle >= FULL_TURN * 3) {
          const id = this.wringId;
          this.wring.cancel();
          this.wringId = null;
          if (this.deps.runtime.wring(id)) {
            this.deps.sprites.get(id)?.setWring(0, true);
            splashBurst(this.deps.pool, x, y);
            this.deps.sfx.splash();
            emitAction('wring');
            trackFirst('first_wring');
          }
        }
      }
      const sprite = this.deps.sprites.get(this.drag.id);
      if (sprite) {
        const nx = x - this.drag.dx;
        const ny = y - this.drag.dy;
        sprite.container.position.set(nx, ny);
        sprite.node.x = nx;
        sprite.node.y = ny;
        if (Math.hypot(x - this.downPos.x, y - this.downPos.y) > 4) {
          this.drag.moved = true;
          this.lastClick = { id: '', at: 0 };
        }
        sprite.previewPin(nearestRopePoint(this.deps.ropes, x, y));
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
    // 成熟蘑菇 hover：剪刀光标（点击即采摘，与当前工具无关）
    this.setScissorsCursor(!!this.matureAt(x, y));
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
    // DOM controls own their click; do not capture it or begin a world gesture.
    if (this.deps.domHit(e.clientX, e.clientY)) return;
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
    // Hot air cooks an attached mushroom; the hand/scissors can harvest it.
    const mature = this.matureAt(x, y);
    if (mature) {
      if (tool === 'heat') { this.heatTarget = mature; return; }
      this.deps.onPick(mature);
      return;
    }

    const sprite = fileAt(this.deps.sprites, x, y);
    const fileId = sprite?.node.id ?? null;
    if (fileId && (this.deps.runtime.byId.get(fileId)?.runtime.dryness || 0) >= 0.8) this.deps.sfx.dryLeaf();

    // 双击替身图标/回收站：打开真实文件（与当前工具无关）
    if (fileId) {
      const now = e.timeStamp;
      if (this.lastClick.id === fileId && now - this.lastClick.at <= this.doubleClickMs) {
        this.lastClick = { id: '', at: 0 };
        this.deps.onOpen?.(fileId);
        return;
      }
      this.lastClick = { id: fileId, at: now };
    }
    // 回收站是系统特殊项：只响应双击，不参与网格拖拽
    if (sprite?.node.kind === 'recycle') return;

    if (tool === 'scissors') {
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
      // Every icon starts following the pointer immediately, including wet
      // and hung files. Wring detection runs alongside dragging, never ahead.
      this.startDrag(fileId, x, y);
      if (rt.humidity > 0.3 && rt.state !== 'burnt') {
        this.wring.start(x, y);
        this.wringId = fileId;
      }
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
    sprite.setScatterAngle(0);
    this.deps.ropes.releaseFile(id); // 残留挂载先解除
    this.deps.runtime.markState(id, 'idle');
    this.drag = {
      id,
      dx: x - sprite.container.position.x,
      dy: y - sprite.container.position.y,
      moved: false,
      ox: sprite.node.x,
      oy: sprite.node.y,
    };
  }
  private matureAt(x: number, y: number): string | null {
    return this.deps.mushroomHit ? this.deps.mushroomHit(x, y) : mushroomAt(this.deps.sprites, this.deps.runtime, x, y);
  }

  private onUp(e: PointerEvent): void {
    if (this.deps.runtime.locked) return;
    this.heatTarget = null; // 吹风机松手停热
    this.squeegeeing = false;
    this.brooming = false;
    if (this.boxDrag) {
      const bid = this.boxDrag;
      this.boxDrag = null;
      this.deps.boxMove?.(bid, e.clientX, e.clientY);
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

    if (this.drag) {
      const { id, dx, dy } = this.drag;
      const moved = this.drag.moved || Math.hypot(x - this.downPos.x, y - this.downPos.y) > 4;
      this.drag = null;
      this.deps.sprites.get(id)?.setWring(0);
      this.deps.sprites.get(id)?.previewPin(null);
      this.wring.cancel();
      this.wringId = null;
      if (!moved) {
        // Compare completed clicks using their native event timestamps. This
        // tolerates press duration and delayed renderer delivery on a busy PC.
        if (this.lastClick.id === id) this.lastClick.at = e.timeStamp;
        return;
      }
      const sprite = this.deps.sprites.get(id);
      // Chromium may coalesce the final pointermove in a fast native drag.
      // The release event is authoritative; do not strand the icon one frame back.
      if (sprite) {
        sprite.node.x = x - dx;
        sprite.node.y = y - dy;
        sprite.container.position.set(sprite.node.x, sprite.node.y);
      }
      this.lastClick = { id: '', at: 0 };
      const near = nearestRopePoint(this.deps.ropes, x, y);
      if (near && sprite && this.deps.ropes.hang(near.entry, sprite.node, { x: near.x, y: near.y })) {
        this.deps.runtime.markState(id, 'hung');
        this.deps.onHang(id);
        this.deps.sfx.pop(0.8);
        emitAction('hang');
        trackFirst('first_hang');
        return;
      }
      // Dropping on the desktop keeps the new position. Real Explorer icon
      // positions remain untouched and are restored by revealing its list.
      if (sprite) {
        const nx = Math.max(0, Math.min(window.innerWidth - 100, sprite.node.x));
        const ny = Math.max(0, Math.min(window.innerHeight - 110, sprite.node.y));
        sprite.container.position.set(nx, ny);
        sprite.node.x = nx;
        sprite.node.y = ny;
      }
      this.deps.runtime.markState(id, 'idle');
    }
  }
}
