/**
 * main 进程入口（只装配，零业务，<100 行）
 * 架构 §8：单实例锁 / 生命周期 / 各子系统注册
 */
import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import { createOverlayWindow, startDisplayTracker } from './window/create-overlay-window';
import { registerHandlers } from './ipc/register-handlers';
import { startCpuMonitor } from './system/cpu-monitor';
import { startFullscreenMonitor } from './system/fullscreen-monitor';
import { trackEvent } from './telemetry/event-log';

let win: BrowserWindow | null = null;
const startedAt = Date.now();

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
    win = createOverlayWindow(path.join(__dirname, '..', 'preload', 'index.js'));
    registerHandlers(
      () => win,
      () => (win && !win.isDestroyed() ? win.webContents : null),
    );
    startDisplayTracker(
      () => win,
      () => (win && !win.isDestroyed() ? win.webContents : null),
    );
    startCpuMonitor(() => (win && !win.isDestroyed() ? win.webContents : null));
    // QA 模式不启用全屏自动隐藏（保持窗口可捕获可点击）
    if (process.env.CD_QA !== '1') startFullscreenMonitor(() => win);
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    trackEvent('session_duration', { sec: Math.round((Date.now() - startedAt) / 1000) });
    if (win && !win.isDestroyed()) win.webContents.send('app:beforeQuit');
  });
}
