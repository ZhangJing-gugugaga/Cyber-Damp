/**
 * 菌种定义与生长规则（world 纯领域层）
 * SPEC v1.0：MVP P0 = 平菇 N + 二进制金针菇 R；杂交形态搁置
 */
import type { MushroomSpecies } from '../shared/types/file-runtime';
import type { ExtCategory } from '../shared/types/file-node';

export interface SpeciesDef {
  id: MushroomSpecies;
  name: string;
  /** 稀有度字母（角标用） */
  rarity: 'N' | 'R';
  /** 杂货铺收购价（币） */
  price: number;
  /** 允许生长的大类 */
  allowedCategories: ExtCategory[];
}

export const SPECIES: Record<MushroomSpecies, SpeciesDef> = {
  oyster: {
    id: 'oyster',
    name: '潮湿平菇',
    rarity: 'N',
    price: 5,
    allowedCategories: ['doc-code', 'image-video', 'audio', 'archive'],
  },
  enoki: {
    id: 'enoki',
    name: '二进制金针菇',
    rarity: 'R',
    price: 30,
    allowedCategories: ['doc-code'],
  },
};

/**
 * 按大类抽菌种（rand 0..1）：
 * 代码类有 40% 概率出金针菇，否则平菇；其他大类只有平菇。
 */
export function pickSpecies(category: ExtCategory, rand: number): MushroomSpecies {
  if (category === 'doc-code' && rand < 0.4) return 'enoki';
  return 'oyster';
}
