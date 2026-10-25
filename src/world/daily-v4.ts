/**
 * v4 日账本结算引擎（R4.2 v0.2；Task 5 纯领域规则，Windows 调度接线由员工 2 完成）
 *
 * 与 v3 的差异：一日一条记录内含至多 limit 个槽位（普通 3 / 警报 5），
 * 自然推进、相邻蔓延、玩家播种共用同一额度；每对象每天至多一步；
 * 每个自然槽位最多尝试 SLOT_MAX_ATTEMPTS 个不同候选。
 *
 * 确定性：候选顺序与品种都由持久化的 record.seed 派生（per-slot 种子 =
 * hash(record.seed:objectId)），重试、重启、天气刷新不重抽；旧 INIT 未完成
 * 时不结算 DAILY（分支表在员工 2 的编排层，本模块防御性再挡一次）。
 */
import { ALERT_DAILY_SLOT_LIMIT, DAILY_SLOT_LIMIT, SLOT_MAX_ATTEMPTS } from '../shared/types/gameplay';
import type {
  DailyEventRecordV4, DailySlot, NewSpeciesId, ObjectCategory, PlantedSpore,
} from '../shared/types/gameplay';
import type { DamageFamily, DamageStage, NativeObjectState, NativeWeatherSnapshot } from '../shared/types/native';
import { advanceDamage, isEligibleForDaily, localDateKey, pickDailyFamily, dailyWeight, createRand } from './native-events';
import { isSporeBearing } from './spores';
import { rollSpecies } from '../shared/species/species-roll';
import { hashString } from '../shared/rand';

export { DAILY_SLOT_LIMIT, ALERT_DAILY_SLOT_LIMIT };

/** 当日额度：警报期间 5，普通日 3（记录建立时固定，天气刷新不改）。 */
export function dailyLimitFor(alert: boolean): number {
  return alert ? ALERT_DAILY_SLOT_LIMIT : DAILY_SLOT_LIMIT;
}

/** 已占用槽位（跳过的不算，pending 播种算——UI 显示口径，契约审阅结论 2）。 */
export function dailyUsedOf(record: DailyEventRecordV4 | null): number {
  if (!record) return 0;
  return record.slots.filter((s) => s.status !== 'skipped').length;
}

export function isDailyTerminal(record: DailyEventRecordV4): boolean {
  return record.status === 'success' || record.status === 'empty' || record.status === 'init_occupied';
}

/** 记录是否还能增加槽位（额度未满且当日仍非终态）。 */
export function hasDailyCapacity(record: DailyEventRecordV4 | null): boolean {
  if (!record) return false;
  if (isDailyTerminal(record)) return false;
  return record.slots.length < record.limit;
}

/** 创建当日唯一记录（空槽位；额度与警报标记建立时固定）。 */
export function createDailyRecordV4(input: {
  date: string;
  seed: number;
  alert: boolean;
  weather: NativeWeatherSnapshot;
}): DailyEventRecordV4 {
  return {
    date: input.date,
    id: `${input.date}-${input.seed.toString(36)}`,
    status: 'pending',
    seed: input.seed,
    limit: dailyLimitFor(input.alert),
    alert: input.alert,
    candidateOrder: [],
    attempts: [],
    slots: [],
    snapshot: input.weather,
  };
}

// ---------- 候选规划 ----------

/**
 * 规划自然槽位的候选顺序：额度内每个自然槽位 SLOT_MAX_ATTEMPTS 个候选，
 * 每槽在合格池内不放回抽取、跨槽独立（对象被上一槽跳过后仍可服务下一槽）。
 * 幂等：已有顺序不重算。
 */
export function planDailyCandidateOrder(
  record: DailyEventRecordV4,
  objects: Record<string, NativeObjectState>,
  weather: NativeWeatherSnapshot,
  eventTime: number,
): string[] {
  if (record.candidateOrder.length > 0) return record.candidateOrder;
  const plantedCount = record.slots.filter((s) => s.source === 'planted').length;
  const naturalSlots = Math.max(0, record.limit - plantedCount);
  const eligible = Object.values(objects)
    .filter((obj) => isEligibleForDaily(obj, weather, eventTime))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((obj) => ({ id: obj.id, w: dailyWeight(obj, eventTime) }));
  const rand = createRand(record.seed);
  const order: string[] = [];
  for (let slot = 0; slot < naturalSlots; slot += 1) {
    const pool = eligible.slice();
    for (let attempt = 0; attempt < SLOT_MAX_ATTEMPTS && pool.length > 0; attempt += 1) {
      const total = pool.reduce((sum, c) => sum + c.w, 0);
      let roll = rand() * total;
      let index = pool.length - 1;
      for (let j = 0; j < pool.length; j += 1) {
        roll -= pool[j].w;
        if (roll < 0) { index = j; break; }
      }
      order.push(pool[index].id);
      pool.splice(index, 1);
    }
  }
  // 持久化到记录：天气刷新/重启后沿用同一队列，不重抽
  record.candidateOrder = order;
  return order;
}

