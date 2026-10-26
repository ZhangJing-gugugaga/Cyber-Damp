/** 当前护理台与胶囊的最小 preload 出口；契约 v1.15（v1.14 + gameplay-v2 玩法通道与 wallpaper 组）。 */
import { contextBridge, ipcRenderer } from 'electron';
import type { CityOption, WeatherLocation, WeatherLookup } from '../shared/types/weather';

contextBridge.exposeInMainWorld('damp', {
  management: {
    get: () => ipcRenderer.invoke('management:get'),
    open: () => ipcRenderer.invoke('management:open'),
    command: (command: unknown) => ipcRenderer.invoke('management:command', command),
    onStatus: (cb: (value: any) => void) => { const h = (_: unknown, value: unknown) => cb(value); ipcRenderer.on('management:status', h); return () => ipcRenderer.off('management:status', h); },
  },
  window: {
    setIgnoreMouseEvents: (ignore: boolean, forward = true) =>
      ipcRenderer.invoke('window:setIgnoreMouseEvents', { ignore, forward }),
  },
  weather: {
    current: (location: WeatherLocation, forceRefresh = false) =>
      ipcRenderer.invoke('weather:current', { ...location, forceRefresh }),
    searchCity: (query: string) =>
      ipcRenderer.invoke('weather:searchCity', { query }) as Promise<{ ok: true; options: CityOption[] } | { ok: false; error: string }>,
  },
  native: {
    status: () => ipcRenderer.invoke('native:status'),
    setLocation: (location: unknown) => ipcRenderer.invoke('native:setLocation', location),
    setPaused: (paused: boolean) => ipcRenderer.invoke('native:setPaused', { paused }),
    careProgress: (objectId: string, progress: number, mask?: string) => ipcRenderer.invoke('native:careProgress', { objectId, progress, mask }),
    careComplete: (objectId: string) => ipcRenderer.invoke('native:careComplete', { objectId }),
    quickCare: (objectId: string) => ipcRenderer.invoke('native:quickCare', { objectId }),
    harvest: (objectId: string) => ipcRenderer.invoke('native:harvest', { objectId }),
    buy: (itemId: string) => ipcRenderer.invoke('native:buy', { itemId }),
    onboardingDone: () => ipcRenderer.invoke('native:onboarding'),
    restoreAndPause: () => ipcRenderer.invoke('native:restoreAndPause'),
    resume: () => ipcRenderer.invoke('native:resume'),
    setAutostart: (on: boolean) => ipcRenderer.invoke('native:setAutostart', { on }),
    getAutostart: () => ipcRenderer.invoke('native:getAutostart'),
    // v0.2 玩法通道（gameplay-v2 契约 v1.15）
    careProgressV2: (payload: unknown) => ipcRenderer.invoke('native:careProgressV2', payload),
    careCompleteV2: (objectId: string) => ipcRenderer.invoke('native:careCompleteV2', { objectId }),
    harvestV2: (payload: unknown) => ipcRenderer.invoke('native:harvestV2', payload),
    plantSpore: (payload: unknown) => ipcRenderer.invoke('native:plantSpore', payload),
    cancelPlant: (objectId: string) => ipcRenderer.invoke('native:cancelPlant', { objectId }),
    setOverlayVariant: (variant: 'A' | 'B') => ipcRenderer.invoke('native:setOverlayVariant', { variant }),
  },
  // 胶囊交互（0.1.28）：只有相对位移与点击，主进程校验发送方是胶囊窗本身
  capsule: {
    dragStart: () => ipcRenderer.send('capsule:dragStart'),
    dragMove: (dx: number, dy: number) => ipcRenderer.send('capsule:dragMove', { dx, dy }),
    dragEnd: () => ipcRenderer.send('capsule:dragEnd'),
    click: () => ipcRenderer.send('capsule:click'),
  },
  wallpaper: {
    status: () => ipcRenderer.invoke('wallpaper:status'),
    setEnabled: (on: boolean) => ipcRenderer.invoke('wallpaper:setEnabled', { on }),
    wipe: (payload: unknown) => ipcRenderer.invoke('wallpaper:wipe', payload),
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    quit: () => ipcRenderer.invoke('app:quit'),
    track: (name: string, props: Record<string, string | number | boolean>) =>
      ipcRenderer.invoke('app:track', name, props),
  },
});
