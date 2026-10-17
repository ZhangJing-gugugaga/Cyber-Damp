/**
 * 赛博小蜗牛（view 层，程序化 Graphics）：壳螺旋 + 软体 + 触角
 * AC-29：食苔留银道；缩壳=软体收进壳（scale 表现），状态由 SnailController 驱动
 */
import { Container, Graphics } from 'pixi.js';
import { ENV_COLOR } from './token-colors';

const SHELL = 0xA88B5F;   // 壳体借用麻绳棕（--rope-hmp 域，材料同源）
const SHELL_DEEP = 0x8A7148;
const BODY = 0xC9C2A8;    // 软体米灰（--paper-400 域近似）

export class SnailView {
  readonly container = new Container();
  private readonly body = new Graphics();
  private readonly shell = new Graphics();

  constructor() {
    this.drawBody();
    this.drawShell();
    this.container.addChild(this.shell, this.body);
    this.container.eventMode = 'none';
  }

  private drawBody(): void {
    const g = this.body;
    // 软体：前低后高的蛞蝓形
    g.ellipse(2, 0, 14, 6).fill({ color: BODY, alpha: 0.95 });
    g.moveTo(14, -2).lineTo(18, -8).stroke({ width: 1.5, color: BODY });       // 触角
    g.moveTo(16, -1).lineTo(21, -6).stroke({ width: 1.5, color: BODY });
    g.circle(18, -8, 1.2).fill({ color: BODY });
    g.circle(21, -6, 1.2).fill({ color: BODY });
    // 腹足波纹
    for (let i = -1; i <= 1; i++) {
      g.moveTo(i * 7 - 3, 5).lineTo(i * 7 + 1, 3.5).stroke({ width: 1, color: SHELL_DEEP, alpha: 0.5 });
    }
  }

  private drawShell(): void {
    const g = this.shell;
    // 螺旋壳：同心弧
    g.circle(-8, -7, 9).fill({ color: SHELL });
    g.circle(-8, -7, 6).stroke({ width: 1.5, color: SHELL_DEEP });
    g.circle(-8, -7, 3.5).stroke({ width: 1.5, color: SHELL_DEEP });
    g.circle(-8, -7, 1.2).fill({ color: SHELL_DEEP });
  }

  /**
   * tSec 驱动爬行蠕动；retract 0..1（1=完全缩壳：软体藏进壳后）
   */
  update(tSec: number, moving: boolean, retract: number): void {
    const wiggle = moving ? Math.sin(tSec * 8) * 1.2 : 0;
    this.body.y = wiggle;
    this.body.alpha = 1 - retract;         // 缩壳：软体隐去
    this.shell.scale.set(1 + retract * 0.12);
  }

  setFacing(dir: 1 | -1): void {
    this.container.scale.x = dir;
  }
}
