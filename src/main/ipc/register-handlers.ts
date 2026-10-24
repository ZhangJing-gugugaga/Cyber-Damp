/** 当前原生产品的公共 IPC；旧覆盖层、替身输入和整档写通道已退役。 */
import { ipcMain, app, BrowserWindow } from 'electron';
import { trackEvent } from '../telemetry/event-log';
import type { CityOption, WeatherLocation, WeatherLookup } from '../../shared/types/weather';
import { getWeather, searchCities } from '../weather/weather-service';
import { isAllowedSender } from './native-handlers';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function registerHandlers(): void {
  ipcMain.handle('window:setIgnoreMouseEvents', (event, payload: unknown) => {
    if (!isAllowedSender(event.sender) || !isPlainObject(payload) || typeof payload.ignore !== 'boolean') return;
    const forward = typeof payload.forward === 'boolean' ? payload.forward : true;
    BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(payload.ignore, { forward });
  });

  ipcMain.handle('weather:current', async (event, payload: unknown): Promise<WeatherLookup> => {
    // 原生模式：护理台/胶囊（已登记发送方）可取天气
    const allowed = isAllowedSender(event.sender);
    if (!allowed || !isPlainObject(payload)) return { status: 'unavailable', error: 'invalid-request' };
    const { cityId, label, latitude, longitude, forceRefresh } = payload;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || typeof cityId !== 'string' || typeof label !== 'string' || label.length > 100) {
      return { status: 'unavailable', error: 'invalid-location' };
    }
    const location: WeatherLocation = { cityId, label, latitude, longitude };
    return getWeather(location, forceRefresh === true);
  });
  ipcMain.handle('weather:searchCity', async (event, payload: unknown): Promise<{ ok: true; options: CityOption[] } | { ok: false; error: string }> => {
    const allowedSearch = isAllowedSender(event.sender);
    if (!allowedSearch || !isPlainObject(payload) || typeof payload.query !== 'string') {
      return { ok: false, error: 'invalid-request' };
    }
    try {
      return { ok: true, options: await searchCities(payload.query) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });


  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:track', (event, name: unknown, props: unknown) => {
    if (isAllowedSender(event.sender)) trackEvent(name, props);
  });
  ipcMain.handle('app:quit', event => {
    if (isAllowedSender(event.sender)) app.quit();
  });
}
