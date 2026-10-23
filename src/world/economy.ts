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

/** 复用普通采摘现有临时计价；剪落物在采摘时记录相同品相，不另定价格。 */
export function harvestPrice(item: InventoryItem, humidity: number): number {
  if (!Number.isFinite(item.growth) || item.growth <= 0 || item.growth > 1 ||
      !Number.isFinite(humidity) || humidity < 0 || humidity > 1) {
    throw new RangeError('Invalid harvest growth or humidity');
  }
  return Math.max(1, Math.round((SPECIES[item.species]?.price ?? 0) * (0.25 + 0.75 * humidity) * Math.max(.1, item.growth)));
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
