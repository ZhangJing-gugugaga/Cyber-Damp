/**
 * 老式绿头摇头电扇（view 层，程序化 Graphics）
 * AC-23：购买放置即自动摇头；扇叶旋转 + 头部左右摆动（--fan-body 绿头）
 */
import { Container, Graphics } from 'pixi.js';
import { ENV_COLOR } from './token-colors';

const FAN_BODY = 0x4e7b5a; // --fan-body（token 映射）

export class FanView {
  readonly container = new Container();
  private readonly head = new Container();
  private readonly blades = new Graphics();
  private readonly cage = new Graphics();

  constructor() {
    const g = new Graphics();
    // 底座与立柱
    g.ellipse(0, 0, 22, 6).fill({ color: FAN_BODY, alpha: 0.9 });
    g.rect(-3, -46, 6, 46).fill({ color: FAN_BODY, alpha: 0.85 });
    this.blades.rect(-2, -48, 4, 4).fill({ color: FAN_BODY });
    // 三叶扇叶
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.blades.ellipse(Math.cos(a) * 10, -66 + Math.sin(a) * 10, 11, 5)
        .fill({ color: ENV_COLOR.fog, alpha: 0.85 });
    }
    this.cage.circle(0, -66, 24).stroke({ width: 2, color: FAN_BODY, alpha: 0.9 });
    this.cage.circle(0, -66, 16).stroke({ width: 1, color: FAN_BODY, alpha: 0.5 });
    this.head.addChild(this.blades, this.cage);
    this.head.position.set(0, 0);
    this.container.addChild(g, this.head);
    this.container.eventMode = 'none';
  }

  /** tSec 驱动：扇叶常转；头部 ±40° 摇头（周期 4s） */
  update(tSec: number, running: boolean): void {
    if (running) {
      this.blades.rotation += 0.35;
      this.head.rotation = Math.sin(tSec * (Math.PI * 2 / 4)) * 0.7;
    }
  }
}
