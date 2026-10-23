import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import type { SceneStatus } from '../../shared/types/management';

// Electron ready-to-show + separate lightweight document, as used by
// trodi/electron-splashscreen (MIT). Our existing desktopReady is authoritative;
// page load alone must never hide Explorer or declare the scene ready.
let startup: BrowserWindow | null = null;
let latest: SceneStatus;

export function updateStartupWindow(status: SceneStatus): void {
  latest = { ...status };
  if (!startup || startup.isDestroyed()) return;
  if (status.ready || status.displayError) { startup.destroy(); startup = null; return; }
  startup.webContents.send('management:status', latest);
}

export function openStartupWindow(status: SceneStatus, preload: string): void {
  if (status.ready || startup && !startup.isDestroyed()) return;
  latest = { ...status };
  const window = new BrowserWindow({ width: 360, height: 200, show: false,
    frame: false, transparent: true, resizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false, title: '回南天 · 正在准备',
    webPreferences: { preload, contextIsolation: true, sandbox: true } });
  startup = window;
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.once('ready-to-show', () => {
    if (window.isDestroyed() || latest.ready || latest.displayError) return;
    window.webContents.send('management:status', latest);
    window.showInactive();
    console.info('[startup:feedback-visible]', Math.round(process.uptime() * 1000));
  });
  window.on('closed', () => { if (startup === window) startup = null; });
  app.once('before-quit', () => { if (!window.isDestroyed()) window.destroy(); });
  void window.loadFile(path.join(__dirname, '..', '..', 'renderer', 'startup.html')).catch(error => {
    console.warn('[startup] Feedback unavailable:', error.message);
    if (!window.isDestroyed()) window.destroy();
  });
}
