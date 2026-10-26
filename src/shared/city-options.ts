/**
 * 省 → 可选城市列表（R3 城市选择；纯函数，数据由调用方传入 china-division 的 provinces/cities/areas）。
 *
 * china-division 的"地级"层有 9 个占位条目不是真实地名，直接拿去地理编码必然查不到
 * （0.1.27 实测：Open-Meteo 查"市辖区"返回空，查"重庆"正常）：
 * - 北京/天津/上海/重庆的"市辖区"，重庆的"县"：直辖市本身就是城市 → 合并为一项"重庆市"，按省名查询；
 * - 河南/湖北/海南/新疆的"省（自治区）直辖县级行政区划"：→ 展开为其下的县级市（仙桃市、五指山市…）。
 */
export interface Division { code: string; name: string; provinceCode?: string; cityCode?: string }

export interface CityChoice {
  /** 选项值（行政区划代码） */
  code: string;
  /** 显示与保存的城市名 */
  label: string;
  /** 地理编码查询词 */
  query: string;
}

const MUNICIPALITY_PLACEHOLDER = /^(市辖区|县)$/u;
const DIRECT_COUNTY_PLACEHOLDER = /直辖县级行政区划$/u;

export function isPlaceholderCity(name: string): boolean {
  return MUNICIPALITY_PLACEHOLDER.test(name) || DIRECT_COUNTY_PLACEHOLDER.test(name);
}

/** 省级名称的查询词：去掉"市/省/自治区/特别行政区"等后缀（"重庆市" → "重庆"）。 */
export function provinceQuery(provinceName: string): string {
  return provinceName.replace(/(?:特别行政区|(?:壮族|回族|维吾尔)?自治区|省|市)$/u, '');
}

export function cityChoicesFor(
  province: Division,
  cities: Division[],
  areas: Division[],
): CityChoice[] {
  const out: CityChoice[] = [];
  let municipalityAdded = false;
  for (const city of cities) {
    if (city.provinceCode !== province.code) continue;
    if (MUNICIPALITY_PLACEHOLDER.test(city.name)) {
      if (!municipalityAdded) {
        out.push({ code: province.code, label: province.name, query: provinceQuery(province.name) });
        municipalityAdded = true;
      }
      continue;
    }
    if (DIRECT_COUNTY_PLACEHOLDER.test(city.name)) {
      for (const area of areas) {
        if (area.cityCode !== city.code) continue;
        out.push({ code: area.code, label: area.name, query: area.name });
      }
      continue;
    }
    out.push({ code: city.code, label: city.name, query: city.name });
  }
  return out;
}
