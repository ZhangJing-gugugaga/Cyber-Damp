/**
 * preload（隔离上下文，唯一通道 contextBridge）
 * 契约：docs/contracts/preload-api.md v1.0 §4 样板（实现逐字对齐）
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('damp', {
  window: {
    setIgnoreMouseEvents: (ignore: boolean, forward = true) =>
      ipcRenderer.invoke('window:setIgnoreMouseEvents', { ignore, forward }),
    getWorkArea: () => ipcRenderer.invoke('window:getWorkArea'),
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
    /** AC-28：全屏应用/锁屏暂停状态推送 */
    onPauseChanged: (cb: (paused: boolean, reason: string) => void) => {
      const h = (_: unknown, paused: boolean, reason: string) => cb(paused, reason);
      ipcRenderer.on('system:pauseChanged', h);
      return () => ipcRenderer.off('system:pauseChanged', h);
    },
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    quit: () => ipcRenderer.invoke('app:quit'),
    track: (name: string, props: Record<string, string | number | boolean>) =>
      ipcRenderer.invoke('app:track', name, props),
    onBeforeQuit: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('app:beforeQuit', h);
      return () => ipcRenderer.off('app:beforeQuit', h);
    },
  },
});
