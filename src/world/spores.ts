/**
 * 孢子、播种与剪刀采摘（R5.1/R6 v0.2；Task 9 纯领域逻辑）
 *
 * 规则（参数表 + 计划书 Task 9）：
 * - 剪刀采摘 cutQuality ≥ 0.6 时按存档种子 50% 掉落同品种孢子 1 枚；
 * - 采摘只移除成熟菇实例并结算一次，不清理损伤、不动护理进度；
 * - 播种不立即生成蘑菇，占用自然事件额度（当日剩余槽位优先，否则顺延次日）；
 * - 孢子按品种记录，只记新品种（旧品种不掉孢子）；
 * - 失败播种不扣孢子；取消只退 pending 播种；
 * - 随机只由存档种子 + 对象 ID 决定，重复点击不能刷孢子（重复采摘先失败）。
 */
import { isSpeciesId, type DailyEventRecordV4, type NewSpeciesId, type PlantedSpore, type SpeciesId, type SporeInventory } from '../shared/types/gameplay';
import { NEW_SPECIES_IDS } from '../shared/types/gameplay';
import type { NativeCollectionEntry, NativeObjectSave } from '../shared/types/save';
import { hashString, createRand } from '../shared/rand';
import { GLOSS_DURATION_MS } from '../shared/care-layers';

export const SPORE_DROP_CUT_QUALITY = 0.6;
export const SPORE_DROP_CHANCE = 0.5;
export const FINE_CARE_BONUS_COINS = 2;

function isMatureMushroom(obj: NativeObjectSave): boolean {
  return obj.damage?.mushroom === 'mature';
}

// ---------- 采摘 ----------

export interface HarvestV2DomainResult {
  ok: boolean;
  message?: string;
  coins?: number;
  species?: SpeciesId;
  /** 掉落的孢子品种（未掉落/旧品种时无此字段） */
  spore?: NewSpeciesId;
}

/**
 * 剪刀采摘成熟菇（一次结算）：
 * coins = 4（参数表）；cutQuality 夹取 0..1；≥0.6 时按 seed 50% 掉 1 枚同品种孢子。
 * 重复采摘（菇已移除）返回失败，不重复结算。
 */
export function harvestV2(
  state: { objects: Record<string, NativeObjectSave>; collection?: Record<string, NativeCollectionEntry>; spores?: SporeInventory },
  objectId: string,
  cutQuality: number,
  now: number,
  seed: number,
): HarvestV2DomainResult {
  const obj = state.objects[objectId];
  if (!obj) return { ok: false, message: '对象不存在' };
  if (!isMatureMushroom(obj)) return { ok: false, message: '没有可采摘的成熟菇' };
  const quality = Math.max(0, Math.min(1, cutQuality));
  if (!Number.isFinite(quality)) return { ok: false, message: '非法的剪切质量' };
  const rawSpecies = obj.mushroomSpecies;
  const species = rawSpecies && isSpeciesId(rawSpecies) ? rawSpecies : undefined;
  obj.damage = { ...obj.damage!, mushroom: 'none' };
  obj.mushroomSpecies = undefined; // 幼菇再现时重新判定品种（R5.1）
  state.collection = state.collection ?? {};
  const entry = species ? state.collection[species] : undefined;
  if (species) {
    state.collection[species] = entry
      ? { ...entry, sourceName: obj.displayName }
      : { species, firstSeenAt: now, sourceName: obj.displayName };
  }
  let spore: NewSpeciesId | undefined;
  if (species && isSporeBearing(species) && quality >= SPORE_DROP_CUT_QUALITY) {
    const rand = createRand(hashString(`${seed}:${objectId}:spore`) >>> 0);
    if (rand() < SPORE_DROP_CHANCE) {
      state.spores = state.spores ?? {};
      state.spores[species] = (state.spores[species] ?? 0) + 1;
      spore = species;
    }
  }
  return { ok: true, coins: 4, species: species ?? undefined, spore };
}

/** 只有 13 款新品种掉孢子；旧品种采摘仍给币但不掉孢子。 */
export function isSporeBearing(species: SpeciesId): species is NewSpeciesId {
  return (NEW_SPECIES_IDS as readonly string[]).includes(species);
}

// ---------- 播种 ----------

export interface PlantDeps {
  objects: Record<string, NativeObjectSave>;
  spores: SporeInventory;
  planted: Record<string, PlantedSpore>;
  /** 当日记录；null = 今日无记录（顺延） */
  todayRecord: DailyEventRecordV4 | null;
  now: number;
}

export interface PlantResult {
  ok: boolean;
  message?: string;
  /** true = 当日额度已满或无记录，播种进入 pending 待次日吸收 */
  deferred?: boolean;
}

/**
 * 播种孢子到指定对象：
 * - 孢子不足 / 对象不在 / 已有 pending 播种 → 失败且不扣孢子；
 * - 当日记录非终态且额度未满 → 立即插入 source='planted' 的 pending 槽；
 * - 否则保持 pending（eventId 空），次日结算时由 absorbPlantedSlots 吸收。
 * 扣孢子与记账是同一次状态变更（调用方整体写盘）。
 */
