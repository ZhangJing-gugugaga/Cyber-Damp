/**
 * IPC 通道注册（main 进程，薄装配）
 * 契约：docs/contracts/preload-api.md v1.0 —— 通道名逐字对齐，不许自创
 * 新增：desktop:scan / desktop:open / app:desktopReady（真实桌面 + WorkerW 挂载）
 */
import { ipcMain, app, shell, dialog, screen } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import * as path from 'node:path';
import { loadSave, writeSave } from '../save/save-store';
import { getOverlayWorkArea, getOverlayCanvasScale, setOverlayCanvasScale, isOverlayReady, revealDesktopOverlay, waitForOverlayFirstFrame } from '../window/create-overlay-window';
import { trackEvent } from '../telemetry/event-log';
import { isDesktopPath, scanDesktop, RECYCLE_BIN_PATH } from '../desktop/desktop-scan';
import { recordDesktopUse } from '../desktop/desktop-usage';
import { readDesktopWallpaper } from '../native/win32-wallpaper';
import {
  attachOverlayToDesktop,
  hideDesktopIcons,
  startDesktopHostMonitor,
  shutdownDesktop,
  restoreDesktop,
  doubleClickInterval,
  suspendDesktopHost,
  overlayScreenRect,
} from '../native/win32-desktop';
import type { SaveData } from '../../shared/types/save';
import { scanNativeDesktop } from '../desktop/native-desktop-scan';
import { waitForStartupPrompt, markSceneReady, isSceneHidden, reportDisplayError } from '../window/management-window';

/** preload 出口浅校验（契约纪律 5）：非法载荷丢弃并 warn */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

let desktopReadyHandled = false;
let layoutValidated = false;
let layoutDisplaySignature = '';
const displaySignature = () => JSON.stringify(screen.getAllDisplays().map(display => ({ id: display.id, bounds: display.bounds, work: display.workArea, scale: display.scaleFactor })));
const shellPaths = new Set<string>();
let desktopReadyTask: Promise<{ ok: boolean; error?: string; iconsHidden: boolean }> | null = null;

