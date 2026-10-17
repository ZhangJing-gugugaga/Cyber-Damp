/**
 * 手势识别（input 层）：拧毛巾顺时针画圈角累加（AC-14）
 * 屏幕坐标 y 向下：顺时针 = atan2 角度增加方向
 */
export const FULL_TURN = Math.PI * 2;

export class CircleWring {
  active = false;
  private cx = 0;
  private cy = 0;
  private acc = 0;
  private lastAngle: number | null = null;

  start(cx: number, cy: number): void {
    this.active = true;
    this.cx = cx;
    this.cy = cy;
    this.acc = 0;
    this.lastAngle = null;
  }

  /**
   * 喂入指针位置，返回累计顺时针弧度（0..≥2π 即满 1 圈）。
   * 反向画圈抵消进度；位移过远（>160px）自动取消（判为拖拽）。
   */
  feed(x: number, y: number): number {
    if (!this.active) return 0;
    const dx = x - this.cx;
    const dy = y - this.cy;
    if (Math.hypot(dx, dy) > 160) {
      this.active = false;
      return 0;
    }
    const angle = Math.atan2(dy, dx);
    if (this.lastAngle !== null) {
      let d = angle - this.lastAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.acc = Math.max(0, this.acc + d); // 只累计顺时针
    }
    this.lastAngle = angle;
    return this.acc;
  }

  cancel(): void {
    this.active = false;
    this.acc = 0;
    this.lastAngle = null;
  }
}

/** 单击判定：按下到抬起位移 ≤6px 且时长 ≤400ms */
export function isClick(downX: number, downY: number, upX: number, upY: number, ms: number): boolean {
  return Math.hypot(upX - downX, upY - downY) <= 6 && ms <= 400;
}
