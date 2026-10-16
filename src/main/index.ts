/**
 * main 进程入口（只装配，零业务，<100 行）
 * 架构 §8：单实例锁 / 生命周期 / 各子系统注册
 */
import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import { createOverlayWindow, startDisplayTracker } from './window/create-overlay-window';
import { registerHandlers } from './ipc/register-handlers';
import { startCpuMonitor } from './system/cpu-monitor';

let win: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) win.show();
  });

  void app.whenReady().then(() => {
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
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (win && !win.isDestroyed()) win.webContents.send('app:beforeQuit');
  });
}
