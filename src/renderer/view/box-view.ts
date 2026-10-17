/**
 * 氯化钙吸湿盒（view 层，程序化 Graphics）：盒体 + 颗粒 + 积水线
 * --box-cacl2 颗粒 / --box-cacl2-melt 积水；fill 0..1 涨满需倒掉
 */
import { Container, Graphics } from 'pixi.js';

const GRANULE = 0xD8D2C0;      // --box-cacl2
const MELT = 0xB7C9CE;         // --box-cacl2-melt
const TRAY = 0x8A7148;         // 盒体（麻绳棕材料域）
const W = 48;
const H = 34;

export class BoxView {
  readonly container = new Container();
  private readonly water = new Graphics();
  private readonly frame = new Graphics();
  private readonly label = new Graphics();

  constructor() {
    this.drawStatic();
    this.container.addChild(this.water, this.frame, this.label);
    this.container.eventMode = 'none';
  }

  private drawStatic(): void {
    const g = this.frame;
    // 盒体外框 + 颗粒
    g.roundRect(0, 0, W, H, 4).fill({ color: GRANULE, alpha: 0.9 });
    g.roundRect(0, 0, W, H, 4).stroke({ width: 2, color: TRAY });
    // 颗粒点
    for (let i = 0; i < 8; i++) {
      g.circle(8 + (i % 4) * 11, 10 + Math.floor(i / 4) * 10, 2)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }
  }

  /** fill 0..1 积水位；full 时水面高亮提示该倒了 */
  update(fill: number, tSec: number): void {
    this.water.clear();
    const h = Math.min(H - 4, fill * (H - 4));
    if (h > 0.5) {
      const full = fill >= 1;
      const pulse = full ? 0.65 + Math.sin(tSec * 4) * 0.25 : 0.8;
      this.water.rect(2, H - 2 - h, W - 4, h)
        .fill({ color: MELT, alpha: pulse });
    }
  }

  /** 拖动中视觉反馈：微抬升 */
  setDragging(on: boolean): void {
    this.label.clear();
    if (on) this.label.roundRect(-2, -2, W + 4, H + 4, 5).stroke({ width: 1.5, color: 0xC0952F, alpha: 0.9 }); // sanctioned：选中描边
    this.container.alpha = on ? 0.85 : 1;
  }
}
