/**
 * 今日菌讯（R6 v0.2；Task 11 纯领域逻辑）
 *
 * 由当前天气、湿度、温度、WMO 码、时段、警报状态生成只读摘要；
 * 同一天气输入得到稳定结果；未知天气/默认天气不伪造（defaulted 标记透传）；
 * 菌讯是只读投影，不消耗事件额度、不重抽已落地品种。
 */
import type { CareToolId, DailyForecast, NewSpeciesId } from '../shared/types/gameplay';
import type { NativeWeatherSnapshot } from '../shared/types/native';
import { PRECIPITATION_CODES } from '../shared/types/native';
import { SPECIES_CATALOG } from '../shared/species/species-catalog';
import { speciesWeights } from '../shared/species/species-roll';
import { matchingTools } from '../shared/care-tools';

export interface ForecastInput {
  date: string;
  /** null = 无有效快照 → 返回 null，调用方显示"暂不可用" */
  weather: NativeWeatherSnapshot | null;
  defaulted: boolean;
  alertActive: boolean;
  now: number;
}

const FAMILY_TOOLS: Record<'damp' | 'mold' | 'char', CareToolId[]> = {
  damp: ['squeegee', 'blower', 'cloth'],
  mold: ['sprayer', 'scrubbrush'],
  char: ['sootblock', 'repairroller'],
};

function weatherLabel(code: number): string {
  if (PRECIPITATION_CODES.has(code)) return '降雨中';
  if (code === 45 || code === 48) return '有雾';
  if (code === 0) return '晴';
  if (code === 1 || code === 2) return '多云';
  if (code === 3) return '阴';
  return '天气未知';
}

/** 今日高概率品种（全局口径，category 取 other；按权重取前三）。 */
export function favoredSpeciesToday(input: Omit<ForecastInput, 'date'>): NewSpeciesId[] {
  if (!input.weather) return [];
  const weights = speciesWeights({
    category: 'other',
    weatherCode: input.weather.weatherCode,
    humidity: input.weather.humidityPct,
    temperatureC: input.weather.temperatureC,
    localHour: new Date(input.now).getHours(),
    alertActive: input.alertActive,
  });
  if (!weights) return [];
  return (Object.entries(weights) as Array<[NewSpeciesId, number]>)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([id]) => id);
}

/** 今日推荐工具：按天气最可能的损伤族取对口工具（海绵不占推荐位）。 */
export function recommendedToolsToday(input: Omit<ForecastInput, 'date'>): CareToolId[] {
  if (!input.weather) return [];
  const rh = input.weather.humidityPct;
  const code = input.weather.weatherCode;
  const families: Array<'damp' | 'mold' | 'char'> = [];
  if (PRECIPITATION_CODES.has(code) || rh >= 70 || code === 45 || code === 48) families.push('damp');
  if (rh >= 70 && !PRECIPITATION_CODES.has(code)) families.push('mold');
  if (rh < 70 && (code <= 1 || input.weather.temperatureC >= 30)) families.push('char');
  const tools: CareToolId[] = [];
  for (const family of families) {
    for (const tool of FAMILY_TOOLS[family]) {
      if (!tools.includes(tool) && matchingTools(family).includes(tool)) tools.push(tool);
    }
  }
  return tools.slice(0, 3);
}

/** 生成今日菌讯；无有效快照返回 null（不伪造）。 */
export function buildDailyForecast(input: ForecastInput): DailyForecast | null {
  if (!input.weather) return null;
  const { weather } = input;
  const favored = favoredSpeciesToday(input);
  const tools = recommendedToolsToday(input);
  const lines: string[] = [];
  for (const species of favored.slice(0, 2)) {
    const entry = SPECIES_CATALOG[species];
    if (entry) lines.push(`${entry.nameZh}今天比较活跃。`);
  }
  if (weather.humidityPct >= 70) lines.push('受潮对象较容易出现水膜，记得备好刮水器。');
  if (PRECIPITATION_CODES.has(weather.weatherCode)) lines.push('雨水正落在图标上，水滴风铃菇喜欢这样的日子。');
  if (input.alertActive) lines.push('回南天警报生效中：今日变化最多 5 个对象，墙面潮气更重。');
  const headline = `湿度 ${Math.round(weather.humidityPct)}%，${weatherLabel(weather.weatherCode)}。`;
  return {
    date: input.date,
    observedAt: weather.observedAt,
    defaulted: input.defaulted,
    alertActive: input.alertActive,
    favoredSpecies: favored,
    recommendedTools: tools,
    headline,
    lines,
  };
}
