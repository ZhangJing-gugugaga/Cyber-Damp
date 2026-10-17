/**
 * main 进程入口（只装配，零业务，<100 行）
 * 架构 §8：单实例锁 / 生命周期 / 各子系统注册
 * 桌面层级：启动就绪后由渲染层信号触发 WorkerW 挂载；所有退出路径恢复原生图标。
 */
import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import { createOverlayWindow, startDisplayTracker } from './window/create-overlay-window';
import { registerHandlers } from './ipc/register-handlers';
import { startCpuMonitor } from './system/cpu-monitor';
import { installDesktopSafety, restoreDesktop } from './native/win32-desktop';
import { trackEvent } from './telemetry/event-log';

let win: BrowserWindow | null = null;
const startedAt = Date.now();

installDesktopSafety();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // ASMR 场景：允许无用户手势自动播放（雨声/闷雷）
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) win.show();
  });

  void app.whenReady().then(() => {
    trackEvent('session_start');
    // 产物布局：dist/main/index.js + dist/preload/index.js（rootDir=src 平铺）
    const created = createOverlayWindow(path.join(__dirname, '..', 'preload', 'index.js'));
    win = created;
    registerHandlers(
      () => win,
      () => (win && !win.isDestroyed() ? win.webContents : null),
    );
    startDisplayTracker(
      () => win,
      () => (win && !win.isDestroyed() ? win.webContents : null),
    );
    startCpuMonitor(() => (win && !win.isDestroyed() ? win.webContents : null));

    // 渲染进程崩溃：恢复原生桌面图标，避免用户桌面永久空缺
    created.webContents.on('render-process-gone', (_event, details) => {
      console.error('[cyber-damp] 渲染进程崩溃:', details.reason);
      restoreDesktop();
      if (!created.isDestroyed()) created.destroy();
      app.quit();
    });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    trackEvent('session_duration', { sec: Math.round((Date.now() - startedAt) / 1000) });
    if (win && !win.isDestroyed()) win.webContents.send('app:beforeQuit');
    restoreDesktop();
  });
}