// ---------- 播种槽吸收 ----------

/**
 * 把待结算的播种吸收为当日槽位（"当日剩余槽位优先，否则顺延次日"）：
 * 每次结算开始时调用；容量不足的播种保持 pending，次日再吸收。
 * 幂等：同一播种（objectId + eventId）只吸收一次。
 */
export function absorbPlantedSlots(
  record: DailyEventRecordV4,
  planted: Record<string, PlantedSpore>,
  objects: Record<string, NativeObjectState>,
): void {
  const pending = Object.values(planted)
    .filter((p) => p.status === 'pending' && (!p.eventId || p.eventId === record.id))
    .sort((a, b) => a.plantedAt - b.plantedAt);
  for (const spore of pending) {
    if (record.slots.length >= record.limit) return;
    if (record.slots.some((s) => s.source === 'planted' && s.objectId === spore.objectId)) continue;
    const obj = objects[spore.objectId];
    record.slots.push({
      objectId: spore.objectId,
      source: 'planted',
      family: obj?.damage?.family ?? 'mold',
      fromStage: obj?.damage?.stage ?? 0,
      toStage: obj?.damage?.stage ?? 0,
      mushroom: 'young',
      species: spore.species,
      status: 'pending',
    });
    spore.eventId = record.id;
  }
}

// ---------- 结算 ----------

export interface SettleDeps {
  objects: Record<string, NativeObjectState>;
  categories: Record<string, ObjectCategory>;
  /** 对象当前是否仍存在（删除/移动 → 跳过，不复活） */
  exists(objectId: string): boolean;
  /** 原生写入：返回是否成功；抛错视为失败（生产为图标写入，测试注入） */
  applyIcon(objectId: string, plan: { family: DamageFamily; stage: DamageStage; mushroom: string; species?: NewSpeciesId }): boolean;
  now: number;
  log?(message: string): void;
}

/**
 * 结算当日记录（幂等：已结算槽位与已尝试候选跳过，同日重复调用不重复推进）。
 * 自然槽位在结算时按候选组（每槽 SLOT_MAX_ATTEMPTS 个候选）即时创建；
 * 蔓延槽与播种槽由各自模块预先插入（source='spread'/'planted'），这里统一结算。
 *
 * 状态收束：≥1 成功 → success；无成功但有跳过槽 → empty（保留槽位作回放证据）；
 * 候选全部尝试失败 → retryable（同身份待重试）；完全无候选 → empty。
 * 未跑完（还有未试候选且额度未满）→ 保持 pending，等下次触发续写。
 */
