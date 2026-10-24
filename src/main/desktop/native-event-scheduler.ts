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
import * as path from 'node:path';
import { loadSave, writeSave } from '../save/save-store';
import { applyIconMutation, restoreIconReferences, type IconMutationKind } from './icon-mutate';
import { findEntry } from './icon-restore-store';
import { writeIcoCache } from '../icon/ico-builder';
import { composeStateIconPng } from '../icon/state-icon';
import { getWeather } from '../weather/weather-service';
import {
  advanceDamage, decideNativeBranch, localDateKey, planDailyOrder, planInit,
} from '../../world/native-events';
import type {
  DailyEventRecord, DamageState, InitPlan,
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
function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function defaultNative(): NativeSaveSection {
  return { init: null, dailyEvents: {}, objects: {}, lastSnapshot: null, location: null, paused: false };
}

function ensureSave(): SaveData {
  const existing = loadSave();
  if (existing) {
    if (!existing.native) existing.native = defaultNative();
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

  const result: CycleResult = { branch: 'none-paused', initChanged: 0, initSkipped: 0, dailyAdvanced: false, detail: '' };

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
  const todayRecord: DailyEventRecord | null = native.dailyEvents[today] ?? null;
  const initStatus = native.init?.status === 'legacy-initialized' ? 'completed'
    : native.init === null ? 'not-generated'
    : native.init.status === 'active' ? 'active' : 'completed';

  const branch = decideNativeBranch({
    paused: native.paused === true,
    hasValidWeather: usableForEvents,
    initStatus: initStatus as 'not-generated' | 'active' | 'completed',
    todayRecord: todayRecord ? { status: todayRecord.status } : null,
  });
  result.branch = branch;

  if (branch === 'generate-init') {
    // R4.1：候选=真实 Shell 可见、可写、可恢复（本 Goal 仅 dir/普通 lnk）
    const plan = planInit(candidates, snapshot!, newSeed(), now);
    native.init = { ...plan, status: 'active' };
    result.detail = `首批 K=${plan.k} N=${plan.n}`;
  }

  if (branch === 'generate-init' || branch === 'continue-init') {
    const init = native.init as (InitPlan & { status: 'active' | 'completed' });
    for (const target of init.targets) {
      if (target.status !== 'pending') continue;
      const candidate = candidates.find((c) => c.id === target.id);
      if (!candidate) {
        target.status = 'skipped';
        target.skipReason = '对象已不存在（不复活、不覆盖新同名对象）';
        result.initSkipped += 1;
        continue;
      }
      const attempts = (target.attempts ?? 0) + 1;
      target.attempts = attempts;
      try {
        await applyObjectIcon(candidate, { family: target.family, stage: target.stage, mushroom: target.mushroom }, `init-${init.generatedAt}`);
        target.status = 'done';
        const obj = native.objects[target.id];
        obj.damage = { family: target.family, stage: target.stage, mushroom: target.mushroom };
        obj.lastAdvanceAt = now;
        result.initChanged += 1;
      } catch (error) {
        if (attempts >= 3) {
          target.status = 'skipped';
          target.skipReason = error instanceof Error ? error.message : String(error);
          result.initSkipped += 1;
        }
        // 未达上限：保留 pending，下次启动/重试继续（不阻塞其余对象）
      }
    }
    if (init.targets.every((t) => t.status !== 'pending')) {
      init.status = 'completed';
      init.completedAt = now;
      // R4.1：完成日占用当日唯一普通额度
      if (!native.dailyEvents[today]) {
        native.dailyEvents[today] = {
          date: today, id: `init-${init.generatedAt}`, status: 'init_occupied',
          seed: 0, candidateOrder: [], attempts: [],
        };
      }
      result.detail += `；首批完成（成功${init.targets.filter((t) => t.status === 'done').length} 跳过${init.targets.filter((t) => t.status === 'skipped').length}）`;
    }
  }

  if (branch === 'daily-create') {
    const seed = newSeed();
    const order = planDailyOrder(
      Object.values(native.objects).filter((o) => candidates.some((c) => c.id === o.id)),
      snapshot!, now, seed,
    );
    native.dailyEvents[today] = {
      date: today, id: `daily-${today}-${seed}`, status: order.length === 0 ? 'empty' : 'pending',
      seed, candidateOrder: order, attempts: [], snapshot: snapshot ?? undefined,
    };
  }

  if (branch === 'daily-create' || branch === 'daily-resume') {
    const record = native.dailyEvents[today]!;
    if (record.status === 'pending' || record.status === 'retryable') {
      while (record.attempts.length < Math.min(record.candidateOrder.length, 3)) {
        const nextId = record.candidateOrder.find((id) => !record.attempts.includes(id));
        if (!nextId) break;
        record.attempts.push(nextId);
        const candidate = candidates.find((c) => c.id === nextId);
        const obj = native.objects[nextId];
        if (!candidate || !obj?.damage) continue; // 对象消失或状态缺失 → 尝试下一候选
        const advanced = advanceDamage(obj.damage, obj.damage.family);
        if (!advanced.advanced) continue;
        try {
          await applyObjectIcon(candidate, advanced.damage, record.id);
          obj.damage = advanced.damage;
          obj.lastAdvanceAt = now;
          record.status = 'success';
          record.snapshot = snapshot ?? undefined;
          result.dailyAdvanced = true;
          result.detail += `；日常推进 ${obj.displayName} → ${advanced.damage.family}/${advanced.damage.stage}${advanced.damage.mushroom !== 'none' ? `/${advanced.damage.mushroom}` : ''}`;
          break;
        } catch (error) {
          result.detail += `；写入失败 ${obj.displayName}: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      if (record.status === 'pending') {
        record.status = record.candidateOrder.length === 0 ? 'empty' : 'retryable';
      }
    }
  }

  writeSave(save);
  return result;
}

/**
 * 回显（R4：不是自然事件，不计额度）：启动时把存档外观写到原生图标。
 * 有损伤/菇的对象重新合成写入；干净对象若登记中仍有我们的引用则恢复原值。
 */
export async function reapplySavedAppearances(candidates: CycleCandidate[]): Promise<{ reapplied: number; restored: number }> {
  const save = loadSave();
  const native = save?.native;
  if (!native || native.init === null) return { reapplied: 0, restored: 0 };
  let reapplied = 0;
  let restored = 0;
  for (const c of candidates) {
    const obj = native.objects[c.id];
    if (!obj) continue;
    if (obj.damage) {
      try {
        await applyObjectIcon(c, obj.damage, 'echo');
        reapplied += 1;
      } catch (error) {
        console.warn('[native-events] 回显失败（保留原生状态）:', obj.displayName, error);
      }
    } else if (findEntry(c.realPath)) {
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

export function setNativeLocation(location: { cityId: string; label: string; latitude: number; longitude: number } | null): void {
  const save = ensureSave();
  save.native!.location = location;
  save.savedAt = Date.now();
  writeSave(save);
}

export function nativeSavePath(): string {
  return path.join('userData', 'save.json');
}
