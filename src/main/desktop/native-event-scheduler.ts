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
  decideNativeBranch, localDateKey, planInit,
} from '../../world/native-events';
import { runNativeCycle, type SchedulerState } from './native-scheduler';
import type {
  DailyEventRecord, DamageState, InitPlan,
} from '../../shared/types/native';
import type { DailyEventRecordV4, ObjectCategory, SpeciesId } from '../../shared/types/gameplay';
import type { NativeSaveSection, SaveData } from '../../shared/types/save';
import { rollSpecies } from '../../shared/species/species-roll';
import { hashString } from '../../shared/rand';
import { adjacencyFromDesktop } from '../../shared/desktop-adjacency';
import { runDailyCycleV4 } from '../../world/daily-cycle';
import type { OverlayVariant } from '../icon/state-icon';

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
  /** v0.2 品种输入（classifyObject；缺省按 other） */
  objectCategory?: ObjectCategory;
  /** v0.2 蔓延邻接输入：桌面画布坐标（只读，不移动图标） */
  x?: number;
  y?: number;
}

export interface CycleResult {
  branch: string;
  initChanged: number;
  initSkipped: number;
  dailyAdvanced: boolean;
  detail: string;
}

/**
 * 首批（INIT）幼菇品种（R5.1 v0.2）：与日账本同一判定 rollSpecies，种子由对象 ID 与快照时间派生，
 * 同一对象同一快照结果稳定。新事件不再产生旧品种；未知天气（rollSpecies 返回 null）
 * 退回 'bubble'（返潮泡泡菇：高湿基础品种），不伪造稀有品种。
 */
function initSpeciesFor(
  snapshot: NativeSaveSection['lastSnapshot'],
  objectId: string,
  category: ObjectCategory | undefined,
  now: number,
): SpeciesId {
  if (!snapshot) return 'bubble';
  return rollSpecies({
    category: category ?? 'other',
    weatherCode: snapshot.weatherCode,
    humidity: snapshot.humidityPct,
    temperatureC: snapshot.temperatureC,
    localHour: new Date(now).getHours(),
    seed: hashString(`init:${objectId}:${snapshot.observedAt}`) >>> 0,
    alertActive: false,
  }) ?? 'bubble';
}

function overlayVariantOf(native: NativeSaveSection | undefined): OverlayVariant {
  return native?.overlayVariant === 'B' ? 'B' : 'A';
}

