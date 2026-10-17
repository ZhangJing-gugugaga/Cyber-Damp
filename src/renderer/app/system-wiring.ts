/**
 * 系统事件接线（app 层）：CPU 出汗数据源 / 退出 flush
 * 从 game.ts 拆出（单文件 ≤300 行纪律）。
 * AC-28 全屏暂停已移除：窗口本身位于 WorkerW 壁纸层，常规应用窗口天然覆盖其上。
 */
import type { WorldRuntime } from './world-runtime';
import type { SaveController } from '../save/save-controller';

export function wireSystemEvents(runtime: WorldRuntime, saver: SaveController): void {
  window.damp?.system.onCpu((usage) => {
    runtime.cpu = usage;
  });
  window.damp?.app.onBeforeQuit(() => {
    void saver.flushNow();
  });
}
