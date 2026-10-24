/**
 * 城市搜索结果合并与重排（纯函数，R3 城市选择可辨识性）。
 *
 * 背景：Open-Meteo 地理编码的中文检索会把大量同名乡镇（如各地"长沙"镇）
 * 排在真正的城市（长沙市，PPLA，人口数百万）之前——短名精确命中乡镇名，
 * 而城市的别名常带"市"后缀。因此搜索必须：
 *  1. 原词查询之外补一次"市"后缀查询（suggestSuffixedQuery 决定是否需要）；
 *  2. 两组结果按 id 去重后，按行政级别与人口重排（rankCities），
 *     省会/地级市稳定排在同名乡镇前面。
 */

export interface RankableCity {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  /** GeoNames feature_code：PPLC/ADM1/PPLA/PPLA2/PPL… */
  featureCode?: string;
  population?: number;
}

/** 行政级别优先级：首都 > 一级行政区 > 行政驻地 > 普通居民点。 */
const FEATURE_PRIORITY: Record<string, number> = {
  PPLC: 9,
  ADM1: 8,
  PPLA: 7,
  PPLA2: 6,
  ADM2: 5,
  PPLA3: 5,
  PPLA4: 3,
  ADM3: 3,
  ADM4: 3,
  PPL: 2,
};

function featurePriority(code?: string): number {
  return (code && FEATURE_PRIORITY[code]) || 1;
}

/** 重排：行政级别为主、人口为辅（级别分值放大到人口不可翻转的量级）。 */
export function rankCities<T extends RankableCity>(cities: T[]): T[] {
  return [...cities].sort((a, b) => {
    const pa = featurePriority(a.featureCode);
    const pb = featurePriority(b.featureCode);
    if (pa !== pb) return pb - pa;
    return (b.population ?? 0) - (a.population ?? 0);
  });
}

/** 合并多组查询结果：按 id 去重（保留先出现者）、重排、截取前 cap 个。 */
export function mergeCityResults<T extends RankableCity>(groups: T[][], cap = 10): T[] {
  const byId = new Map<string, T>();
  for (const group of groups) {
    for (const city of group) {
      if (!byId.has(city.id)) byId.set(city.id, city);
    }
  }
  return rankCities([...byId.values()]).slice(0, cap);
}

/** 是否应为该查询补"市"后缀查询：已是行政区划后缀的不再补。 */
export function suggestSuffixedQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/(?:市|县|区|旗|盟|镇|乡|自治州|地区|自治县)$/.test(trimmed)) return null;
  return `${trimmed}市`;
}