function iconStateKey(damage: DamageState | null, species?: string): string {
  return damage ? `${damage.family}-${damage.stage}-${damage.mushroom}-${damage.mushroom === 'none' ? '' : species ?? ''}` : 'clean';
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
    // 0.1.28 用户裁决："没有老用户，不必考虑"。缺 native 段或残留 legacy-initialized 一律按
    // 未初始化处理，由下一轮事件循环正常发放首批（60–70% 桌面对象）。已有对象注册表与收藏保留。
    if (!existing.native) existing.native = defaultNative();
    else if (existing.native.init?.status === 'legacy-initialized') existing.native.init = null;
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

/** 合成状态 ICO 并落缓存（异步阶段）；同一状态+品种+版本内容寻址复用。 */
async function materializeIcon(candidate: CycleCandidate, damage: DamageState | null, species: string | undefined, variant: OverlayVariant): Promise<string> {
  const png = await composeStateIconPng(await pristineBasePng(candidate), damage, candidate.id, species, variant);
  return writeIcoCache(png, [candidate.realPath, candidate.id, iconStateKey(damage, species), variant]);
}

async function applyObjectIcon(candidate: CycleCandidate, damage: DamageState | null, eventId: string, species?: string): Promise<void> {
  const iconPath = await materializeIcon(candidate, damage, species, overlayVariantOf(loadSave()?.native));
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

  // v0.2 品种输入随扫描刷新（类别只来自 .lnk 元数据，不读正文）
  for (const c of candidates) {
    const obj = native.objects[c.id];
    if (obj && c.objectCategory) obj.objectCategory = c.objectCategory;
  }

  const today = localDateKey(now);
  const todayRecord = native.dailyEvents[today] ?? null;
  const initStatus = native.init === null ? 'not-generated'
    : native.init.status === 'legacy-initialized' ? 'completed'
    : native.init.status;
  // 0.1.28 用户裁决：取消"暂停自然变化"。只有显式"恢复桌面图标并暂停"（restored）才停发事件；
  // 旧版本存档残留的 paused=true 在这里归一为 restored 的值（下方 native.paused = paused 落盘）。
  const paused = native.restored === true;
  const branch = decideNativeBranch({
    paused,
    hasValidWeather: usableForEvents && snapshot !== null,
    initStatus,
    todayRecord: todayRecord ? { status: todayRecord.status } : null,
  });

  // v0.2：每日自然事件走 v4 账本（3/5 槽位 + 播种 + 蔓延 + 警报）。
  // 分支仍由 decideNativeBranch 决定：INIT 未完成、暂停、天气不可用、当日终态都不会进入这里。
  if ((branch === 'daily-create' || branch === 'daily-resume') && snapshot) {
    return executeDailyV4(save, candidates, snapshot, now, todayRecord);
  }

  // 预热（INIT 分支）：按纯核心的确定性预测，物化本轮需要的 ICO（异步阶段），核心回调只做同步引用写入
  const variant = overlayVariantOf(native);
  const categoryOf = (id: string) => native.objects[id]?.objectCategory ?? candidates.find((c) => c.id === id)?.objectCategory;
  const speciesOf = (id: string) => native.objects[id]?.mushroomSpecies ?? initSpeciesFor(snapshot, id, categoryOf(id), now);
  const seeds = [newSeed(), newSeed(), newSeed(), newSeed()];
  const iconPaths = new Map<string, string>();
  const initKey = (id: string, plan: { family: string; stage: number; mushroom: string } | null) =>
    `${id}|${plan ? `${plan.family}-${plan.stage}-${plan.mushroom}` : 'clean'}`;
  const warm = async (candidate: CycleCandidate | undefined, damage: DamageState): Promise<void> => {
    if (!candidate) return;
    const species = damage.mushroom === 'none' ? undefined : speciesOf(candidate.id);
    iconPaths.set(initKey(candidate.id, damage), await materializeIcon(candidate, damage, species, variant));
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
    }
  } catch (error) {
    console.warn('[native-events] 图标预热失败（回退为逐次写入）:', error);
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

  // 首批幼菇品种（R5.1）：v3 核心不涉品种，落盘前用与预热相同的确定性判定补齐
  for (const obj of Object.values(native.objects)) {
    if (obj.damage && obj.damage.mushroom !== 'none' && !obj.mushroomSpecies) {
      obj.mushroomSpecies = speciesOf(obj.id);
    }
  }

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
 * v4 每日编排接线（R4.2 v0.2）：领域规则全部在 world/daily-cycle.runDailyCycleV4，
 * 主进程只提供时钟、种子、存在性、类别、真实坐标邻接与图标写入。
 *
 * 图标写入是同步回调而 ICO 合成是异步的，因此分两遍：
 * 1) 预演：在存档深拷贝上跑同一编排，applyIcon 只记录计划并返回成功；
 * 2) 物化：把计划中的状态 ICO 全部合成落缓存；
 * 3) 正式：在真实存档上用同样输入再跑一遍，applyIcon 只做引用写入。
 * 编排对相同输入确定，两遍计划一致；若不一致（缓存缺失）applyIcon 返回 false，
 * 由领域层按写入失败记账（同一事件身份，下次触发续写），不会多推进。
 */
