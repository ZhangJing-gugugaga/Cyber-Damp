/**
 * 天气共享类型（R3：Open-Meteo `current` 快照语义）
 * 今日天气 = 所选城市最新 current 时刻条件，不是当日最高/最低温预报。
 */

/** R3/R5 认可的 WMO 码集合（Open-Meteo 官方文档显式列出者）。 */
export const KNOWN_WEATHER_CODES = new Set<number>([
  0, 1, 2, 3, 45, 48,
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86,
  95, 96, 97, 99,
]);

export interface WeatherSnapshot {
  /** 摄氏温度（有限数值） */
  temperatureC: number;
  /** 相对湿度 0–100 */
  humidityPct: number;
  /** WMO 天气码（数值） */
  weatherCode: number;
  /** 该快照 current 时刻的 ISO 字符串（Open-Meteo 返回） */
  observedAt: string;
  /** 本机取得该快照的时间 epoch ms（缓存年龄按此计算） */
  fetchedAt: number;
  /** 数据来源署名 */
  source: 'open-meteo';
}

export interface WeatherLookup {
  status: 'ok' | 'stale' | 'unavailable';
  snapshot?: WeatherSnapshot;
  /** 缓存年龄 ms（status=stale 时必填，供 UI 标示更新时间/离线） */
  ageMs?: number;
  error?: string;
  /** 码不在认可集合或字段无效时为 false：可展示但不得驱动自然事件（R3/R5） */
  usableForEvents?: boolean;
  /** true = 实况不可用，使用内置默认快照（shared/native-defaults）；UI 须标注"内置默认" */
  defaulted?: boolean;
}

export interface WeatherLocation {
  /** 稳定城市 ID（地理编码返回 id 或 "lat,lon"） */
  cityId: string;
  /** 中文显示名（地理编码 name，可带 admin1/country 拼接由 UI 决定） */
  label: string;
  latitude: number;
  longitude: number;
}

export interface CityOption {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

/** R3 缓存/重试默认参数（第 2 节参数表的实现常量） */
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
export const WEATHER_STALE_MAX_MS = 24 * 60 * 60 * 1000;
export const WEATHER_TIMEOUT_MS = 8000;
export const FIRST_LOAD_RETRY_DELAYS_MS = [1000, 3000] as const;
