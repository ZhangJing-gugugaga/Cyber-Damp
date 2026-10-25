/**
 * Open-Meteo current 快照校验（R3：字段齐全且在范围内；未知码仅影响事件资格）
 * 纯函数，主进程服务与单测共用。
 */
import { KNOWN_WEATHER_CODES } from './types/weather';
import type { WeatherSnapshot } from './types/weather';

/** Open-Meteo 的 current.time 形如 "2026-10-25T12:15"，是位置当地时间，不带时区。 */
const LOCAL_MINUTE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * 用返回的 utc_offset_seconds 把当地时间补全为带偏移的 ISO 字符串。
 * 若不补偏移，Date.parse 会按运行机器的时区解释，在其他时区会把快照年龄算错。
 */
export function normalizeObservedAt(time: string, utcOffsetSeconds?: number): string {
  if (!LOCAL_MINUTE_RE.test(time) || typeof utcOffsetSeconds !== 'number' || !Number.isFinite(utcOffsetSeconds)) {
    return time;
  }
  const sign = utcOffsetSeconds < 0 ? '-' : '+';
  const minutes = Math.abs(Math.round(utcOffsetSeconds / 60));
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${time}:00${sign}${hh}:${mm}`;
}

/**
 * 气象快照年龄（R3：按 observedAt 核对，不按获取时间核对）。
 * 无法解析的时间返回 Infinity，即不可用于事件，而不是永久有效。
 */
export function observationAgeMs(observedAt: string, now: number): number {
  const observed = Date.parse(observedAt);
  return Number.isFinite(observed) ? now - observed : Number.POSITIVE_INFINITY;
}

export function validateCurrentWeather(
  raw: unknown,
  now = Date.now(),
  utcOffsetSeconds?: number,
): { snapshot: WeatherSnapshot; codeKnown: boolean } | null {
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
      temperatureC, humidityPct, weatherCode,
      observedAt: normalizeObservedAt(observedAt, utcOffsetSeconds),
      fetchedAt: now, source: 'open-meteo',
    },
    codeKnown: KNOWN_WEATHER_CODES.has(weatherCode),
  };
}
