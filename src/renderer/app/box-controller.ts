/**
 * 吸湿盒控制器（app 装配层，P1）：墙角槽位放置 / 吸湿 / 积水涨满 / 回收站倾倒 / 泼洒
 *
 * 倒水：拖住盒子与桌面「回收站」图标碰撞盒重叠，或拖到屏幕最底边（Y > H-30）松开
 * → 盒子旋转 110deg + 倒水粒子 → 清空积水。彻底移除旧「倒水角」文字框。
 */
import type { WorldLayers } from '../view/layers';
import type { ParticlePool } from '../view/particles';
import { BoxView } from '../view/box-view';
import { ENV_COLOR } from '../view/token-colors';

export const MAX_BOX_SLOTS = 4;
const BOX_PRICE = 30;
const FILL_RATE = 0.012; // 湿度 0.8 时约 100s 涨满
const SPLASH_RADIUS = 60;
const BOX_W = 48;
const BOX_H = 34;
const POUR_DURATION = 0.8;
const POUR_ANGLE = (110 * Math.PI) / 180;

export interface RecycleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  id: string;
  slot: number;
  fill: number;
  /** 盒体左上角世界坐标（盒子中心 = x+24, y+17） */
  x: number;
  y: number;
  /** 倒水动画计时；null = 未倒水 */
  pourT: number | null;
  pourAcc: number;
}

export class BoxController {
  readonly boxes: Box[] = [];
  private views = new Map<string, BoxView>();
  private dragging: string | null = null;
  private seq = 0;

  constructor(
    private layers: WorldLayers,
    private pool: ParticlePool,
    private screen: () => { w: number; h: number },
    /** 桌面回收站图标的碰撞盒（由 game 注入） */
    private recycleRect: () => RecycleRect | null,
  ) {}

  /** 当前吸湿强度（0..0.15） */
  get absorbRate(): number {
    return Math.min(0.15, 0.05 * this.boxes.filter((b) => b.fill < 1).length);
  }

  freeSlots(): number {
    return MAX_BOX_SLOTS - this.boxes.length;
  }

  get price(): number {
    return BOX_PRICE;
  }

  /** 放置 qty 只，返回实际放下的数量 */
  place(qty: number): number {
    let placed = 0;
    for (let i = 0; i < qty && this.boxes.length < MAX_BOX_SLOTS; i++) {
      const slot = this.nextSlot();
      const { w, h } = this.screen();
      const box: Box = {
        id: `box-${++this.seq}`,
        slot,
        fill: 0,
        x: w - 420 + slot * 80,
        y: h - 52,
        pourT: null,
        pourAcc: 0,
      };
      const view = new BoxView();
      view.container.pivot.set(BOX_W / 2, BOX_H / 2);
      view.container.position.set(box.x + BOX_W / 2, box.y + BOX_H / 2);
      this.layers.propLayer.addChild(view.container);
      this.views.set(box.id, view);
      this.boxes.push(box);
      placed++;
    }
    return placed;
  }

  private nextSlot(): number {
    const used = new Set(this.boxes.map((b) => b.slot));
    for (let i = 0; i < MAX_BOX_SLOTS; i++) if (!used.has(i)) return i;
    return 0;
  }

