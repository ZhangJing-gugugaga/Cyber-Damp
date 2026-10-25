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
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadSave, writeSave } from '../save/save-store';
import { applyIconMutation, iconCacheDir, restoreAllIconReferences, restoreIconReferences, type IconMutationKind } from './icon-mutate';
import { findEntry, type IconRestoreEntry } from './icon-restore-store';
import { decodeIni, parseIconResource } from './desktop-ini';
import { queryShellIcons } from './shell-icons';
import { writeIcoCache } from '../icon/ico-builder';
import { composeStateIconPng } from '../icon/state-icon';
import { getWeather } from '../weather/weather-service';
import { DEFAULT_LOCATION } from '../../shared/native-defaults';
import {
  advanceDamage, decideNativeBranch, localDateKey, pickDailyFamily, planDailyOrder, planInit,
} from '../../world/native-events';
import { runNativeCycle, type SchedulerState } from './native-scheduler';
import type {
  DailyEventRecord, DamageState, InitPlan,
} from '../../shared/types/native';
import type { NativeSaveSection, SaveData } from '../../shared/types/save';

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
function pngFromDataUrl(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

// ---------- 原始基准像素（所有状态合成从同一份"干净原图"出发） ----------

/** 基准文件名由对象身份决定，跨会话稳定；首次合成前落盘（写前落盘原则）。 */
function basePngPath(id: string, realPath: string): string {
  const hash = crypto.createHash('sha1').update(`${id}|${realPath}`).digest('hex');
  return path.join(iconCacheDir(), `base-${hash}.png`);
}

const pristineBaseCache = new Map<string, Buffer>();

/**
 * 升级/崩溃遗留场景：恢复登记仍在（说明当前桌面引用是我们生成的损伤图标），
 * 从登记里保存的原始引用重新提取原图像素；提取不到返回 null（调用方退回
 * 当前像素源并如实继续）。
 */
async function originalDataUrlFromRestoreEntry(entry: IconRestoreEntry): Promise<string | null> {
  try {
    let request: { path: string; resourceIndex?: number } | null = null;
    if (entry.kind === 'lnk') {
      if (entry.shortcut.icon) request = { path: entry.shortcut.icon, resourceIndex: entry.shortcut.iconIndex ?? 0 };
      else if (entry.shortcut.target) request = { path: entry.shortcut.target };
    } else {
      const raw = entry.desktopIniRawBase64 ? Buffer.from(entry.desktopIniRawBase64, 'base64') : null;
      const decoded = raw ? decodeIni(raw) : null;
      const source = decoded ? parseIconResource(decoded.text).source : null;
      if (source) request = { path: source, resourceIndex: 0 };
    }
    if (!request) return null;
    const [pixels] = await queryShellIcons([request]);
    if (!pixels) return null;
    return `data:image/png;base64,${Buffer.from(pixels.pixels).toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * 取该对象的干净原图（256px PNG）：优先基准缓存文件；无缓存时若桌面当前
 * 显示的是我们的损伤图标（有恢复登记），先按登记里的原始引用提取，避免
 * 把损伤叠进基准。此后即使重复扫描/崩溃重启，合成源也不再叠加损伤。
 */
async function pristineBasePng(candidate: CycleCandidate): Promise<Buffer> {
  const cached = pristineBaseCache.get(candidate.id);
  if (cached) return cached;
  const file = basePngPath(candidate.id, candidate.realPath);
  if (fs.existsSync(file)) {
    const png = fs.readFileSync(file);
    pristineBaseCache.set(candidate.id, png);
    return png;
  }
  let sourceDataUrl = candidate.iconDataUrl;
  const entry = findEntry(candidate.realPath);
  if (entry) {
    const original = await originalDataUrlFromRestoreEntry(entry);
    if (original) sourceDataUrl = original;
    else console.warn('[native-events] 原始引用提取失败，基准可能含损伤像素:', candidate.realPath);
  }
  const png = await composeStateIconPng(pngFromDataUrl(sourceDataUrl), null, candidate.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, png);
  fs.renameSync(tmp, file);
  pristineBaseCache.set(candidate.id, png);
  return png;
}

/** 护理台展示用的原图 data URL：有基准缓存给基准，否则退回扫描像素（未改过的对象即原图）。 */
export function pristineDataUrlFor(id: string, realPath: string, fallback: string): string {
  const cached = pristineBaseCache.get(id);
  if (cached) return `data:image/png;base64,${cached.toString('base64')}`;
  const file = basePngPath(id, realPath);
  try {
    if (fs.existsSync(file)) {
      const png = fs.readFileSync(file);
      pristineBaseCache.set(id, png);
      return `data:image/png;base64,${png.toString('base64')}`;
    }
  } catch { /* 读取失败退回扫描像素 */ }
  return fallback;
}

async function applyObjectIcon(candidate: CycleCandidate, damage: DamageState | null, eventId: string, species?: string): Promise<void> {
  const png = await composeStateIconPng(await pristineBasePng(candidate), damage, candidate.id, species);
  const iconPath = await writeIcoCache(png, [candidate.realPath, candidate.id,
    damage ? `${damage.family}-${damage.stage}-${damage.mushroom}` : 'clean']);
  const result = applyIconMutation({
    id: candidate.id, realPath: candidate.realPath, kind: candidate.kind as IconMutationKind,
    iconPath, eventId,
  });
  if (!result.ok) throw new Error(result.reason);
}

/** 供护理/采摘处理器复用的外观应用（同一合成与恢复登记管线）。 */
export async function applyAppearance(entry: CycleCandidate, damage: DamageState | null, species?: string): Promise<void> {
  return applyObjectIcon(entry, damage, 'care', species);
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

  // 天气（R3）：注入快照优先（测试）；否则按所选城市取数，未选城市用
  // 内置默认城市（长沙）开箱即跑；实况彻底不可用时 getWeather 已回退内置快照
  let snapshot = null as NativeSaveSection['lastSnapshot'];
  let usableForEvents = false;
  if (options.injectSnapshot) {
    snapshot = { ...options.injectSnapshot, observedAt: new Date(now).toISOString(), fetchedAt: now };
    usableForEvents = true;
  } else {
    const location = native.location ?? DEFAULT_LOCATION;
    const lookup = await getWeather({ cityId: location.cityId, label: location.label, latitude: location.latitude, longitude: location.longitude });
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
  const warm = async (candidate: CycleCandidate | undefined, damage: DamageState | null, species?: string): Promise<void> => {
    if (!candidate) return;
    const png = await composeStateIconPng(await pristineBasePng(candidate), damage, candidate.id, species);
    const stateKey = damage ? `${damage.family}-${damage.stage}-${damage.mushroom}-${species ?? ''}` : 'clean';
    const iconPath = await writeIcoCache(png, [candidate.realPath, candidate.id, stateKey]);
    iconPaths.set(`${candidate.id}|${damage ? `${damage.family}-${damage.stage}-${damage.mushroom}` : 'clean'}`, iconPath);
  };
  try {
    if (branch === 'generate-init' && snapshot) {
      const plan = planInit(candidates, snapshot, seeds[0], now);
      for (const target of plan.targets) {
        const candidate = candidates.find((c) => c.id === target.id);
        await warm(candidate, { family: target.family, stage: target.stage, mushroom: target.mushroom }, native.objects[target.id]?.mushroomSpecies ?? speciesForWeather(snapshot));
      }
    } else if (branch === 'continue-init' && native.init && 'targets' in native.init) {
      for (const target of native.init.targets) {
        if (target.status !== 'pending') continue;
        const candidate = candidates.find((c) => c.id === target.id);
        await warm(candidate, { family: target.family, stage: target.stage, mushroom: target.mushroom }, native.objects[target.id]?.mushroomSpecies ?? speciesForWeather(snapshot));
      }
    } else if ((branch === 'daily-create' || branch === 'daily-resume') && snapshot) {
      const recordSeed = branch === 'daily-resume' && todayRecord ? todayRecord.seed : seeds[1];
      const order = planDailyOrder(Object.values(native.objects), snapshot, now, recordSeed);
      for (const id of order.slice(0, 3)) {
        const obj = native.objects[id];
        const candidate = candidates.find((c) => c.id === id);
        if (!obj || !candidate) continue;
        const family = pickDailyFamily(obj, snapshot, now, recordSeed);
        const advanced = advanceDamage(obj.damage, family);
        await warm(candidate, advanced.damage, obj.mushroomSpecies ?? (advanced.damage.mushroom !== 'none' ? speciesForWeather(snapshot) : undefined));
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
        await applyObjectIcon(c, obj.damage, 'echo', obj.mushroomSpecies);
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
