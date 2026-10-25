/**
 * 原生自然事件纯领域层（R4/R5：权威规则定义，零渲染/零 Electron 依赖）
 *
 * 自然事件只有 INIT（一次性首局事务）与 DAILY（日常推进）两种，同一时刻互斥；
 * 外观回显、手动护理、退出恢复、首批摘要展示都不是自然事件，不计额度。
 * 时钟与随机通过参数注入（now/rand），测试不依赖系统时间。
 */
import {
  DAILY_MAX_ATTEMPTS, DAILY_WEIGHT_CAP_DAYS, DAILY_WEIGHT_NO_BASELINE,
  HUMIDITY_THRESHOLD, INIT_HEAVY_CAP, INIT_HEAVY_MOLD_MUSHROOM_WEIGHTS,
  INIT_INTENSITY_WEIGHTS, INIT_K_CHOICES, KNOWN_WMO_CODES, MOLD_IMMUNITY_MS,
  PRECIPITATION_CODES,
} from '../shared/types/native';
import type {
  DamageFamily, DamageStage, DamageState, InitPlan, InitTargetPlan, MushroomStage,
  NativeObjectState, NativeWeatherSnapshot,
} from '../shared/types/native';

export type Rand = () => number;

/** mulberry32：小而稳定的种子随机（同种子跨重启一致） */
export function createRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends string>(weights: Partial<Record<T, number>>, rand: Rand): T {
  const entries = (Object.entries(weights) as Array<[T, number]>).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) throw new Error('权重全为零，无法抽取');
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}

// ---------- R5 天气 → 损伤族权重（材质倾向，不是物理损坏模型） ----------

export interface FamilyWeights {
  damp: number;
  mold: number;
  char: number;
}

/**
 * R5 权重表（自上而下第一匹配项生效；湿度阈值 70）。
 * moldImmune 为真时霉变硬排除（不只是降权），剩余正权重不再自动归一——
 * 抽取函数按相对权重工作，免疫等于把霉变从候选中删除。
 */
export function familyWeights(snapshot: NativeWeatherSnapshot, moldImmune = false): FamilyWeights | null {
  if (!KNOWN_WMO_CODES.has(snapshot.weatherCode)) return null; // 未知码 → 不生成新自然事件
  const rh = snapshot.humidityPct;
  let weights: FamilyWeights;
  if (PRECIPITATION_CODES.has(snapshot.weatherCode)) {
    weights = rh >= HUMIDITY_THRESHOLD ? { damp: 85, mold: 15, char: 0 } : { damp: 100, mold: 0, char: 0 };
  } else if (snapshot.weatherCode === 45 || snapshot.weatherCode === 48) {
    weights = rh >= HUMIDITY_THRESHOLD ? { damp: 60, mold: 40, char: 0 } : { damp: 100, mold: 0, char: 0 };
  } else if (rh >= HUMIDITY_THRESHOLD) {
    weights = { damp: 40, mold: 60, char: 0 };
  } else if (snapshot.weatherCode <= 1 || snapshot.temperatureC >= 30) {
    weights = { damp: 30, mold: 0, char: 70 };
  } else {
    weights = { damp: 90, mold: 0, char: 10 };
  }
  if (moldImmune) weights = { ...weights, mold: 0 };
  return weights;
}

/** 当天可用的损伤族（权重为正的族）。 */
export function availableFamilies(snapshot: NativeWeatherSnapshot, moldImmune = false): DamageFamily[] {
  const weights = familyWeights(snapshot, moldImmune);
  if (!weights) return [];
  return (Object.keys(weights) as DamageFamily[]).filter((f) => weights[f] > 0);
}

// ---------- 损伤推进（R5：每次自然事件只前进一步） ----------

/** 霉变重度后进入幼菇→成熟菇；其他损伤重度为满级，不再空推进。 */
export function advanceDamage(damage: DamageState | null, family: DamageFamily): { damage: DamageState; advanced: boolean } {
  if (!damage || damage.family !== family) {
    // 换族只在已清理或空闲状态发生（R5）；此处由候选过滤保证，干净对象直接进入轻度。
    // 菇实例独立于损伤（R5）：换族不丢已长出的菇。
    return { damage: { family, stage: 1, mushroom: damage?.mushroom ?? 'none' }, advanced: true };
  }
  if (damage.family === 'mold') {
    if (damage.stage < 3) return { damage: { ...damage, stage: (damage.stage + 1) as DamageStage }, advanced: true };
    if (damage.mushroom === 'none') return { damage: { ...damage, mushroom: 'young' }, advanced: true };
    if (damage.mushroom === 'young') return { damage: { ...damage, mushroom: 'mature' }, advanced: true };
    return { damage, advanced: false }; // 成熟菇为终点
  }
  if (damage.stage < 3) return { damage: { ...damage, stage: (damage.stage + 1) as DamageStage }, advanced: true };
  return { damage, advanced: false };
}

