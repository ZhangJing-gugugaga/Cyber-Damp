/**
 * 原生护理/采摘/收藏/小铺 纯领域层（R6；Goal v9 阶段3）
 * 零渲染/零 Electron 依赖；时钟注入。经济数值按 Goal 第 2 节参数表：
 * 普通蘑菇每朵 4 币；新手奖励 24 币（完成练习或跳过只发一次）；
 * 大海绵 12 币（擦洗范围 +30%）；护理垫 8 币（立即换外观）。
 */
import { MOLD_IMMUNITY_MS } from '../shared/types/native';
import type { NativeCollectionEntry, NativeObjectSave, NativeSaveSection } from '../shared/types/save';

export const HARVEST_COINS = 4;
export const ONBOARDING_COINS = 24;
export const BIG_SPONGE_PRICE = 12;
export const CARE_MAT_PRICE = 8;
export const BIG_SPONGE_ID = 'big-sponge';
export const CARE_MAT_ID = 'care-mat';

export interface CareCompleteResult {
  ok: boolean;
  error?: string;
  /** 图标需要重写为"干净+菇"外观 */
  iconReset: boolean;
  immunityUntil?: number;
}

/**
 * 完整清理任一主要损伤 → 十天免疫（240h）+ 损伤清零；
 * 菇保留（清洗不自动采菇，R5）；快速处理同路径（不自动采菇）。
 * 半清（careProgress < 1）不调用本函数——由渲染层在收尾阈值时调用。
 */
export function completeCare(state: NativeSaveSection, objectId: string, now: number): CareCompleteResult {
  const obj = state.objects[objectId];
  if (!obj) return { ok: false, error: '对象不存在', iconReset: false };
  if (!obj.damage || obj.damage.stage === 0) {
    return { ok: false, error: '该对象已经干净了', iconReset: false };
  }
  const cleaned: NativeObjectSave = {
    ...obj,
    damage: { family: obj.damage.family, stage: 0, mushroom: obj.damage.mushroom },
    careProgress: 0,
    lastCareCompletedAt: now,
    moldImmuneUntil: now + MOLD_IMMUNITY_MS,
  };
  state.objects[objectId] = cleaned;
  return { ok: true, iconReset: true, immunityUntil: cleaned.moldImmuneUntil };
}

export interface HarvestResult {
  ok: boolean;
  error?: string;
  coins?: number;
  species?: string;
  sourceName?: string;
  iconReset: boolean;
}

/**
 * 采摘成熟菇：只移除对应唯一 ID 的成熟菇并结算一次；不改损伤/护理进度（R5）。
 * 重复输入不重复结算——菇移除后再次采摘返回失败。
 */
export function harvestMushroom(
  state: NativeSaveSection,
  objectId: string,
  now: number,
  randomSpecies: string,
): HarvestResult {
  const obj = state.objects[objectId];
  if (!obj) return { ok: false, error: '对象不存在', iconReset: false };
  if (!obj.damage || obj.damage.mushroom !== 'mature') {
    return { ok: false, error: '没有可采摘的成熟菇', iconReset: false };
  }
  const species = obj.mushroomSpecies ?? randomSpecies;
  obj.damage = { ...obj.damage, mushroom: 'none' };
  obj.mushroomSpecies = undefined;
  state.collection = state.collection ?? {};
  const existing = state.collection[species];
  const entry: NativeCollectionEntry = existing
    ? { ...existing, sourceName: obj.displayName }
    : { species, firstSeenAt: now, sourceName: obj.displayName };
  state.collection[species] = entry;
  return { ok: true, coins: HARVEST_COINS, species, sourceName: obj.displayName, iconReset: true };
}

export interface OnboardingResult {
  coins: number;
  alreadyDone: boolean;
}

/** 完成练习或跳过引导：同一次存档操作记录完成并加 24 币；重开/重练不重发（R6）。 */
export function grantOnboarding(state: NativeSaveSection, currentCoins: number): OnboardingResult {
  if (state.onboarded) return { coins: currentCoins, alreadyDone: true };
  state.onboarded = true;
  return { coins: currentCoins + ONBOARDING_COINS, alreadyDone: false };
}

export interface BuyResult {
  ok: boolean;
  error?: string;
  coins?: number;
  owned?: string[];
}

const NATIVE_ITEM_PRICES: Record<string, number> = {
  [BIG_SPONGE_ID]: BIG_SPONGE_PRICE,
  [CARE_MAT_ID]: CARE_MAT_PRICE,
};

/** 购买扣币/持有作为一次原子操作（不能重复扣款；已拥有拒绝）。 */
export function buyNativeItem(state: NativeSaveSection, coins: number, owned: string[], itemId: string): BuyResult {
  const price = NATIVE_ITEM_PRICES[itemId];
  if (price === undefined) return { ok: false, error: '未知物品' };
  if (owned.includes(itemId)) return { ok: false, error: '已拥有该物品' };
  if (coins < price) return { ok: false, error: '菇币不足' };
  return { ok: true, coins: coins - price, owned: [...owned, itemId] };
}

/** 大海绵使擦洗范围增大约 30%（R6）。 */
export function scrubRadiusMultiplier(owned: string[]): number {
  return owned.includes(BIG_SPONGE_ID) ? 1.3 : 1;
}