export function plantSpore(deps: PlantDeps, objectId: string, species: NewSpeciesId): PlantResult {
  if (!isSpeciesId(species) || !isSporeBearing(species)) return { ok: false, message: '未知孢子品种' };
  if ((deps.spores[species] ?? 0) < 1) return { ok: false, message: '孢子不足' };
  const obj = deps.objects[objectId];
  if (!obj) return { ok: false, message: '对象不在桌面或不可写' };
  const existing = deps.planted[objectId];
  if (existing && existing.status === 'pending') return { ok: false, message: '该对象已有待生长的播种' };
  const record = deps.todayRecord;
  const canOccupyToday = Boolean(
    record
      && !['success', 'empty', 'init_occupied'].includes(record.status)
      && record.slots.length < record.limit,
  );
  deps.spores[species] = (deps.spores[species] ?? 0) - 1;
  const planted: PlantedSpore = {
    objectId,
    species,
    plantedAt: deps.now,
    status: 'pending',
    ...(canOccupyToday && record ? { eventId: record.id } : {}),
  };
  deps.planted[objectId] = planted;
  if (canOccupyToday && record) {
    record.slots.push({
      objectId,
      source: 'planted',
      family: obj.damage?.family ?? 'mold',
      fromStage: obj.damage?.stage ?? 0,
      toStage: obj.damage?.stage ?? 0,
      mushroom: 'young',
      species,
      status: 'pending',
    });
  }
  return { ok: true, deferred: !canOccupyToday };
}

/** 取消 pending 播种：退 1 枚孢子；已结算/已取消的不能取消。 */
export function cancelPlant(
  deps: Pick<PlantDeps, 'spores' | 'planted'> & { todayRecord?: DailyEventRecordV4 | null },
  objectId: string,
): { ok: boolean; message?: string; refunded?: NewSpeciesId } {
  const planted = deps.planted[objectId];
  if (!planted || planted.status !== 'pending') return { ok: false, message: '没有可取消的播种' };
  delete deps.planted[objectId];
  deps.spores[planted.species] = (deps.spores[planted.species] ?? 0) + 1;
  // 若已插入当日槽位（未结算），一并移除
  const record = deps.todayRecord;
  if (record) {
    const index = record.slots.findIndex(
      (s) => s.objectId === objectId && s.source === 'planted' && s.status === 'pending',
    );
    if (index >= 0) record.slots.splice(index, 1);
  }
  return { ok: true, refunded: planted.species };
}

/** 播种槽结算成功后标记 completed（由 daily-v4 结算引擎的调用方回调）。 */
export function markPlantedCompleted(planted: Record<string, PlantedSpore>, objectId: string): void {
  const plantedEntry = planted[objectId];
  if (plantedEntry && plantedEntry.status === 'pending') plantedEntry.status = 'completed';
}

// ---------- 精细护理结算（R6 参数表；Task 8 的领域侧） ----------

export interface CompleteCareV2Input {
  objectId: string;
  now: number;
  /** 渲染层提交的最终会话（已校验）；层进度已含自动收尾 */
  fineCare: boolean;
}

export interface CompleteCareV2Result {
  ok: boolean;
  message?: string;
  fine?: boolean;
  bonusCoins?: number;
  immunityUntil?: number;
  glossUntil?: number;
}

/**
 * 护理完成结算：损伤清零 + 240h 防霉（任一主要损伤完整清理）；
 * 精细护理额外 +2 菇币与 24h 光泽（glossUntil），只在本函数发一次
 * （重复调用由"对象已干净"拒绝，不重复发奖）。
 */
export function completeCareV2(
  state: {
    objects: Record<string, NativeObjectSave>;
    coins: number;
    fineCareCount?: number;
  },
  input: CompleteCareV2Input,
): CompleteCareV2Result {
  const obj = state.objects[input.objectId];
  if (!obj) return { ok: false, message: '对象不存在' };
  if (!obj.damage || obj.damage.stage === 0) return { ok: false, message: '该对象已经干净了' };
  const glossUntil = input.fineCare ? input.now + GLOSS_DURATION_MS : undefined;
  obj.damage = { family: obj.damage.family, stage: 0, mushroom: obj.damage.mushroom };
  obj.careProgress = 0;
  obj.careMask = undefined;
  obj.careSession = undefined;
  obj.lastCareCompletedAt = input.now;
  obj.moldImmuneUntil = input.now + 240 * 60 * 60 * 1000;
  let bonusCoins = 0;
  if (input.fineCare) {
    bonusCoins = FINE_CARE_BONUS_COINS;
    state.coins += bonusCoins;
    state.fineCareCount = (state.fineCareCount ?? 0) + 1;
    obj.glossUntil = glossUntil;
  }
  return {
    ok: true,
    fine: input.fineCare,
    bonusCoins: bonusCoins || undefined,
    immunityUntil: obj.moldImmuneUntil,
    glossUntil,
  };
}