// ---------- 免疫（R5："十天"=连续 240 小时） ----------

export function moldImmuneUntilAfterCare(careCompletedAt: number): number {
  return careCompletedAt + MOLD_IMMUNITY_MS;
}

/** 完整清理任一主要损伤都刷新窗口；半清/采菇/练习/打开对象由调用方不传入。 */
export function applyCareImmunity(obj: NativeObjectState, careCompletedAt: number): NativeObjectState {
  return { ...obj, lastCareCompletedAt: careCompletedAt, moldImmuneUntil: moldImmuneUntilAfterCare(careCompletedAt) };
}

// ---------- R4.1 INIT 计划 ----------

/**
 * 生成首批固定事务：K∈{5..10}，N=min(K,候选数)，mtime 旧→新取前 N（同 mtime 按 ID）。
 * 天气快照、随机状态与布局在事务建立时固定并持久化，全生命周期不变。
 */
export function planInit(
  candidates: Array<Pick<NativeObjectState, 'id' | 'realPath' | 'kind' | 'displayName' | 'originalMtime'>>,
  snapshot: NativeWeatherSnapshot,
  seed: number,
  now: number,
): InitPlan {
  const rand = createRand(seed);
  const weights = familyWeights(snapshot, false);
  if (!weights) throw new Error('INIT 只能在有效天气下生成（R4.1）');
  const k = INIT_K_CHOICES[Math.floor(rand() * INIT_K_CHOICES.length)];
  const sorted = [...candidates].sort((a, b) => (a.originalMtime - b.originalMtime) || (a.id < b.id ? -1 : 1));
  const n = Math.min(k, sorted.length);
  const targets: InitTargetPlan[] = [];
  let heavyCount = 0;
  for (let i = 0; i < n; i += 1) {
    const family = pickWeighted<DamageFamily>(weights, rand);
    // 强度：轻/中/重 = 50/35/15，重度最多 2 项；达到上限后只在轻/中重抽（50/35 归一）
    let intensity: 'light' | 'mid' | 'heavy' = pickWeighted<'light' | 'mid' | 'heavy'>(INIT_INTENSITY_WEIGHTS, rand);
    if (intensity === 'heavy' && heavyCount >= INIT_HEAVY_CAP) {
      intensity = pickWeighted<'light' | 'mid'>({ light: INIT_INTENSITY_WEIGHTS.light, mid: INIT_INTENSITY_WEIGHTS.mid }, rand);
    }
    if (intensity === 'heavy') heavyCount += 1;
    const stage: DamageStage = intensity === 'light' ? 1 : intensity === 'mid' ? 2 : 3;
    let mushroom: MushroomStage = 'none';
    if (family === 'mold' && stage === 3) {
      mushroom = pickWeighted<MushroomStage>(INIT_HEAVY_MOLD_MUSHROOM_WEIGHTS, rand);
    }
    targets.push({ id: sorted[i].id, family, stage, mushroom, status: 'pending' });
  }
  return { k, n, seed, targets, snapshot, generatedAt: now };
}

// ---------- R4.2 DAILY 计划 ----------

/** 冷落权重：d=max(0, floor((事件时间−基准)/24h))，w=1+min(d,30)；无有效基准 w=31。 */
export function dailyWeight(obj: NativeObjectState, eventTime: number): number {
  const baseline = Math.max(obj.originalMtime ?? 0, obj.lastAdvanceAt ?? 0, obj.lastCareCompletedAt ?? 0);
  if (baseline <= 0) return DAILY_WEIGHT_NO_BASELINE;
  const d = Math.max(0, Math.floor((eventTime - baseline) / (24 * 60 * 60 * 1000)));
  return 1 + Math.min(d, DAILY_WEIGHT_CAP_DAYS);
}