async function executeDailyV4(
  save: SaveData,
  candidates: CycleCandidate[],
  snapshot: NonNullable<NativeSaveSection['lastSnapshot']>,
  now: number,
  todayRecord: DailyEventRecord | DailyEventRecordV4 | null,
): Promise<CycleResult> {
  const native = save.native!;
  const variant = overlayVariantOf(native);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const categories: Record<string, ObjectCategory> = {};
  for (const obj of Object.values(native.objects)) {
    categories[obj.id] = obj.objectCategory ?? byId.get(obj.id)?.objectCategory ?? 'other';
  }
  const adjacency = adjacencyFromDesktop(candidates.map((c) => ({ id: c.id, x: c.x, y: c.y })));
  const existsMemo = new Map<string, boolean>();
  const exists = (objectId: string): boolean => {
    const cached = existsMemo.get(objectId);
    if (cached !== undefined) return cached;
    const candidate = byId.get(objectId);
    let ok = false;
    if (candidate) { try { ok = fs.existsSync(candidate.realPath); } catch { ok = false; } }
    existsMemo.set(objectId, ok);
    return ok;
  };
  // 续写当日记录沿用其持久化种子；新建时随机一次（记录建立后持久化，重放确定）
  const seed = todayRecord && typeof todayRecord.seed === 'number' ? todayRecord.seed : newSeed();
  const baseDeps = {
    weather: snapshot, weatherDefaulted: false, now, seed, categories, exists, adjacency,
  };
  type IconPlan = { family: DamageState['family']; stage: DamageState['stage']; mushroom: string; species?: string };
  const planKey = (id: string, plan: IconPlan, speciesFallback?: string) => {
    const damage = { family: plan.family, stage: plan.stage, mushroom: plan.mushroom } as DamageState;
    return { key: `${id}|${iconStateKey(damage, plan.species ?? speciesFallback)}`, damage, species: plan.species ?? speciesFallback };
  };

  // 只让当前桌面上的对象参与每日推进：注册表里已删除/移走的对象（含历史探针残留）保留记录
  // 但不再消耗候选尝试（0.1.27 实测注册表 56 项中 12 项已不在桌面）。对象本体与真实存档
  // 共享引用，结算对对象的修改直接落到存档；顶层字段（警报、播种、账本）结算后写回。
  const presentView = (section: NativeSaveSection): NativeSaveSection => ({
    ...section,
    objects: Object.fromEntries(Object.entries(section.objects).filter(([id]) => byId.has(id))),
  });
  const writeBack = (section: NativeSaveSection, view: NativeSaveSection): void => {
    const { objects: _objects, ...rest } = view;
    Object.assign(section, rest);
  };

  // 1) 预演
  const rehearsal = presentView(structuredClone(native));
  const planned: Array<{ id: string; key: string; damage: DamageState; species?: string }> = [];
  runDailyCycleV4({
    ...baseDeps,
    native: rehearsal,
    applyIcon: (id, plan) => {
      const resolved = planKey(id, plan, rehearsal.objects[id]?.mushroomSpecies);
      planned.push({ id, ...resolved });
      return true;
    },
  });

  // 2) 物化
  const iconPaths = new Map<string, string>();
  for (const item of planned) {
    const candidate = byId.get(item.id);
    if (!candidate || iconPaths.has(item.key)) continue;
    try {
      iconPaths.set(item.key, await materializeIcon(candidate, item.damage, item.species, variant));
    } catch (error) {
      console.warn('[native-events] v4 图标合成失败（该槽位按写入失败记账）:', candidate.realPath, error);
    }
  }

  // 3) 正式结算
  const view = presentView(native);
  const result = runDailyCycleV4({
    ...baseDeps,
    native: view,
    applyIcon: (id, plan) => {
      const candidate = byId.get(id);
      if (!candidate) return false;
      const { key } = planKey(id, plan, native.objects[id]?.mushroomSpecies);
      const iconPath = iconPaths.get(key);
      if (!iconPath) {
        console.warn('[native-events] v4 预演与正式计划不一致或合成失败:', key);
        return false;
      }
      const written = applyIconMutation({
        id: candidate.id, realPath: candidate.realPath, kind: candidate.kind as IconMutationKind,
        iconPath, eventId: 'cycle-v4',
      });
      if (!written.ok) console.warn('[native-events] 图标引用写入失败:', candidate.realPath, written.reason);
      return written.ok;
    },
    log: (message) => console.info('[native-events v4]', message),
  });
  writeBack(native, view);

  save.savedAt = now;
  writeSave(save);
  const limit = result.record?.limit ?? 0;
  return {
    branch: `v4-${result.action}`,
    initChanged: 0,
    initSkipped: 0,
    dailyAdvanced: result.advanced > 0,
    detail: `推进 ${result.advanced}、跳过 ${result.skipped}、蔓延 ${result.spreadInserted}，额度 ${result.dailyUsed}/${limit}${result.alert.active ? '（回南天警报）' : ''}`,
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
