/**
 * preload（隔离上下文，唯一通道 contextBridge）
 * 契约：docs/contracts/preload-api.md v1.0 §4 样板（实现逐字对齐）
 * v1.2：desktop:scan / desktop:open / app:desktopReady（真实桌面 + WorkerW）
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('damp', {
  window: {
    onCursor: (cb: (point: { x: number; y: number }) => void) => {
      const handler = (_: unknown, point: { x: number; y: number }) => cb(point);
      ipcRenderer.on('window:cursor', handler);
      return () => ipcRenderer.off('window:cursor', handler);
    },
    setIgnoreMouseEvents: (ignore: boolean, forward = true) =>
      ipcRenderer.invoke('window:setIgnoreMouseEvents', { ignore, forward }),
    getWorkArea: () => ipcRenderer.invoke('window:getWorkArea'),
    getInputSettings: () => ipcRenderer.invoke('window:getInputSettings'),
  },
  desktop: {
    scan: () => ipcRenderer.invoke('desktop:scan'),
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
    onDisplayChanged: (cb: (size: { width: number; height: number }) => void) => {
      const h = (_: unknown, size: { width: number; height: number }) => cb(size);
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
    onBeforeQuit: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('app:beforeQuit', h);
      return () => ipcRenderer.off('app:beforeQuit', h);
    },
  },
});