export function settleDailyRecordV4(
  record: DailyEventRecordV4,
  deps: SettleDeps,
): { advanced: number; skipped: number } {
  const log = deps.log ?? (() => {});
  let advanced = 0;
  let skipped = 0;
  if (!record.snapshot) {
    log('记录没有持久化天气快照，不结算（防御）');
    return { advanced: 0, skipped: 0 };
  }
  // 今日已成功的对象：每对象每天至多一步
  const advancedToday = new Set(
    record.slots.filter((s) => s.status === 'success').map((s) => s.objectId),
  );
  // 1) 播种槽 / 蔓延槽结算
  for (const slot of record.slots) {
    if (slot.status !== 'pending') continue;
    if (slot.source === 'natural') continue;
    const obj = deps.objects[slot.objectId];
    if (!obj || !deps.exists(slot.objectId) || advancedToday.has(slot.objectId)) {
      slot.status = 'skipped';
      slot.skipReason = advancedToday.has(slot.objectId) ? '对象今日已推进过一步' : '对象已不存在或移动后身份不明，不复活';
      skipped += 1;
      log(`槽位跳过 ${slot.objectId}: ${slot.skipReason}`);
      continue;
    }
    const ok = slot.source === 'planted'
      ? settlePlantedSlot(slot, obj, deps)
      : settleSpreadSlot(slot, obj, deps);
    if (ok) { advanced += 1; advancedToday.add(slot.objectId); } else { skipped += 1; }
  }
  // 2) 自然槽位按"候选队列 + 游标"结算：
  //    attempts.length 即已消费的候选数（每次尝试恰好记录一次，按序前缀），
  //    每槽最多消费 SLOT_MAX_ATTEMPTS 个候选；续写从游标处继续，天然幂等。
  const plantedCount = record.slots.filter((s) => s.source === 'planted').length;
  const naturalCapacity = Math.max(0, record.limit - plantedCount);
  const naturalCreated = record.slots.filter((s) => s.source === 'natural').length;
  let cursor = Math.min(record.attempts.length, record.candidateOrder.length);
  for (let slotIndex = naturalCreated; slotIndex < naturalCapacity; slotIndex += 1) {
    let tries = 0;
    while (tries < SLOT_MAX_ATTEMPTS && cursor < record.candidateOrder.length) {
      const id = record.candidateOrder[cursor];
      cursor += 1;
      record.attempts.push(id);
      tries += 1;
      const obj = deps.objects[id];
      if (!obj || !deps.exists(id) || advancedToday.has(id)) {
        log(`自然候选不可用，尝试下一个: ${id}`);
        continue;
      }
      const family = pickDailyFamily(obj, record.snapshot, deps.now, record.seed);
      const fromStage = obj.damage?.stage ?? 0;
      const advancedResult = advanceDamage(obj.damage, family);
      if (!advancedResult.advanced) {
        log(`自然候选满级，尝试下一个: ${id}`);
        continue;
      }
      const species = budSpeciesFor(obj, record, deps, advancedResult.damage);
      const ok = deps.applyIcon(id, {
        family,
        stage: advancedResult.damage.stage,
        mushroom: advancedResult.damage.mushroom,
        species,
      });
      if (!ok) {
        log(`自然槽位写入失败: ${id}`);
        continue;
      }
      obj.damage = advancedResult.damage;
      if (species) obj.mushroomSpecies = species;
      obj.lastAdvanceAt = deps.now;
      record.slots.push({
        objectId: id,
        source: 'natural',
        family,
        fromStage,
        toStage: advancedResult.damage.stage,
        mushroom: advancedResult.damage.mushroom,
        species: species ?? undefined,
        status: 'success',
      });
      advanced += 1;
      advancedToday.add(id);
      log(`自然槽位成功 ${id}: ${family} -> ${advancedResult.damage.stage}${species ? ` (${species})` : ''}`);
      break;
    }
  }
  // 3) 状态收束
  const naturalCapacityNow = Math.max(0, record.limit - record.slots.filter((s) => s.source === 'planted').length);
  const naturalCreatedNow = record.slots.filter((s) => s.source === 'natural').length;
  const queueLeft = cursor < record.candidateOrder.length;
  const untriedNaturalLeft = naturalCreatedNow < naturalCapacityNow && queueLeft;
  const anySuccess = record.slots.some((s) => s.status === 'success');
  const pendingSlots = record.slots.filter((s) => s.status === 'pending').length;
  if (record.slots.length === 0 && record.candidateOrder.length === 0) {
    record.status = 'empty';
  } else if (anySuccess && !pendingSlots && !untriedNaturalLeft) {
    record.status = 'success';
  } else if (!anySuccess && !pendingSlots && record.slots.length > 0
    && record.slots.every((s) => s.status === 'skipped') && !untriedNaturalLeft) {
    record.status = 'empty';
  } else if (!anySuccess && record.attempts.length > 0 && !untriedNaturalLeft) {
    // 候选全部尝试失败：占用同一身份，待同日重试或跨日核对关闭
    record.status = 'retryable';
  }
  return { advanced, skipped };
}

