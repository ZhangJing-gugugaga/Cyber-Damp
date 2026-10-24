import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, screen, Tray } from 'electron';
import type { WebContents } from 'electron';
import * as path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import type { SceneStatus, ManagementSnapshot, ManagementCommand } from '../../shared/types/management';
import { restoreDesktop, hideDesktopIcons, attachOverlayToDesktop, suspendDesktopHost } from '../native/win32-desktop';
import { STARTUP_STAGES, type StartupStage } from '../../shared/types/management';
import { openStartupWindow, updateStartupWindow } from './startup-window';

/** Goal v9 产品模式：无覆盖层/无图标隐藏，胶囊 + 护理窗（H2）。旧路径仅限 QA/回归环境。 */
export const NATIVE_MODE = typeof process !== 'undefined' && process.env.CD_QA !== '1' && process.env.CD_NO_ATTACH !== '1' && process.env.CD_LEGACY !== '1';

let manager: BrowserWindow | null = null;
let tray: Tray | null = null;
let scene: (() => BrowserWindow | null) | null = null;
let preload = '';
let snapshot: ManagementSnapshot = { files: [], coins: 0, owned: [] };
const status: SceneStatus = { paused: false, hidden: false, ready: false, shortcut: 'CommandOrControl+Alt+M' };
let closing = false;
let toolMode = false, escapeRegistered = false;
/** 原生模式托盘扩展（胶囊显隐等），由 index 装配时注入 */
let nativeTrayActions: { toggleCapsule(visible: boolean): void } | null = null;
export function setNativeTrayActions(actions: { toggleCapsule(visible: boolean): void } | null): void {
  nativeTrayActions = actions;
}
export function managementWebContents(): WebContents | null {
  return manager && !manager.isDestroyed() ? manager.webContents : null;
}
/** Desktop child windows do not reliably receive keyboard focus. Reuse
 * Electron shortcuts only while a tool and the desktop are both active. */
export function syncToolEscape(desktopActive: boolean): void {
  const wanted = toolMode && desktopActive && !status.paused && !status.hidden;
  if (!wanted && escapeRegistered) { globalShortcut.unregister('Escape'); escapeRegistered = false; }
  if (wanted && !escapeRegistered) {
    escapeRegistered = globalShortcut.register('Escape', () => {
      toolMode = false; syncToolEscape(false);
      scene?.()?.webContents.send('management:command', { action: 'cancel-tool' });
    });
    if (!escapeRegistered) {
      toolMode = false;
      scene?.()?.webContents.send('management:command', { action: 'cancel-tool' });
    }
  }
}
function publish(): void {
  updateStartupWindow(status);
  manager?.webContents.send('management:status', status);
  scene?.()?.webContents.send('management:status', status);
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '打开护理台', click: openManagement },
    ...(NATIVE_MODE && nativeTrayActions ? [{ label: status.capsuleHidden ? '显示天气胶囊' : '隐藏天气胶囊', click: () => { const show = status.capsuleHidden === true; status.capsuleHidden = !show; nativeTrayActions!.toggleCapsule(show); publish(); } }] : []),
    ...(NATIVE_MODE ? [] : [{ label: status.hidden ? '显示场景' : '隐藏场景并暂停', click: () => void setHidden(!status.hidden) } as Electron.MenuItemConstructorOptions]),
    { label: status.paused ? '继续' : '暂停', click: () => { status.paused = !status.paused; publish(); } },
    { label: '退出回南天', click: () => app.quit() },
  ]));
}
export function showStartupFeedback(): void { openStartupWindow(status, preload); }
async function setHidden(hidden: boolean): Promise<void> {
  const win = scene?.(); if (!win) return;
  if (!hidden && status.displayError) return;
  if (!status.ready) {
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
  if (manager && !manager.isDestroyed()) { if (manager.isMinimized()) manager.restore(); manager.show(); manager.focus(); return; }
  const area = screen?.getPrimaryDisplay().workAreaSize;
  const width = Math.min(720, Math.max(280, (area?.width ?? 744) - 24));
  const height = Math.min(760, Math.max(320, (area?.height ?? 784) - 24));
  // Electron's native frameless/drag support; transparent windows use a fixed
  // fitted size because native resizing is unsupported on some platforms.
  manager = new BrowserWindow({ width, height, minWidth: Math.min(560, width), minHeight: Math.min(500, height),
    frame: false, transparent: true, resizable: false, maximizable: false, hasShadow: false, show: false,
    title: '回南天 · 桌面管理', backgroundColor: '#00000000',
    icon: path.join(__dirname, '..', '..', 'renderer', 'brand', 'rain-mushroom.ico'),
    webPreferences: { preload, contextIsolation: true, sandbox: true } });
  manager.setMenuBarVisibility(false);
  manager.once('ready-to-show', () => { manager?.show(); });
  manager.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  manager.on('close', event => { if (!closing) { event.preventDefault(); manager?.hide(); } });
  // 原生模式加载护理台页面；旧模式保持原管理页（回归用）
  void manager.loadFile(path.join(__dirname, '..', '..', 'renderer', NATIVE_MODE ? 'care.html' : 'manage.html'));
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
      case 'startup-stage': {
        if (_event.sender !== scene?.()?.webContents || !STARTUP_STAGES.includes(command.value as StartupStage)) return { ok: false };
        if (!status.ready) { status.startupStage = command.value as StartupStage; publish(); }
        break;
      }
      case 'tool-mode': {
        if (_event.sender !== scene?.()?.webContents || !['on', 'off'].includes(command.value ?? '')) return { ok: false };
        toolMode = command.value === 'on';
        if (!toolMode) syncToolEscape(false);
        break;
      }
      case 'window-close': case 'window-minimize': {
        if (_event.sender !== manager?.webContents) return { ok: false, error: '未知窗口来源。' };
        if (command.action === 'window-close') manager.close(); else manager.minimize();
        break;
      }
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
      case 'sfx': case 'microphone': case 'veil': {
        if (_event.sender !== manager?.webContents && _event.sender !== scene?.()?.webContents) return { ok: false, error: '未知设置来源。' };
        const valid = command.action === 'veil' ? ['', 'low', 'high'].includes(command.value ?? 'invalid') : command.value === 'on' || command.value === 'off';
        if (!valid) return { ok: false, error: '设置值无效。' };
        scene?.()?.webContents.send('management:command', command); break;
      }
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
  powerMonitor.on('suspend', () => { if (!NATIVE_MODE) { status.paused = true; } publish(); });
  powerMonitor.on('resume', () => { if (!NATIVE_MODE) openManagement(); publish(); });
  app.on('before-quit', () => { closing = true; globalShortcut.unregisterAll(); tray?.destroy(); });
}
