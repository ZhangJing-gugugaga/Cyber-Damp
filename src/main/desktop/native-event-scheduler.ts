/**
 * 原生自然事件编排器（R4 权威实现的 main 进程承载；Goal v9 阶段2 切片2）
 *
 * 单入口多条件：R4.4 的 decideNativeBranch 决定唯一动作；本模块负责把动作
 * 落到真实桌面候选、图标引擎（icon-mutate）与存档（save.native）上：
 * - INIT：生成固定事务 → 逐目标合成状态图标并写入引用 → 全结算后完成并占当日额度；
 * - DAILY：每日唯一记录 → 候选顺序内有限尝试 → 成功推进一级并回写图标；
 * - 回显（非自然事件）：启动时把存档外观重新写到原生图标（崩溃/退出恢复后）；
 * - 退出恢复由 main/index before-quit 调 restoreAllIconReferences() 承接。
 * 所有写入先落恢复登记（R1），所有结算经存档持久化（R4 写前落盘）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadSave, writeSave } from '../save/save-store';
import { applyIconMutation, restoreAllIconReferences, restoreIconReferences, type IconMutationKind } from './icon-mutate';
import { findEntry } from './icon-restore-store';
import { writeIcoCache } from '../icon/ico-builder';
import { composeStateIconPng } from '../icon/state-icon';
import { getWeather } from '../weather/weather-service';
import {
  advanceDamage, decideNativeBranch, familyWeights, localDateKey, planDailyOrder, planInit,
} from '../../world/native-events';
import { runNativeCycle, type SchedulerState } from './native-scheduler';
import type {
  DailyEventRecord, DamageFamily, DamageState, InitPlan,
} from '../../shared/types/native';
import type { NativeObjectSave, NativeSaveSection, SaveData } from '../../shared/types/save';

export interface CycleCandidate {
  /** 稳定对象 ID（d-<usageId>） */
  id: string;
  realPath: string;
  kind: 'dir' | 'lnk';
  displayName: string;
  /** 扫描所得 mtime（本模块只在首次出现时记录，之后不覆盖——写图标会改 mtime） */
  originalMtime: number;
  /** 原图 PNG data URL（扫描同步提取，R7 合成输入） */
  iconDataUrl: string;
}

export interface CycleResult {
  branch: string;
  initChanged: number;
  initSkipped: number;
  dailyAdvanced: boolean;
  detail: string;
}