function settlePlantedSlot(slot: DailySlot, obj: NativeObjectState, deps: SettleDeps): boolean {
  if (obj.damage && obj.damage.mushroom !== 'none') {
    slot.status = 'skipped';
    slot.skipReason = '对象已有蘑菇实例';
    deps.log?.(`播种槽跳过 ${slot.objectId}: 已有蘑菇`);
    return false;
  }
  const ok = deps.applyIcon(slot.objectId, {
    family: slot.family,
    stage: slot.fromStage,
    mushroom: 'young',
    species: slot.species !== undefined && isSporeBearing(slot.species) ? slot.species : undefined,
  });
  if (!ok) {
    deps.log?.(`播种槽写入失败: ${slot.objectId}`);
    return false;
  }
  if (obj.damage) obj.damage = { ...obj.damage, mushroom: 'young' };
  else obj.damage = { family: slot.family, stage: 0, mushroom: 'young' };
  obj.mushroomSpecies = slot.species;
  obj.lastAdvanceAt = deps.now;
  slot.status = 'success';
  deps.log?.(`播种槽成功 ${slot.objectId}: ${slot.species} 幼菇`);
  return true;
}

/** 蔓延槽：重度霉变邻对象把霉传给干净的相邻对象（R5.2）；由蔓延模块插槽，这里结算。 */
function settleSpreadSlot(slot: DailySlot, obj: NativeObjectState, deps: SettleDeps): boolean {
  if (obj.damage && obj.damage.stage > 0) {
    slot.status = 'skipped';
    slot.skipReason = '对象已有损伤，不叠加蔓延';
    deps.log?.(`蔓延槽跳过 ${slot.objectId}: 非干净对象`);
    return false;
  }
  const ok = deps.applyIcon(slot.objectId, { family: 'mold', stage: 1, mushroom: 'none' });
  if (!ok) {
    deps.log?.(`蔓延槽写入失败: ${slot.objectId}`);
    return false;
  }
  obj.damage = { family: 'mold', stage: 1, mushroom: 'none' };
  obj.lastAdvanceAt = deps.now;
  slot.status = 'success';
  deps.log?.(`蔓延槽成功 ${slot.objectId}: 来自 ${slot.fromObjectId ?? '?'}`);
  return true;
}

/** 幼菇出现时确定品种（R5.1）：播种槽用播种品种；自然槽由 record.seed 派生。 */
function budSpeciesFor(
  obj: NativeObjectState,
  record: DailyEventRecordV4,
  deps: SettleDeps,
  damage: { mushroom: string },
): NewSpeciesId | undefined {
  if (damage.mushroom !== 'young') return undefined;
  if (obj.mushroomSpecies) return undefined; // 已有品种（采后再生的老实例沿用）
  const category = deps.categories[obj.id] ?? 'other';
  const seed = hashString(`${record.seed}:${obj.id}`) >>> 0;
  const hour = new Date(deps.now).getHours();
  return rollSpecies({
    category,
    weatherCode: record.snapshot?.weatherCode ?? 0,
    humidity: record.snapshot?.humidityPct ?? 0,
    temperatureC: record.snapshot?.temperatureC ?? 0,
    localHour: hour,
    seed,
    alertActive: record.alert,
  }) ?? undefined;
}

// ---------- 记账核对（跨午夜；与 v3 closeStaleRecords 同语义） ----------

/** 关闭跨日旧 pending/retryable 记录：有写入证据 → success；否则删除，不补债。 */
export function closeStaleRecordsV4(
  dailyEvents: Record<string, DailyEventRecordV4>,
  objects: Record<string, NativeObjectState>,
  today?: string,
  log?: (m: string) => void,
): void {
  const todayKey = today ?? localDateKey(Date.now());
  for (const [date, record] of Object.entries(dailyEvents)) {
    if (date >= todayKey) continue;
    if (record.status !== 'pending' && record.status !== 'retryable') continue;
    const evidenced = record.slots.some((slot) => {
      const obj = objects[slot.objectId];
      return slot.status === 'success'
        || (obj && obj.damage !== null && obj.lastAdvanceAt !== undefined && obj.lastAdvanceAt >= parseLocalDate(date));
    });
    if (evidenced) {
      record.status = 'success';
      log?.(`旧记录 ${date} 核对为已写入，关闭为 success`);
    } else {
      delete dailyEvents[date];
      log?.(`旧记录 ${date} 确定未写入，关闭不补债`);
    }
  }
}

function parseLocalDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// ---------- 供员工 2 的调度器复用的当日族群选择 ----------

/** 结算自然槽位时的损伤族：未清理对象沿主族；空闲对象按当日天气权重选族。 */
export function pickSlotFamily(
  obj: NativeObjectState,
  weather: NativeWeatherSnapshot,
  now: number,
  seed: number,
): DamageFamily {
  return pickDailyFamily(obj, weather, now, seed);
}
