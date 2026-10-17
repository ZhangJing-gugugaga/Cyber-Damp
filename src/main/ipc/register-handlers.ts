/**
 * IPC 通道注册（main 进程，薄装配）
 * 契约：docs/contracts/preload-api.md v1.0 —— 通道名逐字对齐，不许自创
 * 新增：desktop:scan / desktop:open / app:desktopReady（真实桌面 + WorkerW 挂载）
 */
import { ipcMain, app, shell } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import * as path from 'node:path';
import { loadSave, writeSave } from '../save/save-store';
import { getWorkArea } from '../window/create-overlay-window';
import { trackEvent } from '../telemetry/event-log';
import { desktopDir, scanDesktop, RECYCLE_BIN_PATH } from '../desktop/desktop-scan';
import {
  attachOverlayToDesktop,
  hideDesktopIcons,
  startDesktopHostMonitor,
} from '../native/win32-desktop';
import type { SaveData } from '../../shared/types/save';

/** preload 出口浅校验（契约纪律 5）：非法载荷丢弃并 warn */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

let desktopReadyHandled = false;

export function registerHandlers(
  getWin: () => BrowserWindow | null,
  getWc: () => WebContents | null,
): void {
  // 窗口穿透（仅跳变调用，禁止每帧——由渲染层 click-through 保证）
  ipcMain.handle('window:setIgnoreMouseEvents', (e, payload: unknown) => {
    if (process.env.CD_QA === '1') return; // QA：保持窗口始终可点击（供 CUA 走查）
    if (!isPlainObject(payload) || typeof payload.ignore !== 'boolean') {
      console.warn('[ipc] window:setIgnoreMouseEvents 非法载荷，已丢弃');
      return;
    }
    const forward = typeof payload.forward === 'boolean' ? payload.forward : true;
    getWin()?.setIgnoreMouseEvents(payload.ignore, { forward });
  });

  ipcMain.handle('window:getWorkArea', () => getWorkArea());

  // ---- 真实桌面 ----
  ipcMain.handle('desktop:scan', () => scanDesktop());

  ipcMain.handle('desktop:open', async (_e, realPath: unknown) => {
    if (typeof realPath !== 'string' || realPath.length === 0) {
      return { ok: false, error: 'invalid-path' };
    }
    if (realPath === RECYCLE_BIN_PATH) {
      try {
        await shell.openExternal('shell:RecycleBinFolder');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    const root = desktopDir();
    const full = path.resolve(realPath);
    const rel = path.relative(root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      console.warn('[desktop] 拒绝打开桌面之外的路径:', full);
      return { ok: false, error: 'outside-desktop' };
    }
    const error = await shell.openPath(full);
    if (error) console.warn('[desktop] 打开失败', full, error);
    else console.info('[desktop] 已打开真实文件:', full);
    return error ? { ok: false, error } : { ok: true };
  });

  /**
   * 渲染层完成世界装配后的就绪信号：
   * 此时才 SetParent 到 WorkerW 并隐藏原生图标；挂载失败则保持图标原样。
   */
  ipcMain.handle('app:desktopReady', () => {
    if (desktopReadyHandled) return { ok: true, already: true };
    const win = getWin();
    if (!win || win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (process.env.CD_QA === '1' || process.env.CD_NO_ATTACH === '1') {
      console.info('[desktop] QA/NO_ATTACH 模式：不挂 WorkerW、不隐藏原生图标');
      return { ok: true, skipped: true };
    }
    const attached = attachOverlayToDesktop(win);
    if (!attached) {
      // 挂载失败不隐藏图标；监护器每 5s 重试（Explorer 尚未生成 WorkerW 时可自愈）
      startDesktopHostMonitor(win);
      return { ok: false, error: 'attach-failed', iconsHidden: false };
    }
    desktopReadyHandled = true;
    const iconsHidden = hideDesktopIcons();
    startDesktopHostMonitor(win);
    return { ok: true, iconsHidden };
  });

  // 存档
  ipcMain.handle('save:load', () => loadSave());
  ipcMain.handle('save:write', (e, data: unknown) => {
    if (!isPlainObject(data)) {
      console.warn('[ipc] save:write 非法载荷，已丢弃');
      return { ok: false };
    }
    return writeSave(data as unknown as SaveData);
  });

  // 应用
  ipcMain.handle('app:version', () => app.getVersion());
  // PRD §11 本地埋点（渲染层 trackEvent 通道）
  ipcMain.handle('app:track', (_e, name: unknown, props: unknown) => trackEvent(name, props));
  ipcMain.handle('app:quit', async () => {
    // 先广播 beforeQuit 给渲染层 flush，600ms 后退出（契约 §1）
    const wc = getWc();
    if (wc && !wc.isDestroyed()) wc.send('app:beforeQuit');
    await new Promise((r) => setTimeout(r, 600));
    app.quit();
  });
}
