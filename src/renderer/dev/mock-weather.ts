/**
 * 模拟天气（Task 2；仅开发环境）
 *
 * 预设快照 + 日期推进；离线默认快照明确标 defaulted（R3），
 * 快照结构与 NativeWeatherSnapshot 一致；每日种子由日期派生（可重复）。
 */
import type { NativeWeatherSnapshot } from '../../shared/types/native';
import { localDateKey } from '../../world/native-events';

export interface WeatherPreset {
  key: string;
  label: string;
  snapshot: Omit<NativeWeatherSnapshot, 'observedAt' | 'fetchedAt'>;
  defaulted?: boolean;
}

const HOUR = 3600 * 1000;

export const WEATHER_PRESETS: WeatherPreset[] = [
  { key: 'default', label: '内置默认（离线）', snapshot: { weatherCode: 3, humidityPct: 78, temperatureC: 19 }, defaulted: true },
  { key: 'sunny', label: '晴 · 低湿', snapshot: { weatherCode: 0, humidityPct: 42, temperatureC: 31 } },
  { key: 'rain', label: '降雨 · 高湿', snapshot: { weatherCode: 63, humidityPct: 92, temperatureC: 17 } },
  { key: 'fog', label: '雾 · 高湿', snapshot: { weatherCode: 45, humidityPct: 88, temperatureC: 15 } },
  { key: 'humid', label: '阴 · 回南潮气', snapshot: { weatherCode: 3, humidityPct: 86, temperatureC: 22 } },
  { key: 'dry-heat', label: '晴 · 干热（焦化）', snapshot: { weatherCode: 1, humidityPct: 35, temperatureC: 34 } },
];

export class MockWeather {
  private presetIndex = 0;
  private fetchedAt = Date.now();

  get current(): WeatherPreset {
    return WEATHER_PRESETS[this.presetIndex];
  }

  list(): WeatherPreset[] {
    return WEATHER_PRESETS;
  }

  select(key: string): WeatherPreset {
    const index = WEATHER_PRESETS.findIndex((p) => p.key === key);
    if (index >= 0) this.presetIndex = index;
    this.fetchedAt = Date.now();
    return this.current;
  }

  /** 当前快照（observedAt 为本小时整点；默认天气标 defaulted）。 */
  snapshot(now: number): NativeWeatherSnapshot {
    const preset = this.current;
    const observed = new Date(Math.floor(now / HOUR) * HOUR).toISOString();
    return { ...preset.snapshot, observedAt: observed, fetchedAt: this.fetchedAt };
  }

  isDefaulted(): boolean {
    return this.current.defaulted === true;
  }

  /** 日期派生种子（同日同种子，可重复）。 */
  static seedForDate(date: string): number {
    let h = 2166136261;
    for (let i = 0; i < date.length; i += 1) {
      h ^= date.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  static dateKey(now: number): string {
    return localDateKey(now);
  }
}
