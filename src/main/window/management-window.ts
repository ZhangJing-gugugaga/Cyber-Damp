import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, Tray } from 'electron';
import * as path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import type { SceneStatus, ManagementSnapshot, ManagementCommand } from '../../shared/types/management';
import { restoreDesktop, hideDesktopIcons, attachOverlayToDesktop, suspendDesktopHost } from '../native/win32-desktop';

let manager: BrowserWindow | null = null;
let tray: Tray | null = null;
let scene: (() => BrowserWindow | null) | null = null;
let preload = '';
let snapshot: ManagementSnapshot = { files: [], coins: 0, owned: [] };
const status: SceneStatus = { paused: false, hidden: false, ready: false, shortcut: 'CommandOrControl+Alt+M' };
let startReplay: (() => void) | null = null;
let closing = false;
function publish(): void {
  manager?.webContents.send('management:status', status);
  scene?.()?.webContents.send('management:status', status);
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '管理回南天', click: openManagement },
    { label: status.hidden ? '显示场景' : '隐藏场景并暂停', click: () => void setHidden(!status.hidden) },
    { label: status.paused ? '继续' : '暂停', click: () => { status.paused = !status.paused; publish(); } },
    { label: '退出回南天', click: () => app.quit() },
  ]));
}
async function setHidden(hidden: boolean): Promise<void> {
  const win = scene?.(); if (!win) return;
  if (!hidden && status.displayError) return;
  if (!status.ready) {
    if (!hidden) { startReplay?.(); startReplay = null; manager?.hide(); }
    return;
  }
  if (hidden) {
    status.hidden = true; status.paused = true; suspendDesktopHost(true); restoreDesktop(); win.hide();
  } else {
    if (!attachOverlayToDesktop(win, false) || !await hideDesktopIcons()) { restoreDesktop(); return; }
    status.hidden = false; status.paused = false; win.showInactive();
    suspendDesktopHost(false);
  }
  publish();
}
export function openManagement(): void {
  if (manager && !manager.isDestroyed()) { manager.show(); manager.focus(); return; }
  manager = new BrowserWindow({ width: 720, height: 760, minWidth: 560, minHeight: 500,
    title: '回南天 · 桌面管理', backgroundColor: '#c5d2d4',
    icon: path.join(__dirname, '..', '..', 'renderer', 'brand', 'rain-mushroom.ico'),
    webPreferences: { preload, contextIsolation: true, sandbox: true } });
  manager.setMenuBarVisibility(false);
  manager.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  manager.on('close', event => { if (!closing) { event.preventDefault(); manager?.hide(); } });
  void manager.loadFile(path.join(__dirname, '..', '..', 'renderer', 'manage.html'));
}
export function waitForStartupPrompt(): Promise<void> {
  openManagement();
  return new Promise(resolve => { startReplay = resolve; publish(); });
}
export function isSceneHidden(): boolean { return status.hidden; }
export function markSceneReady(): void { status.ready = true; delete status.displayError; publish(); }
export async function reportDisplayError(message: string): Promise<void> {
  status.displayError = message.slice(0, 300); await setHidden(true); openManagement(); publish();
}
export function installManagement(getScene: () => BrowserWindow | null, preloadPath: string): void {
  scene = getScene; preload = preloadPath;
  const settingsFile = path.join(app.getPath('userData'), 'desktop-settings.json');
  try { const saved = JSON.parse(readFileSync(settingsFile, 'utf8')); if (typeof saved.shortcut === 'string') status.shortcut = saved.shortcut; } catch { /* first run */ }
  const register = (value: string): boolean => {
    try { return globalShortcut.register(value, openManagement); } catch { return false; }
  };
  if (!register(status.shortcut)) {
    status.shortcutError = '快捷键未能注册，可能已被占用。可从托盘打开管理窗并更换组合。';
    console.warn('[management] 快捷键冲突；请通过托盘重新设置');
  }
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', '..', 'renderer', 'brand', 'rain-mushroom.ico')));
  tray.setToolTip('回南天 · 管理与退出'); tray.on('double-click', openManagement); publish();
  ipcMain.handle('management:get', () => ({ status, snapshot }));
  ipcMain.handle('management:open', openManagement);
  ipcMain.on('management:snapshot', (event, value: ManagementSnapshot) => {
    if (event.sender !== scene?.()?.webContents) return;
    snapshot = value; manager?.webContents.send('management:snapshot', value);
  });
  ipcMain.handle('management:command', async (_event, command: ManagementCommand) => {
    if (!command || typeof command.action !== 'string') return { ok: false };
    switch (command.action) {
      case 'display-error': {
        if (_event.sender !== scene?.()?.webContents) return { ok: false };
        await reportDisplayError(command.value ?? '显示配置刷新失败，请重启回南天。'); break;
      }
      case 'navigate': {
        if (command.value !== 'care' && command.value !== 'shop' && command.value !== 'settings') return { ok: false, error: '未知管理页面。' };
        status.page = command.value; openManagement(); publish(); break;
      }
      case 'show': await setHidden(false); break;
      case 'hide': await setHidden(true); break;
      case 'pause': status.paused = !status.paused; publish(); break;
      case 'quit': app.quit(); break;
      case 'shortcut': {
        const next = command.value?.trim();
        if (!next || next.length > 100) return { ok: false, error: '请输入有效快捷键' };
        if ((next !== status.shortcut || status.shortcutError) && !register(next)) return { ok: false, error: '快捷键已被占用或格式无效，请换一个组合。托盘入口仍可使用。' };
        if (next !== status.shortcut) globalShortcut.unregister(status.shortcut);
        status.shortcut = next;
        delete status.shortcutError;
        writeFileSync(settingsFile, JSON.stringify({ shortcut: next })); publish(); break;
      }
      default: scene?.()?.webContents.send('management:command', command);
    }
    return { ok: true };
  });
  powerMonitor.on('suspend', () => { status.paused = true; publish(); });
  powerMonitor.on('resume', () => { openManagement(); publish(); });
  app.on('before-quit', () => { closing = true; globalShortcut.unregisterAll(); tray?.destroy(); });
}
