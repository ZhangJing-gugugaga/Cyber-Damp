/**
 * 点击穿透状态机（input 层，AC-26）
 * 契约纪律 1：window:setIgnoreMouseEvents 仅命中态跳变时调用，禁止逐帧；
 * 常态 forward: true 让 mousemove 持续送达做命中测试
 */
export class ClickThrough {
  private ignore = true;
  private sent = false;

  constructor() {
    // 初始穿透（演出期间强制穿透由 forcePassThrough 控制）
    this.apply(true);
  }

  /** force: 演出期间锁定穿透 */
  update(hit: boolean, force = false): void {
    const next = force ? true : !hit;
    if (next !== this.ignore || !this.sent) this.apply(next);
  }

  private apply(ignore: boolean): void {
    this.ignore = ignore;
    this.sent = true;
    void window.damp?.window.setIgnoreMouseEvents(ignore, true);
  }
}
