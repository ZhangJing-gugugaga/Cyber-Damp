/**
 * 系统事件接线（app 层）：CPU 出汗数据源 / 退出 flush / 全屏锁屏暂停
 * 从 game.ts 拆出（单文件 ≤300 行纪律）。
 */
import type { Application } from 'pixi.js';
import type { WorldRuntime } from './world-runtime';
import type { SaveController } from '../save/save-controller';
import type { GameLoopHandle } from './game-loop';

export function wireSystemEvents(runtime: WorldRuntime, saver: SaveController): void {
  window.damp?.system.onCpu((usage) => {
    runtime.cpu = usage;
  });
  window.damp?.app.onBeforeQuit(() => {
    void saver.flushNow();
  });
}

/** AC-28：全屏应用/锁屏 → 停物理 + 停渲染；恢复时反向 */
export function wirePause(app: Application, loop: GameLoopHandle): void {
  window.damp?.system.onPauseChanged((paused) => {
    loop.setPaused(paused);
    if (paused) app.stop();
    else app.start();
  });
}
