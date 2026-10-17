/**
 * 吸湿盒控制器（app 装配层，P1）：墙角槽位放置 / 吸湿 / 积水涨满 / 倒水角 / 泼洒
 * 环境效果：每只活跃盒 env.humidity -0.05（封顶 -0.15）；涨满不再吸湿需倒；
 * 崩断文件砸中 → 泼洒：全场湿度暴涨一阵（runtime.triggerSurge）。
 */
import type { WorldLayers } from '../view/layers';
import type { ParticlePool } from '../view/particles';
import { BoxView } from '../view/box-view';
import { ENV_COLOR } from '../view/token-colors';

export const MAX_BOX_SLOTS = 4;
const BOX_PRICE = 30;
const FILL_RATE = 0.012; // 湿度 0.8 时约 100s 涨满
const SPLASH_RADIUS = 60;

interface Box {
  id: string;
  slot: number;
  fill: number;
  /** 临时拖动偏移（松手未倒回槽位） */
  x: number;
  y: number;
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
    mount: HTMLElement,
  ) {
    // 回收角（DOM decor，pointer-events:none——AC-36 纪律）
    const zone = document.createElement('div');
    zone.className = 'recycle-zone';
    zone.setAttribute('data-chrome', 'decor');
    zone.textContent = '倒水角（拖满盒到此倒掉）';
    mount.appendChild(zone);
  }

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
      };
      const view = new BoxView();
      view.container.position.set(box.x, box.y);
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

  /** 每帧：积水增长 + 视图刷新 */
  update(dtSec: number, envHumidity: number, tSec: number): void {
    const { w, h } = this.screen();
    for (const box of this.boxes) {
      if (box.fill < 1 && envHumidity > 0.3) box.fill = Math.min(1, box.fill + dtSec * FILL_RATE * envHumidity);
      const view = this.views.get(box.id)!;
      if (this.dragging !== box.id) {
        box.x = w - 420 + box.slot * 80;
        box.y = h - 52;
      }
      view.container.position.set(box.x, box.y);
      view.update(box.fill, tSec);
    }
  }

  hit(x: number, y: number): string | null {
    for (const box of this.boxes) {
      if (Math.abs(box.x + 24 - x) <= 34 && Math.abs(box.y + 17 - y) <= 28) return box.id;
    }
    return null;
  }

  moveTo(id: string, x: number, y: number): void {
    const box = this.boxes.find((b) => b.id === id);
    if (!box) return;
    this.dragging = id;
    box.x = x - 24;
    box.y = y - 17;
    this.views.get(id)?.setDragging(true);
  }

  /** 松手：倒水角区域内 → 倒掉积水回槽位；否则放回 */
  dropAt(id: string, x: number, y: number): 'emptied' | 'kept' {
    const box = this.boxes.find((b) => b.id === id);
    this.dragging = null;
    this.views.get(id)?.setDragging(false);
    if (!box) return 'kept';
    const { w, h } = this.screen();
    if (box.fill > 0 && x > w - 160 && y > h - 150) {
      box.fill = 0;
      return 'emptied';
    }
    return 'kept';
  }

  /** 崩断文件砸中泼洒：命中返回 true（box 已移除，由 game 触发 runtime 增湿） */
  splashNear(x: number): string | null {
    const idx = this.boxes.findIndex((b) => Math.abs(b.x + 24 - x) <= SPLASH_RADIUS);
    if (idx < 0) return null;
    const box = this.boxes[idx];
    const view = this.views.get(box.id);
    if (view) {
      this.pool.burst(box.x + 24, box.y, 18, () => ({
        x: box.x + 24,
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
