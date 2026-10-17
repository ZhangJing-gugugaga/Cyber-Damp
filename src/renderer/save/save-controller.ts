/**
 * 渲染层存档编排（save 层）
 * 契约纪律 2：防抖 5s + beforeQuit flush（600ms 窗口内完成 write）
 * 纪律 3：load 失败/损坏/版本不符返回 null 走新开局（save-bridge 已兜底）
 */
import type { SaveData } from '../../shared/types/save';
import type { WorldRuntime } from '../app/world-runtime';
import type { RopeManager } from '../app/rope-manager';
import { saveApi } from '../app/save-bridge';

const DEBOUNCE_MS = 5000;

export class SaveController {
  private timer: number | null = null;
  private api = saveApi();

  constructor(
    private runtime: WorldRuntime,
    private ropes: RopeManager,
  ) {}

  /** 状态变化后调用：5s 防抖落盘 */
  schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  collect(): SaveData {
    return this.runtime.toSave(this.ropes.snapshot());
  }

  /** 立即写盘（beforeQuit / 周期兜底） */
  async flush(): Promise<void> {
    try {
      await this.api.write(this.collect());
    } catch (err) {
      console.warn('[save] flush 失败:', err);
    }
  }

  /** 退出前同步语义：取消待触发防抖，立即落盘（main 侧 600ms 退出窗口） */
  async flushNow(): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /** 读档（含结构校验由 main 侧完成；此处再过一层 null 兜底） */
  async load(): Promise<SaveData | null> {
    return this.api.load();
  }
}
