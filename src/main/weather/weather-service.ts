/**
 * Open-Meteo 天气服务（R3：合法接入、署名、缓存、离线诚实）
 *
 * - 数据源 https://api.open-meteo.com/v1/forecast 的 current 字段；
 *   城市搜索 https://geocoding-api.open-meteo.com/v1/search。
 * - Free API 仅限非商业用途（用户已确认本机及私下非商业体验），
 *   署名在设置页"关于/数据来源"与胶囊悬停提示中展示（R8/UI 责任）。
 * - 缓存按城市坐标分开存放；30 分钟内直接用，超时先刷新，
 *   失败可用 ≤24h 旧快照并标 stale；>24h 只展示，不得驱动自然事件。
 * - 首次取数（无缓存）按 8s 超时 + 2 次重试（等 1s/3s）执行；
 *   已有缓存时的后台刷新只做单次尝试，避免界面被网络阻塞。
 * - 字段校验：温度有限、湿度 0–100、码为数值；不合法 → unavailable，
 *   绝不伪造实况。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import {
  FIRST_LOAD_RETRY_DELAYS_MS, KNOWN_WEATHER_CODES,
  WEATHER_CACHE_TTL_MS, WEATHER_STALE_MAX_MS, WEATHER_TIMEOUT_MS,
} from '../../shared/types/weather';
import { observationAgeMs, validateCurrentWeather } from '../../shared/weather-validate';
import { mergeCityResults, suggestSuffixedQuery, type RankableCity } from '../../shared/weather-rank';
import { DEFAULT_LOCATION, DEFAULT_WEATHER_SNAPSHOT } from '../../shared/native-defaults';
import type { CityOption, WeatherLocation, WeatherLookup, WeatherSnapshot } from '../../shared/types/weather';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

interface CacheEntry {
  snapshot: WeatherSnapshot;
}
interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>; // key: `${lat.toFixed(4)},${lon.toFixed(4)}`
}

function cachePath(): string {
  return path.join(app.getPath('userData'), 'weather-cache.json');
}

function loadCache(): CacheFile {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as CacheFile;
    if (data?.version === 1 && data.entries && typeof data.entries === 'object') return data;
  } catch { /* 首次或损坏：空缓存 */ }
  return { version: 1, entries: {} };
}

function persistCache(cache: CacheFile): void {
  const target = cachePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
  fs.renameSync(tmp, target);
}

function cacheKey(location: WeatherLocation): string {
  return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
}

async function fetchCurrent(location: WeatherLocation): Promise<{ snapshot: WeatherSnapshot; codeKnown: boolean }> {
  const url = `${FORECAST_URL}?latitude=${location.latitude}&longitude=${location.longitude}`
    + `&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`;
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`天气服务返回 ${response.status}`);
  const body = (await response.json()) as { current?: unknown; utc_offset_seconds?: unknown };
  const offset = typeof body.utc_offset_seconds === 'number' ? body.utc_offset_seconds : undefined;
  const validated = validateCurrentWeather(body.current, Date.now(), offset);
  if (!validated) throw new Error('天气响应字段缺失或无效');
  return validated;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 首次取数：8s 超时，失败等 1s/3s 后各重试一次（总计最多 3 次请求）。 */
