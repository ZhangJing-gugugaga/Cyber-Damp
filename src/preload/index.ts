/**
 * preload（隔离上下文，唯一通道 contextBridge）
 * 契约：docs/contracts/preload-api.md v1.0 §4 样板（实现逐字对齐）
 * v1.2：desktop:scan / desktop:open / app:desktopReady（真实桌面 + WorkerW）
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopCursor, DesktopViewportRequest, DisplayChangedNotice } from '../shared/types/desktop';

contextBridge.exposeInMainWorld('damp', {
  management: {
    get: () => ipcRenderer.invoke('management:get'),
    open: () => ipcRenderer.invoke('management:open'),
    command: (command: unknown) => ipcRenderer.invoke('management:command', command),
    publish: (value: unknown) => ipcRenderer.send('management:snapshot', value),
    onCommand: (cb: (value: any) => void) => { const h = (_: unknown, value: unknown) => cb(value); ipcRenderer.on('management:command', h); return () => ipcRenderer.off('management:command', h); },
    onStatus: (cb: (value: any) => void) => { const h = (_: unknown, value: unknown) => cb(value); ipcRenderer.on('management:status', h); return () => ipcRenderer.off('management:status', h); },
    onSnapshot: (cb: (value: any) => void) => { const h = (_: unknown, value: unknown) => cb(value); ipcRenderer.on('management:snapshot', h); return () => ipcRenderer.off('management:snapshot', h); },
  },
  window: {
    onCursor: (cb: (point: DesktopCursor) => void) => {
      const handler = (_: unknown, point: DesktopCursor) => cb(point);
      ipcRenderer.on('window:cursor', handler);
      return () => ipcRenderer.off('window:cursor', handler);
    },
    setIgnoreMouseEvents: (ignore: boolean, forward = true) =>
      ipcRenderer.invoke('window:setIgnoreMouseEvents', { ignore, forward }),
    getWorkArea: () => ipcRenderer.invoke('window:getWorkArea'),
    getInputSettings: () => ipcRenderer.invoke('window:getInputSettings'),
  },
  desktop: {
    scan: (viewport?: DesktopViewportRequest) => ipcRenderer.invoke('desktop:scan', viewport),
    wallpaper: () => ipcRenderer.invoke('desktop:wallpaper'),
    open: (realPath: string) => ipcRenderer.invoke('desktop:open', realPath),
  },
  save: {
    load: () => ipcRenderer.invoke('save:load'),
    write: (data: unknown) => ipcRenderer.invoke('save:write', data),
  },
  system: {
    onCpu: (cb: (usage: number) => void) => {
      const h = (_: unknown, usage: number) => cb(usage);
      ipcRenderer.on('system:cpu', h);
      return () => ipcRenderer.off('system:cpu', h);
    },
    onDisplayChanged: (cb: (size: DisplayChangedNotice) => void) => {
      const h = (_: unknown, size: DisplayChangedNotice) => cb(size);
      ipcRenderer.on('system:displayChanged', h);
      return () => ipcRenderer.off('system:displayChanged', h);
    },
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    quit: () => ipcRenderer.invoke('app:quit'),
    track: (name: string, props: Record<string, string | number | boolean>) =>
      ipcRenderer.invoke('app:track', name, props),
    /** 世界装配完成 → 主进程挂 WorkerW + 隐藏原生图标（仅一次生效） */
    desktopReady: () => ipcRenderer.invoke('app:desktopReady'),
    viewportReady: (result: { requestId: number; ok: boolean }) => ipcRenderer.invoke('app:viewportReady', result),
    onBeforeQuit: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('app:beforeQuit', h);
      return () => ipcRenderer.off('app:beforeQuit', h);
    },
  },
});
