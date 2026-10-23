/**
 * Open-Meteo current 快照校验（R3：字段齐全且在范围内；未知码仅影响事件资格）
 * 纯函数，主进程服务与单测共用。
 */
import { KNOWN_WEATHER_CODES } from './types/weather';
import type { WeatherSnapshot } from './types/weather';

export function validateCurrentWeather(raw: unknown, now = Date.now()): { snapshot: WeatherSnapshot; codeKnown: boolean } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const current = raw as Record<string, unknown>;
  const temperatureC = current.temperature_2m;
  const humidityPct = current.relative_humidity_2m;
  const weatherCode = current.weather_code;
  const observedAt = current.time;
  if (typeof temperatureC !== 'number' || !Number.isFinite(temperatureC)) return null;
  if (typeof humidityPct !== 'number' || !Number.isFinite(humidityPct) || humidityPct < 0 || humidityPct > 100) return null;
  if (typeof weatherCode !== 'number' || !Number.isInteger(weatherCode)) return null;
  if (typeof observedAt !== 'string' || observedAt.length === 0) return null;
  return {
    snapshot: {
      temperatureC, humidityPct, weatherCode, observedAt,
      fetchedAt: now, source: 'open-meteo',
    },
    codeKnown: KNOWN_WEATHER_CODES.has(weatherCode),
  };
}