/** 事件/事务种子：创建时随机一次并持久化（重放确定性由纯领域层保证） */
/** 由天气快照稳定选择菇品种（确定性映射；不外扩玩法）。 */
function speciesForWeather(snapshot: NativeSaveSection['lastSnapshot']): string {
  const species = ['oyster', 'enoki', 'shy', 'bolete', 'lava'];
  if (!snapshot) return 'oyster';
  return species[Math.abs(snapshot.weatherCode * 7 + Math.round(snapshot.temperatureC)) % species.length];
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function defaultNative(): NativeSaveSection {
  return { init: null, dailyEvents: {}, objects: {}, lastSnapshot: null, location: null, paused: false };
}

function ensureSave(): SaveData {
  const existing = loadSave();
  if (existing) {
    if (!existing.native) {
      // 旧版本升级用户：标记 legacy-initialized，不重发首批/奖励（R4.1）
      existing.native = { ...defaultNative(), init: { status: 'legacy-initialized' } };
    }
    return existing;
  }
  // 尚无存档：编排器建立骨架（渲染层新开局会基于同一存档继续）
  return {
    schemaVersion: 3,
    savedAt: Date.now(),
    player: { coins: 0, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: '', migratedOn: localDateKey(Date.now()) },
    files: [], ropes: [],
    stats: { harvested: 0, earned: 0, playedMs: 0 },
    native: defaultNative(),
  };
}

/** 合并扫描候选进对象注册表；首次出现记录 originalMtime，之后永不覆盖（写图标会改 mtime）。 */
function mergeCandidates(native: NativeSaveSection, candidates: CycleCandidate[]): void {
  for (const c of candidates) {
    const existing = native.objects[c.id];
    if (existing) {
      existing.realPath = c.realPath;
      existing.displayName = c.displayName; // 改名保留游戏状态（R1）
      existing.kind = c.kind;
    } else {
      native.objects[c.id] = {
        id: c.id, realPath: c.realPath, kind: c.kind, displayName: c.displayName,
        originalMtime: c.originalMtime, damage: null,
      };
    }
  }
}

/** 由候选取合成源 PNG（data URL → Buffer）。 */
function sourcePng(candidate: CycleCandidate): Buffer {
  const base64 = candidate.iconDataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

async function applyObjectIcon(candidate: CycleCandidate, damage: DamageState | null, eventId: string): Promise<void> {
  const png = await composeStateIconPng(sourcePng(candidate), damage);
  const iconPath = await writeIcoCache(png, [candidate.realPath, candidate.id,
    damage ? `${damage.family}-${damage.stage}-${damage.mushroom}` : 'clean']);
  const result = applyIconMutation({
    id: candidate.id, realPath: candidate.realPath, kind: candidate.kind as IconMutationKind,
    iconPath, eventId,
  });
  if (!result.ok) throw new Error(result.reason);
}

/** 供护理/采摘处理器复用的外观应用（同一合成与恢复登记管线）。 */
export async function applyAppearance(entry: CycleCandidate, damage: DamageState | null): Promise<void> {
  return applyObjectIcon(entry, damage, 'care');
}

/** 串行化：重复打开/并发触发不产生交叉写入。 */
let cycleTask: Promise<CycleResult> = Promise.resolve({ branch: 'idle', initChanged: 0, initSkipped: 0, dailyAdvanced: false, detail: '' });

export function runNativeEventCycle(
  candidates: CycleCandidate[],
  options: { now?: number; injectSnapshot?: { temperatureC: number; humidityPct: number; weatherCode: number } } = {},
): Promise<CycleResult> {
  const task = cycleTask.catch(() => undefined).then(() => executeCycle(candidates, options));
  cycleTask = task;
  return task;
}

async function executeCycle(
  candidates: CycleCandidate[],
  options: { now?: number; injectSnapshot?: { temperatureC: number; humidityPct: number; weatherCode: number } },
): Promise<CycleResult> {
  const now = options.now ?? Date.now();
  const save = ensureSave();
  const native = save.native!;
  mergeCandidates(native, candidates);
  save.savedAt = now;

  // 天气（R3）：注入快照优先（测试），否则按所选城市取数
  let snapshot = null as NativeSaveSection['lastSnapshot'];
  let usableForEvents = false;
  if (options.injectSnapshot) {
    snapshot = { ...options.injectSnapshot, observedAt: new Date(now).toISOString(), fetchedAt: now };
    usableForEvents = true;
  } else if (native.location) {
    const lookup = await getWeather({ cityId: native.location.cityId, label: native.location.label, latitude: native.location.latitude, longitude: native.location.longitude });
    if (lookup.snapshot) {
      snapshot = {
        temperatureC: lookup.snapshot.temperatureC, humidityPct: lookup.snapshot.humidityPct,
        weatherCode: lookup.snapshot.weatherCode, observedAt: lookup.snapshot.observedAt, fetchedAt: lookup.snapshot.fetchedAt,
      };
      native.lastSnapshot = snapshot;
      usableForEvents = lookup.usableForEvents === true;
    }
  }

  const today = localDateKey(now);
  const todayRecord = native.dailyEvents[today] ?? null;
  const initStatus = native.init === null ? 'not-generated'
    : native.init.status === 'legacy-initialized' ? 'completed'
    : native.init.status;
  const paused = native.paused === true || native.restored === true;
  const branch = decideNativeBranch({
    paused,
    hasValidWeather: usableForEvents && snapshot !== null,
    initStatus,
    todayRecord: todayRecord ? { status: todayRecord.status } : null,
  });

  // 预热：按纯核心的确定性预测，物化本轮需要的 ICO（异步阶段），核心回调只做同步引用写入
  const seeds = [newSeed(), newSeed(), newSeed(), newSeed()];
  const iconPaths = new Map<string, string>();
  const warm = async (candidate: CycleCandidate | undefined, damage: DamageState | null): Promise<void> => {
    if (!candidate) return;
    const png = await composeStateIconPng(sourcePng(candidate), damage);
    const iconPath = await writeIcoCache(png, [candidate.realPath, candidate.id,
      damage ? `${damage.family}-${damage.stage}-${damage.mushroom}` : 'clean']);
    iconPaths.set(`${candidate.id}|${damage ? `${damage.family}-${damage.stage}-${damage.mushroom}` : 'clean'}`, iconPath);
  };
  try {
    if (branch === 'generate-init' && snapshot) {
      const plan = planInit(candidates, snapshot, seeds[0], now);
      for (const target of plan.targets) {
        const candidate = candidates.find((c) => c.id === target.id);
        await warm(candidate, { family: target.family, stage: target.stage, mushroom: target.mushroom });
      }
    } else if (branch === 'continue-init' && native.init && 'targets' in native.init) {
      for (const target of native.init.targets) {
        if (target.status !== 'pending') continue;
        const candidate = candidates.find((c) => c.id === target.id);
        await warm(candidate, { family: target.family, stage: target.stage, mushroom: target.mushroom });
      }
    } else if ((branch === 'daily-create' || branch === 'daily-resume') && snapshot) {
      const recordSeed = branch === 'daily-resume' && todayRecord ? todayRecord.seed : seeds[1];
      const order = planDailyOrder(Object.values(native.objects), snapshot, now, recordSeed);
      for (const id of order.slice(0, 3)) {
        const obj = native.objects[id];
        const candidate = candidates.find((c) => c.id === id);
        if (!obj || !candidate) continue;
        const family = obj.damage ? obj.damage.family : planCleanFamily(obj, snapshot, now, recordSeed);
        const advanced = advanceDamage(obj.damage, family);
        await warm(candidate, advanced.damage);
      }
    }
  } catch (error) {
    console.warn('[native-events] 图标预热失败（回退为逐次写入）:', error);
  }

  // 幼菇品种（R5/R6）：核心不涉品种，落盘前补齐
  for (const obj of Object.values(native.objects)) {
    if (obj.damage?.mushroom === 'young' && !obj.mushroomSpecies) {
      obj.mushroomSpecies = speciesForWeather(snapshot);
    }
  }

  // 纯核心执行（R4.4 唯一入口）；图标写入失败返回 false 由核心记账重试/跳过
  let seedIndex = 0;
  native.paused = paused;
  const core = runNativeCycle({
    state: native as unknown as SchedulerState,
    weather: snapshot,
    weatherUsable: usableForEvents,
    candidates,
    now: () => now,
    nextSeed: () => seeds[seedIndex++ % seeds.length],
    applyIcon: (candidate, plan) => {
      const key = `${candidate.id}|${plan ? `${plan.family}-${plan.stage}-${plan.mushroom}` : 'clean'}`;
      const iconPath = iconPaths.get(key);
      if (!iconPath) {
        console.warn('[native-events] 预热缺失（预测与核心不一致）:', key);
        return false;
      }
      const result = applyIconMutation({
        id: candidate.id, realPath: candidate.realPath, kind: candidate.kind as IconMutationKind,
        iconPath, eventId: 'cycle',
      });
      if (!result.ok) console.warn('[native-events] 图标引用写入失败:', candidate.realPath, result.reason);
      return result.ok;
    },
    exists: (realPath) => { try { return fs.existsSync(realPath); } catch { return false; } },
  });

  writeSave(save);
  return {
    branch: core.action,
    initChanged: core.initDone,
    initSkipped: core.initSkipped,
    dailyAdvanced: core.action === 'daily-create' || core.action === 'daily-resume',
    detail: core.summary,
  };
}

/** 与核心 pickDailyFamily 相同的干净对象族选择（预热预测用）。 */
function planCleanFamily(obj: NativeObjectSave, snapshot: NonNullable<NativeSaveSection['lastSnapshot']>, now: number, seed: number): DamageFamily {
  const weights = familyWeights(snapshot, (obj.moldImmuneUntil ?? 0) > now);
  if (!weights) return 'damp';
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
 * 回显（R4：不是自然事件，不计额度）：启动时把存档外观写到原生图标。
 * 有损伤/菇的对象重新合成写入；干净对象若登记中仍有我们的引用则恢复原值。
 * "恢复桌面并暂停"（restored）下不回显损伤（R8），只清干净对象的遗留引用。
 */
export async function reapplySavedAppearances(candidates: CycleCandidate[]): Promise<{ reapplied: number; restored: number }> {
  const save = loadSave();
  const native = save?.native;
  if (!native || native.init === null) return { reapplied: 0, restored: 0 };
  const restoredMode = native.restored === true;
  let reapplied = 0;
  let restored = 0;
  for (const c of candidates) {
    const obj = native.objects[c.id];
    if (!obj) continue;
    if (obj.damage && !restoredMode) {
      try {
        await applyObjectIcon(c, obj.damage, 'echo');
        reapplied += 1;
      } catch (error) {
        console.warn('[native-events] 回显失败（保留原生状态）:', obj.displayName, error);
      }
    } else if (obj.damage && restoredMode && findEntry(c.realPath)) {
      // 恢复暂停态：清掉我们遗留的引用，保持用户桌面干净
      const [report] = restoreIconReferences({ ids: [c.id] });
      if (report?.outcome === 'restored') restored += 1;
    } else if (!obj.damage && findEntry(c.realPath)) {
      const [report] = restoreIconReferences({ ids: [c.id] });
      if (report?.outcome === 'restored') restored += 1;
    }
  }
  return { reapplied, restored };
}

/** 对外报告：首批/日额度状态摘要（R6 摘要是只读投影）。 */
export function nativeStatusSummary(): {
  paused: boolean; initStatus: string; initProgress: string; today: string; todayStatus: string;
} {
  const save = loadSave();
  const native = save?.native;
  const today = localDateKey(Date.now());
  const record = native?.dailyEvents?.[today];
  const init = native?.init;
  return {
    paused: native?.paused === true,
    initStatus: init ? (typeof init.status === 'string' ? init.status : 'unknown') : 'not-generated',
    initProgress: init && 'targets' in init
      ? `${init.targets.filter((t) => t.status === 'done').length}/${init.n ?? init.targets.length} 成功，${init.targets.filter((t) => t.status === 'skipped').length} 跳过`
      : '',
    today,
    todayStatus: record?.status ?? 'none',
  };
}

export function setNativePaused(paused: boolean): void {
  const save = ensureSave();
  save.native!.paused = paused;
  save.savedAt = Date.now();
  writeSave(save);
}

/** 恢复桌面并暂停（R8）：立即还原全部引用并持久化；继续游戏时由 resume 反向。 */
export function restoreDesktopAndPause(): number {
  const save = ensureSave();
  save.native!.paused = true;
  save.native!.restored = true;
  save.savedAt = Date.now();
  writeSave(save);
  return restoreAllIconReferences().length;
}

/** 继续游戏（R8）：只有显式调用才恢复存档外观并重启日节奏；不追补暂停期间事件。 */
export function resumeFromRestored(): void {
  const save = ensureSave();
  save.native!.restored = false;
  save.native!.paused = false;
  save.savedAt = Date.now();
  writeSave(save);
}

export function setNativeLocation(location: { cityId: string; label: string; latitude: number; longitude: number } | null): void {
  const save = ensureSave();
  save.native!.location = location;
  save.savedAt = Date.now();
  writeSave(save);
}

export function nativeSavePath(): string {
  return path.join('userData', 'save.json');
}
