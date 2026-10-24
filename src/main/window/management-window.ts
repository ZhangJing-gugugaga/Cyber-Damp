import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import type { WebContents } from 'electron';
import * as path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import type { SceneStatus, ManagementCommand } from '../../shared/types/management';
import { setNativePaused } from '../desktop/native-event-scheduler';


let manager: BrowserWindow | null = null;
let tray: Tray | null = null;
let preload = '';
const status: SceneStatus = { paused: false, shortcut: 'CommandOrControl+Alt+M' };
let closing = false;
/** 原生模式托盘扩展（胶囊显隐等），由 index 装配时注入 */
let nativeTrayActions: { toggleCapsule(visible: boolean): void } | null = null;
export function setNativeTrayActions(actions: { toggleCapsule(visible: boolean): void } | null): void {
  nativeTrayActions = actions;
}
export function managementWebContents(): WebContents | null {
  return manager && !manager.isDestroyed() ? manager.webContents : null;
}
function publish(): void {
  manager?.webContents.send('management:status', status);
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '打开护理台', click: openManagement },
    ...(nativeTrayActions ? [{ label: status.capsuleHidden ? '显示天气胶囊' : '隐藏天气胶囊', click: () => { const show = status.capsuleHidden === true; status.capsuleHidden = !show; nativeTrayActions!.toggleCapsule(show); publish(); } }] : []),
    { label: status.paused ? '继续' : '暂停', click: () => {
        const next = !status.paused;
        // 原生模式：游戏节奏只认 save.native.paused，托盘必须写同一条状态，
        // 否则菜单是死控件（自然变化照常推进）。存档未建立等异常仅保留内存态。
        try { setNativePaused(next); } catch { /* 存档不可写 */ }
        status.paused = next; publish();
      } },
    { label: '退出回南天', click: () => app.quit() },
  ]));
}
export function openManagement(): void {
  if (manager && !manager.isDestroyed()) { if (manager.isMinimized()) manager.restore(); manager.show(); manager.focus(); return; }
  const area = screen?.getPrimaryDisplay().workAreaSize;
  const width = Math.min(900, Math.max(720, (area?.width ?? 900) - 24));
  const height = Math.min(640, Math.max(540, (area?.height ?? 640) - 24));
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
  void manager.loadFile(path.join(__dirname, '..', '..', 'renderer', 'care.html'));
}
/** 原生模式暂停状态回落托盘/状态投影（native:setPaused 后调用，保持菜单文案一致）。 */
export function setManagementPausedFlag(paused: boolean): void {
  status.paused = paused; publish();
}
export function installManagement(preloadPath: string): void {
  preload = preloadPath;
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
  ipcMain.handle('management:get', () => ({ status }));
  ipcMain.handle('management:open', openManagement);
  ipcMain.handle('management:command', async (_event, command: ManagementCommand) => {
    if (!command || typeof command.action !== 'string') return { ok: false };
    switch (command.action) {
      case 'window-close': case 'window-minimize': {
        if (_event.sender !== manager?.webContents) return { ok: false, error: '未知窗口来源。' };
        if (command.action === 'window-close') manager.close(); else manager.minimize();
        break;
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
      default: return { ok: false, error: '未知窗口命令。' };
    }
    return { ok: true };
  });
  app.on('before-quit', () => { closing = true; globalShortcut.unregisterAll(); tray?.destroy(); });
}
