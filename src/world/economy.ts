/**
 * 经济：售卖蘑菇得币（world 纯领域层）
 * SPEC v1.0 AC-20：按稀有度加币（N=5 / R=30），只收成熟（growth>=1）的
 */
import type { MushroomSpecies } from '../shared/types/file-runtime';
import { SPECIES } from './mushroom-species';

export interface InventoryItem {
  species: MushroomSpecies;
  growth: number;
}

export interface SellResult {
  coins: number;
  remaining: InventoryItem[];
}

/** 售卖库存中全部成熟蘑菇，返回新余额与剩余库存 */
export function sellMushroom(inventory: InventoryItem[], coins: number): SellResult {
  let earned = 0;
  const remaining: InventoryItem[] = [];
  for (const item of inventory) {
    const def = SPECIES[item.species];
    if (item.growth >= 1 && def) {
      earned += def.price;
    } else {
      remaining.push(item);
    }
  }
  return { coins: coins + earned, remaining };
}

/** 采摘单个成熟蘑菇入库存的辅助判定 */
export function canPick(growth: number): boolean {
  return growth >= 1;
}
