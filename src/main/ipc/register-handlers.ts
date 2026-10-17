/**
 * IPC 通道注册（main 进程，薄装配）
 * 契约：docs/contracts/preload-api.md v1.0 —— 通道名逐字对齐，不许自创
 */
import { ipcMain, app } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import { loadSave, writeSave } from '../save/save-store';
import { getWorkArea } from '../window/create-overlay-window';
import { trackEvent } from '../telemetry/event-log';
import type { SaveData } from '../../shared/types/save';

/** preload 出口浅校验（契约纪律 5）：非法载荷丢弃并 warn */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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