export function registerHandlers(
  getWin: () => BrowserWindow | null,
  getWc: () => WebContents | null,
): void {
  let viewportSequence = 0;
  let pendingViewport: { id: number; scale: number; finish(ok: boolean): void } | null = null;
  ipcMain.handle('app:viewportReady', (event, value: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(value) || typeof value.ok !== 'boolean' || !pendingViewport || value.requestId !== pendingViewport.id) return { ok: false };
    const valid = value.ok && layoutValidated && layoutDisplaySignature === displaySignature()
      && Math.abs(getOverlayCanvasScale(getWin()!) - pendingViewport.scale) < 1e-6;
    pendingViewport.finish(valid); return { ok: valid };
  });
  const readCanvas = (win: BrowserWindow) => win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({scaleFactor: devicePixelRatio, width: innerWidth, height: innerHeight}))))') as Promise<{ scaleFactor: number; width: number; height: number }>;
  const refreshAttachedViewport = async (win: BrowserWindow): Promise<void> => {
    const canvas = await readCanvas(win);
    if (Math.abs(canvas.scaleFactor - getOverlayCanvasScale(win)) > 1e-6) {
      await new Promise<void>((resolve, reject) => {
        const id = ++viewportSequence;
        const timer = setTimeout(() => { if (pendingViewport?.id === id) pendingViewport = null; reject(new Error('挂载后的缩放刷新超时，已保留原生桌面。')); }, 8000);
        pendingViewport = { id, scale: canvas.scaleFactor, finish(ok) { clearTimeout(timer); pendingViewport = null; ok ? resolve() : reject(new Error('挂载后的缩放刷新失败，已保留原生桌面。')); } };
        win.webContents.send('system:displayChanged', { width: canvas.width, height: canvas.height, requestId: id });
      });
    }
    const accepted = await readCanvas(win), rect = overlayScreenRect(win);
    if (!rect || Math.abs(accepted.scaleFactor - getOverlayCanvasScale(win)) > 1e-6 || Math.abs(accepted.width * accepted.scaleFactor - rect.width) > 2
      || Math.abs(accepted.height * accepted.scaleFactor - rect.height) > 2) throw new Error('挂载后画布与窗口不一致，已保留原生桌面。');
  };
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

  ipcMain.handle('window:getWorkArea', () => { const win = getWin(); if (!win) throw new Error('no-window'); return getOverlayWorkArea(win); });
  ipcMain.handle('window:getInputSettings', () => ({ doubleClickMs: doubleClickInterval() }));

  // ---- 真实桌面 ----
  ipcMain.handle('desktop:scan', async (event, viewport: unknown) => {
    try {
      const win = getWin();
      if (!win || event.sender !== getWc()) throw new Error('桌面扫描仅由场景窗口请求');
      const scale = isPlainObject(viewport) ? viewport.scaleFactor : getOverlayCanvasScale(win);
      if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < .5 || scale > 8) throw new Error('无效画布缩放');
      if (isPlainObject(viewport) && (viewport.width !== undefined || viewport.height !== undefined)) {
        const bounds = overlayScreenRect(win), { width, height } = viewport;
        if (!bounds || typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)
          || width <= 0 || height <= 0 || Math.abs(width * scale - bounds.width) > 2 || Math.abs(height * scale - bounds.height) > 2) throw new Error('画布与物理窗口尺寸尚未一致，请重试');
      }
      setOverlayCanvasScale(win, scale);
      const signature = displaySignature();
      const entries = await scanNativeDesktop(win, scale);
      if (signature !== displaySignature()) throw new Error('扫描期间显示配置发生变化，请重试');
      shellPaths.clear();
      for (const entry of entries) shellPaths.add(entry.realPath);
      layoutValidated = true;
      layoutDisplaySignature = signature;
      return entries;
    } catch (error) {
      layoutValidated = false;
      restoreDesktop();
      void dialog.showMessageBox({ type: 'warning', title: '回南天',
        message: '暂时无法读取原生桌面布局，已保留 Windows 桌面。',
        detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
  ipcMain.handle('desktop:wallpaper', () => readDesktopWallpaper());

  ipcMain.handle('desktop:open', async (_e, realPath: unknown) => {
    if (typeof realPath !== 'string' || realPath.length === 0) {
      return { ok: false, error: 'invalid-path' };
    }
    if (realPath === RECYCLE_BIN_PATH || (realPath.startsWith('::') && shellPaths.has(realPath))) {
      try {
        await shell.openExternal(realPath === RECYCLE_BIN_PATH ? 'shell:RecycleBinFolder' : `shell:${realPath}`);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    const full = path.resolve(realPath);
    if (!isDesktopPath(full)) {
      console.warn('[desktop] 拒绝打开桌面之外的路径:', full);
      return { ok: false, error: 'outside-desktop' };
    }
    const error = await shell.openPath(full);
    if (error) console.warn('[desktop] 打开失败', full, error);
    else {
      console.info('[desktop] 已打开真实文件:', full);
      await recordDesktopUse(full).catch((err) => console.warn('[desktop] Usage timestamp write failed:', err));
    }
    return error ? { ok: false, error } : { ok: true };
  });

  /**
   * 渲染层完成世界装配后的就绪信号：
   * 此时才 SetParent 到 WorkerW 并隐藏原生图标；挂载失败则保持图标原样。
   */
  ipcMain.handle('app:desktopReady', async event => {
    if (event.sender !== getWc()) return { ok: false, error: 'invalid-window' };
    if (!layoutValidated || layoutDisplaySignature !== displaySignature()) {
      await reportDisplayError('显示布局已变化，已保留原生桌面。请重启回南天重新读取。');
      return { ok: false, error: 'native-layout-unavailable', iconsHidden: false };
    }
    const win = getWin();
    if (!win || win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (desktopReadyHandled && isOverlayReady(win)) return { ok: true, already: true };
    if (desktopReadyHandled && isSceneHidden()) { markSceneReady(); return { ok: true, hidden: true }; }
    if (process.env.CD_QA === '1' || process.env.CD_NO_ATTACH === '1') {
      console.info('[desktop] QA/NO_ATTACH 模式：不挂 WorkerW、不隐藏原生图标');
      if (process.env.CD_NO_ATTACH === '1' && process.env.CD_QA !== '1') {
        if (!await waitForOverlayFirstFrame(win) || !revealDesktopOverlay(win)) return { ok: false, error: 'renderer-not-ready' };
      }
      return { ok: true, skipped: true };
    }
    if (desktopReadyTask) return desktopReadyTask;
    const task = (async () => {
      try {
        if (!desktopReadyHandled) await waitForStartupPrompt();
        if (layoutDisplaySignature !== displaySignature()) throw new Error('显示布局在准备期间发生变化，请重启重新读取。');
        if (!await waitForOverlayFirstFrame(win) || win.isDestroyed()) return { ok: false, error: 'renderer-not-ready', iconsHidden: false };
        if (!attachOverlayToDesktop(win, false)) {
          console.warn('[desktop] 挂载失败，窗口保持隐藏，原生桌面继续可用');
          return { ok: false, error: 'attach-failed', iconsHidden: false };
        }
        await refreshAttachedViewport(win);
        if (layoutDisplaySignature !== displaySignature()) throw new Error('接管期间显示配置已变化，已保留原生桌面。');
        const iconsHidden = await hideDesktopIcons();
        if (!iconsHidden || win.isDestroyed() || !revealDesktopOverlay(win)) {
          restoreDesktop();
          return { ok: false, error: iconsHidden ? 'renderer-not-ready' : 'desktop-protection-failed', iconsHidden: false };
        }
        desktopReadyHandled = true;
        suspendDesktopHost(false);
        markSceneReady();
        startDesktopHostMonitor(win);
        return { ok: true, iconsHidden: true };
      } catch (error) {
        console.error('[desktop] 桌面接管失败，保留原生桌面:', error);
        if (!win.isDestroyed()) win.hide();
        restoreDesktop();
        await reportDisplayError(error instanceof Error ? error.message : '桌面接管失败，已保留原生桌面。');
        return { ok: false, error: 'desktop-ready-failed', iconsHidden: false };
      }
    })();
    desktopReadyTask = task;
    try { return await task; }
    finally { if (desktopReadyTask === task) desktopReadyTask = null; }
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
    shutdownDesktop();
    // 先广播 beforeQuit 给渲染层 flush，600ms 后退出（契约 §1）
    const wc = getWc();
    if (wc && !wc.isDestroyed()) wc.send('app:beforeQuit');
    await new Promise((r) => setTimeout(r, 600));
    app.quit();
  });
}
