/**
 * 内置默认城市与天气快照（用户裁决：硬编码长沙，保证开箱即用、断网可用）。
 *
 * 数据来源（2026-10-24 实取一次，随后冻结）：
 * - 坐标：Open-Meteo geocoding `长沙市` → id 1815577（28.19874, 112.97087，admin1 湖南）。
 * - 快照：Open-Meteo forecast current → 21.4°C / 67% / WMO 0（晴），observedAt 2026-10-24T16:15。
 * - 省市级联数据：npm `china-division`（MIT，来源 github.com/modood/Administrative-divisions-of-China）。
 * 诚实性：快照仅作"无实况可用"时的兜底，UI 必须标注"内置默认"，不得冒充实况。
 */

export interface DefaultLocation {
  cityId: string;
  label: string;
  admin1: string;
  latitude: number;
  longitude: number;
}

export const DEFAULT_LOCATION: DefaultLocation = {
  cityId: '1815577',
  label: '长沙市',
  admin1: '湖南',
  latitude: 28.19874,
  longitude: 112.97087,
};

/** 内置天气快照（温度/湿度/WMO 码）。observedAt 为取数时刻；fetchedAt 在使用时补当前时钟。 */
export const DEFAULT_WEATHER_SNAPSHOT = {
  temperatureC: 21.4,
  humidityPct: 67,
  weatherCode: 0,
  observedAt: '2026-10-24T16:15',
};