/** 对象今天是否可推进该族：干净可引入；同族未满级可继续；免疫期霉变硬排除。 */
export function isEligibleForDaily(obj: NativeObjectState, snapshot: NativeWeatherSnapshot, eventTime: number): boolean {
  const moldImmune = (obj.moldImmuneUntil ?? 0) > eventTime;
  const families = availableFamilies(snapshot, moldImmune);
  if (families.length === 0) return false;
  // 完整清理后 stage=0：等同空闲（R5 换族只在已清理或空闲状态发生），
  // 按当日天气重新选族，不被旧损伤族锁死；霉变免疫由 familyWeights 硬排除。
  if (!obj.damage || obj.damage.stage === 0) return true;
  if (!families.includes(obj.damage.family)) return false; // 该族不适配当天候选 → 跳过该对象
  return advanceDamage(obj.damage, obj.damage.family).advanced;
}

/**
 * 当日损伤族选择：未清理对象沿其主族推进；空闲/已清理（stage 0）对象按
 * 当日权重重新选族。种子与对象 ID 派生稳定伪随机，同日多次调用结果一致。
 */
export function pickDailyFamily(
  obj: NativeObjectState,
  snapshot: NativeWeatherSnapshot,
  now: number,
  seed: number,
): DamageFamily {
  if (obj.damage && obj.damage.stage > 0) return obj.damage.family;
  const weights = familyWeights(snapshot, (obj.moldImmuneUntil ?? 0) > now);
  if (!weights) return 'damp'; // planDailyOrder 已按当日天气过滤，防御性兜底
  const entries = (Object.entries(weights) as Array<[DamageFamily, number]>).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < obj.id.length; i += 1) h = Math.imul(h ^ obj.id.charCodeAt(i), 0x85ebca6b) >>> 0;
  let roll = h % total;
  for (const [family, w] of entries) {
    roll -= w;
    if (roll < 0) return family;
  }
  return entries[entries.length - 1][0];
}

/**
 * 生成当日候选顺序（加权不放回抽 3 个，按序尝试，最多一次成功）。
 * 候选先按稳定对象 ID 排序保证可重现，再按 w 加权抽取。
 */
export function planDailyOrder(
  candidates: NativeObjectState[],
  snapshot: NativeWeatherSnapshot,
  eventTime: number,
  seed: number,
): string[] {
  const eligible = candidates
    .filter((obj) => isEligibleForDaily(obj, snapshot, eventTime))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const pool = eligible.map((obj) => ({ id: obj.id, w: dailyWeight(obj, eventTime) }));
  const rand = createRand(seed);
  const order: string[] = [];
  for (let i = 0; i < DAILY_MAX_ATTEMPTS && pool.length > 0; i += 1) {
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
  return order;
}

// ---------- R4.4 单入口多条件唯一分支（按序匹配，不并行） ----------

export type InitStatus = 'not-generated' | 'active' | 'completed';

export interface BranchInput {
  paused: boolean;
  hasValidWeather: boolean;
  initStatus: InitStatus;
  /** 当日唯一记录；null = 无记录 */
  todayRecord: { status: string } | null;
}

export type BranchAction =
  | 'none-paused'      // 1 用户暂停：不生成或续写，不积欠
  | 'wait-weather'     // 2/6 无有效天气：显示等待，本轮有界
  | 'generate-init'    // 3 生成固定事务并执行（N=0 也完成检查并占当天额度）
  | 'continue-init'    // 4 仅继续原事务至完成；不发 DAILY
  | 'daily-terminal'   // 5 当日终态
  | 'daily-resume'     // 7 仅处理同一记录
  | 'daily-create';    // 8 创建当天唯一记录

/** 按优先级 1→8 顺序匹配，返回唯一结果。 */
export function decideNativeBranch(input: BranchInput): BranchAction {
  if (input.paused) return 'none-paused';
  if (input.initStatus === 'not-generated' || input.initStatus === 'active') {
    return input.hasValidWeather
      ? (input.initStatus === 'not-generated' ? 'generate-init' : 'continue-init')
      : 'wait-weather';
  }
  // INIT 已完成
  if (!input.hasValidWeather) return 'wait-weather';
  const status = input.todayRecord?.status;
  if (status === 'success' || status === 'empty' || status === 'init_occupied') return 'daily-terminal';
  if (status === 'pending' || status === 'retryable') return 'daily-resume';
  return 'daily-create';
}

// ---------- 本地自然日（R4.2/R4.3：按系统本地日期，仅用于去重） ----------

export function localDateKey(now: number): string {
  const date = new Date(now);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
