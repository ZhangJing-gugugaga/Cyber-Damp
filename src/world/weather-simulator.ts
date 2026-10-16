/**
 * 本地种子天气模拟器（world 纯领域层）
 * ADR-007：零配置零 Key，确定性可回放；PRD 决策二：城市气候档案
 */

export type WeatherCondition = 'rain' | 'storm' | 'sun' | 'cloud' | 'dry';

export interface CityProfile {
  id: string;
  name: string;
  /** 基础湿度 0..1 */
  baseHumidity: number;
}

/** MVP 城市表（PRD/设计对齐：广州/敦煌/吐鲁番/阿塔卡马/伦敦/东京） */
export const CITIES: CityProfile[] = [
  { id: 'guangzhou', name: '广州', baseHumidity: 0.85 },
  { id: 'dunhuang', name: '敦煌', baseHumidity: 0.15 },
  { id: 'turpan', name: '吐鲁番', baseHumidity: 0.1 },
  { id: 'atacama', name: '阿塔卡马', baseHumidity: 0.05 },
  { id: 'london', name: '伦敦', baseHumidity: 0.7 },
  { id: 'tokyo', name: '东京', baseHumidity: 0.75 },
];

/** FNV-1a 字符串哈希（确定性，禁 Math.random） */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface DayWeather {
  tempC: number;
  /** 湿度 0..1 */
  humidity: number;
  condition: WeatherCondition;
}

/**
 * 确定性产出某城市某日天气。
 * @param cityId 城市 id
 * @param dayIndex 距基准日的天数（用日期派生，保证同日同天气）
 */
export function simulateDay(cityId: string, dayIndex: number): DayWeather {
  const city = CITIES.find((c) => c.id === cityId) ?? CITIES[0];
  const seed = hashString(`${cityId}:${dayIndex}`);
  const rand = (seed % 100000) / 100000;

  const humidity = Math.min(0.98, Math.max(0.02, city.baseHumidity + (rand - 0.5) * 0.3));

  let condition: WeatherCondition;
  if (humidity > 0.85 && rand < 0.4) condition = 'storm';
  else if (humidity > 0.7) condition = 'rain';
  else if (humidity < 0.2) condition = 'dry';
  else if (rand > 0.6) condition = 'sun';
  else condition = 'cloud';

  const tempC = Math.round(18 + (1 - humidity) * 14 + (rand - 0.5) * 6);
  return { tempC, humidity, condition };
}

/** 天气状况 → 全局湿度放大系数（架构 §5.5：rainy/storm ×2） */
export function humidityMultiplier(condition: WeatherCondition): number {
  switch (condition) {
    case 'storm': return 2;
    case 'rain': return 2;
    case 'dry': return 0.5;
    default: return 1;
  }
}

/** 是否晴天（挂绳文件免费风干加成） */
export function isSunny(condition: WeatherCondition): boolean {
  return condition === 'sun';
}

/** 日期 → dayIndex（YYYY-MM-DD 字符串，存档 weather.migratedOn 同格式） */
export function dateToDayIndex(date: Date): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return y * 10000 + m * 100 + d;
}