async function fetchWithFirstLoadRetries(location: WeatherLocation) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FIRST_LOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fetchCurrent(location);
    } catch (error) {
      lastError = error;
      if (attempt < FIRST_LOAD_RETRY_DELAYS_MS.length) await sleep(FIRST_LOAD_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getWeather(location: WeatherLocation, forceRefresh = false): Promise<WeatherLookup> {
  const key = cacheKey(location);
  const cache = loadCache();
  const entry = cache.entries[key];
  const age = entry ? Date.now() - entry.snapshot.fetchedAt : Number.POSITIVE_INFINITY;

  // 缓存 TTL 按获取时间；事件资格与离线过期按气象快照时间（R3），刷新不能让旧观测永久有效
  if (!forceRefresh && age <= WEATHER_CACHE_TTL_MS) {
    const snap = entry!.snapshot;
    return toLookup('ok', snap, observationAgeMs(snap.observedAt, Date.now()), KNOWN_WEATHER_CODES.has(snap.weatherCode));
  }

  // 需要刷新：有缓存时单次尝试（不阻塞 28s）；无缓存按首次策略带重试
  try {
    const result = entry
      ? await fetchCurrent(location)
      : await fetchWithFirstLoadRetries(location);
    cache.entries[key] = { snapshot: result.snapshot };
    persistCache(cache);
    return toLookup('ok', result.snapshot, observationAgeMs(result.snapshot.observedAt, Date.now()), result.codeKnown);
  } catch (error) {
    const observedAge = entry ? observationAgeMs(entry.snapshot.observedAt, Date.now()) : Number.POSITIVE_INFINITY;
    if (entry && observedAge <= WEATHER_STALE_MAX_MS) {
      return toLookup('stale', entry.snapshot, observedAge, KNOWN_WEATHER_CODES.has(entry.snapshot.weatherCode));
    }
    const errorText = error instanceof Error ? error.message : String(error);
    // 内置默认快照只属于默认城市（长沙）。其他城市断网时不能拿长沙的数据冒充，
    // 否则界面会显示当前城市名却是别处的天气。
    if (location.cityId !== DEFAULT_LOCATION.cityId) {
      return { status: 'unavailable', ageMs: 0, usableForEvents: false, error: errorText };
    }
    // 实况彻底不可用：回退内置默认快照（用户裁决：硬编码长沙，
    // 开箱即用、断网可用）。必须带 defaulted 标记，UI 标注"内置默认"。
    return {
      status: 'ok',
      snapshot: {
        ...DEFAULT_WEATHER_SNAPSHOT,
        fetchedAt: Date.now(),
        source: 'open-meteo' as const,
      },
      ageMs: 0,
      usableForEvents: true,
      defaulted: true,
      error: errorText,
    };
  }
}

function toLookup(status: WeatherLookup['status'], snapshot: WeatherSnapshot, ageMs: number, codeKnown = true): WeatherLookup {
  return {
    status, snapshot, ageMs: Math.round(ageMs),
    usableForEvents: codeKnown && ageMs <= WEATHER_STALE_MAX_MS && status !== 'unavailable',
  };
}

/** 城市搜索：原词 + "市"后缀双查询合并重排。中文短名（如"长沙"）在
 * 地理编码里会被同名乡镇淹没，真正的城市要靠后缀别名与人口重排才能
 * 稳定排在首位（R3 城市选择可辨识性；纯排序逻辑见 shared/weather-rank）。 */
export async function searchCities(query: string): Promise<CityOption[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const suffix = suggestSuffixedQuery(trimmed);
  const groups = await Promise.all([
    fetchCityGroup(trimmed),
    suffix ? fetchCityGroup(suffix).catch(() => [] as GeocodeRaw[]) : Promise.resolve([] as GeocodeRaw[]),
  ]);
  const merged = mergeCityResults(groups, 10);
  return merged.map((result) => ({
    id: result.id, name: result.name, admin1: result.admin1,
    country: result.country, latitude: result.latitude, longitude: result.longitude,
  }));
}

interface GeocodeRaw extends RankableCity { }

async function fetchCityGroup(name: string): Promise<GeocodeRaw[]> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=10&language=zh&format=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`城市搜索返回 ${response.status}`);
  const body = (await response.json()) as {
    results?: Array<{
      id: number; name: string; latitude: number; longitude: number;
      admin1?: string; country?: string; feature_code?: string; population?: number;
    }>;
  };
  return (body.results ?? []).map((result) => ({
    id: String(result.id), name: result.name, admin1: result.admin1,
    country: result.country, latitude: result.latitude, longitude: result.longitude,
    featureCode: result.feature_code, population: result.population,
  }));
}