  /** 每帧：积水增长 / 倒水动画 / 视图刷新 */
  update(dtSec: number, envHumidity: number, tSec: number): void {
    const { w, h } = this.screen();
    for (const box of this.boxes) {
      const view = this.views.get(box.id)!;
      if (box.fill < 1 && envHumidity > 0.3 && box.pourT === null) {
        box.fill = Math.min(1, box.fill + dtSec * FILL_RATE * envHumidity);
      }

      if (box.pourT !== null) {
        box.pourT += dtSec;
        const k = Math.min(1, box.pourT / POUR_DURATION);
        const ease = 1 - (1 - k) * (1 - k);
        view.container.rotation = POUR_ANGLE * ease;
        view.container.position.set(box.x + BOX_W / 2, box.y + BOX_H / 2);
        // 水从旋转后的盒口倒出
        if (k > 0.08 && k < 0.82) {
          box.pourAcc += dtSec;
          while (box.pourAcc >= 0.03) {
            box.pourAcc -= 0.03;
            const mouthX = box.x + BOX_W / 2 + Math.cos(POUR_ANGLE * ease - Math.PI / 2) * 20;
            const mouthY = box.y + BOX_H / 2 + Math.sin(POUR_ANGLE * ease - Math.PI / 2) * 20;
            this.pool.spawn({
              x: mouthX + (Math.random() - 0.5) * 8,
              y: mouthY,
              vx: (Math.random() - 0.5) * 70,
              vy: 40 + Math.random() * 90,
              gravity: 900,
              color: 0xb7c9ce, // --box-cacl2-melt
              size: 1.5 + Math.random() * 1.8,
              life: 0.8,
              shape: 'circle',
              alpha: 0.75,
            });
          }
        }
        if (k >= 1) {
          box.fill = 0;
          box.pourT = null;
          box.pourAcc = 0;
          view.container.rotation = 0;
          view.container.position.set(w - 420 + box.slot * 80 + BOX_W / 2, h - 52 + BOX_H / 2);
        }
        view.update(box.fill, tSec);
        continue;
      }

      if (this.dragging !== box.id) {
        box.x = w - 420 + box.slot * 80;
        box.y = h - 52;
      }
      view.container.position.set(box.x + BOX_W / 2, box.y + BOX_H / 2);
      view.update(box.fill, tSec);
    }
  }

  hit(x: number, y: number): string | null {
    for (const box of this.boxes) {
      if (box.pourT !== null) continue;
      if (Math.abs(box.x + BOX_W / 2 - x) <= 34 && Math.abs(box.y + BOX_H / 2 - y) <= 28) {
        return box.id;
      }
    }
    return null;
  }

  moveTo(id: string, x: number, y: number): void {
    const box = this.boxes.find((b) => b.id === id);
    if (!box || box.pourT !== null) return;
    this.dragging = id;
    box.x = x - BOX_W / 2;
    box.y = y - BOX_H / 2;
    this.views.get(id)?.setDragging(true);
  }

  /**
   * 松手：与回收站碰撞盒重叠，或位于屏幕最底边（Y > H-30）→ 旋转 110deg 倒水。
   * 否则放回墙角槽位。
   */
  dropAt(id: string, x: number, y: number): 'emptied' | 'kept' {
    const box = this.boxes.find((b) => b.id === id);
    this.dragging = null;
    this.views.get(id)?.setDragging(false);
    if (!box) return 'kept';
    const { w, h } = this.screen();
    const recycle = this.recycleRect();
    const cx = box.x + BOX_W / 2;
    const cy = box.y + BOX_H / 2;
    const overRecycle =
      !!recycle &&
      Math.abs(cx - (recycle.x + recycle.w / 2)) < BOX_W / 2 + recycle.w / 2 &&
      Math.abs(cy - (recycle.y + recycle.h / 2)) < BOX_H / 2 + recycle.h / 2;
    const atBottom = y > h - 30;

    if (box.fill > 0.02 && (overRecycle || atBottom)) {
      box.pourT = 0;
      box.pourAcc = 0;
      box.x = Math.max(8, Math.min(w - BOX_W - 8, x - BOX_W / 2));
      box.y = Math.max(8, Math.min(h - BOX_H - 8, y - BOX_H / 2));
      return 'emptied';
    }
    return 'kept';
  }

  /** 崩断文件砸中泼洒：命中返回 true（box 已移除，由 game 触发 runtime 增湿） */
  splashNear(x: number): string | null {
    const idx = this.boxes.findIndex((b) => Math.abs(b.x + BOX_W / 2 - x) <= SPLASH_RADIUS);
    if (idx < 0) return null;
    const box = this.boxes[idx];
    const view = this.views.get(box.id);
    if (view) {
      this.pool.burst(box.x + BOX_W / 2, box.y, 18, () => ({
        x: box.x + BOX_W / 2,
        y: box.y,
        vx: (Math.random() - 0.5) * 320,
        vy: -160 - Math.random() * 120,
        gravity: 420,
        color: ENV_COLOR.sweat,
        size: 2 + Math.random() * 2,
        life: 1.1,
        shape: 'circle',
        alpha: 0.8,
      }));
      view.container.destroy();
      this.views.delete(box.id);
    }
    this.boxes.splice(idx, 1);
    return box.id;
  }
}
