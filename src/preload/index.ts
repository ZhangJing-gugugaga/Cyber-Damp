/** 当前护理台与胶囊的最小 preload 出口；契约 v1.14。 */
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
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    quit: () => ipcRenderer.invoke('app:quit'),
    track: (name: string, props: Record<string, string | number | boolean>) =>
      ipcRenderer.invoke('app:track', name, props),
  },
});
