/**
 * 原生体验 IPC（Goal v9 阶段3；独立于 register-handlers 以减少旧通道耦合）
 * 契约：docs/contracts/preload-api.md v1.14 native 组。
 * 纪律：sender 校验 + 载荷浅校验；领域操作经 src/world 纯函数；每次变更原子写存档。
 */
import { app, ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { loadSave, writeSave } from '../save/save-store';
import { setManagementPausedFlag } from '../window/management-window';
import {
  applyAppearance, nativeStatusSummary, pristineDataUrlFor, restoreDesktopAndPause,
  resumeFromRestored, reapplySavedAppearances, runNativeEventCycle, setNativeLocation,
  setNativePaused, type CycleCandidate,
} from '../desktop/native-event-scheduler';
import { restoreIconReferences } from '../desktop/icon-mutate';
import { getWeather } from '../weather/weather-service';
import {
  buyNativeItem, completeCare, grantOnboarding, harvestMushroom,
} from '../../world/native-care';
import type { DamageState } from '../../shared/types/native';
import type { DesktopEntry } from '../../shared/types/desktop';
import {
  isCareSessionStale, judgeFineCare, mirrorCareSessionToLegacy, validateCareSession,
} from '../../shared/care-session';
import { cancelPlant, completeCareV2, harvestV2, plantSpore } from '../../world/spores';
import { buildDailyForecast } from '../../world/daily-forecast';
import { dailyLimitFor, dailyUsedOf } from '../../world/daily-v4';
import { localDateKey } from '../../world/native-events';
import { hashString } from '../../shared/rand';
import { adjacencyFromDesktop } from '../../shared/desktop-adjacency';
import { DEFAULT_WEATHER_SNAPSHOT } from '../../shared/native-defaults';
import {
  isNewSpeciesId, type CareCompleteV2Result, type DailyEventRecordV4, type HarvestV2Result,
} from '../../shared/types/gameplay';
import type { NativeSaveSection } from '../../shared/types/save';

const DAMAGE_FAMILIES = new Set(['damp', 'mold', 'char']);

/** 当日 v4 记录（v3 记录或缺失返回 null） */
function todayRecordV4(native: NativeSaveSection, now: number): DailyEventRecordV4 | null {
  const record: unknown = native.dailyEvents[localDateKey(now)];
  if (!record || typeof record !== 'object' || !('slots' in record)) return null;
  return record as DailyEventRecordV4;
}

/** 内置默认快照识别：observedAt 与冻结快照一致（实况/缓存快照不会恰好等于该时刻） */
function isDefaultSnapshot(snapshot: NativeSaveSection['lastSnapshot']): boolean {
  return snapshot !== null && snapshot.observedAt === DEFAULT_WEATHER_SNAPSHOT.observedAt;
}

/** 最近一次真实桌面扫描（主进程原生模式自扫；缓存供图标操作取原图） */
let latestEntries: DesktopEntry[] = [];

/**
 * 产品模式合法渲染层发送方（护理台窗、胶囊窗）。
 * 旧通道（register-handlers）沿用场景窗校验；weather 组在原生模式下
 * 由护理台/胶囊调用，须在此登记。弱引用清理：销毁的 wc 不再放行。
 */
const allowedSenders = new Set<Electron.WebContents>();
export function allowSender(wc: Electron.WebContents | null): void {
  if (wc && !wc.isDestroyed()) allowedSenders.add(wc);
}
export function isAllowedSender(wc: Electron.WebContents | null): boolean {
  for (const entry of allowedSenders) {
    if (entry.isDestroyed()) allowedSenders.delete(entry);
    else if (entry === wc) return true;
  }
  return false;
}

export function updateNativeEntries(entries: DesktopEntry[]): void {
  latestEntries = entries;
}

export function latestCycleCandidates(): CycleCandidate[] {
  return latestEntries
    .filter((e) => (e.kind === 'dir' || e.kind === 'file') && !e.realPath.startsWith('::'))
    .map(entryToCandidate);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 扫描到的桌面条目 → 游戏侧对象（仅 dir 与普通 .lnk；CD_NATIVE_PROBE_DIR 限定探针范围） */
export async function scanForNative(): Promise<void> {
  const { scanNativeDesktop } = await import('../desktop/native-desktop-scan');
  const entries = await scanNativeDesktop();
  const probeDir = process.env.CD_NATIVE_PROBE_DIR;
  updateNativeEntries(probeDir ? entries.filter((e) => e.realPath.startsWith(probeDir)) : entries);
}

/** 产品模式启动引导：扫描 → 回显存档外观 → 首次事件循环（R4 顺序：先核对再调度）。 */
export async function bootstrapNativeMode(): Promise<void> {
  await scanForNative();
  const echo = await reapplySavedAppearances(latestCycleCandidates());
  console.info('[native] 启动回显:', JSON.stringify(echo));
  const cycle = await runNativeEventCycle(latestCycleCandidates());
  console.info('[native] 事件循环:', JSON.stringify(cycle));
}

function findEntryFor(objectId: string): DesktopEntry | null {
  return latestEntries.find((e) => e.id === objectId) ?? null;
}

function entryToCandidate(entry: DesktopEntry): CycleCandidate {
  return {
    id: entry.id, realPath: entry.realPath,
    kind: (entry.kind === 'dir' ? 'dir' : 'lnk') as 'dir' | 'lnk',
    displayName: entry.displayName ?? entry.name,
    originalMtime: entry.mtime, iconDataUrl: entry.iconDataUrl,
    objectCategory: entry.objectCategory,
    // 桌面画布坐标（只读，用于蔓延邻接；不移动、不重排图标）
    x: entry.geometry?.x,
    y: entry.geometry?.y,
  };
}

/** 领域操作结果：失败必须走 ok:false，调用方据此决定不扣币、不发奖励、不改图标。 */
type MutatorResult = { ok: true; message?: string } | { ok: false; message: string };
type MutateOutcome = { ok: boolean; message?: string };

function succeed(message?: string): MutatorResult {
  return message ? { ok: true, message } : { ok: true };
}
function fail(message: string): MutatorResult {
  return { ok: false, message };
}

/**
 * 读-改-写存档。领域层返回失败时不写盘（存档保持原样）；写盘失败也返回 ok:false。
 * 之前把领域错误文案当成成功消息返回，导致护理/采摘/购买失败时界面仍显示成功。
 */
function mutateSave(mutator: (save: NonNullable<ReturnType<typeof loadSave>>) => MutatorResult): MutateOutcome {
  const save = loadSave();
  if (!save) return { ok: false, message: '存档尚未建立' };
  if (!save.native) save.native = { init: null, dailyEvents: {}, objects: {}, lastSnapshot: null };
  const result = mutator(save);
  if (!result.ok) return { ok: false, message: result.message };
  save.savedAt = Date.now();
  const written = writeSave(save);
  if (!written.ok) return { ok: false, message: '存档写入失败，本次操作未生效' };
  return result.message ? { ok: true, message: result.message } : { ok: true };
}

/** native.status 的 v4 字段（gameplay-v2 NativeStatusV4Fields；只读投影，不改存档）。 */
function v4StatusFields(native: NativeSaveSection | undefined, now: number) {
  const alert = native?.alert ?? { active: false, precipitationStreak: 0 };
  const record = native ? todayRecordV4(native, now) : null;
  const snapshot = native?.lastSnapshot ?? null;
  return {
    forecast: buildDailyForecast({
      date: localDateKey(now),
      weather: snapshot,
      defaulted: isDefaultSnapshot(snapshot),
      alertActive: alert.active,
      now,
    }),
    alert,
    spores: native?.spores ?? {},
    planted: Object.values(native?.planted ?? {}),
    dailyLimit: record?.limit ?? dailyLimitFor(alert.active),
    dailyUsed: dailyUsedOf(record),
    overlayVariant: native?.overlayVariant === 'B' ? 'B' as const : 'A' as const,
    fineCareCount: native?.fineCareCount ?? 0,
  };
}

export function registerNativeHandlers(getWc: () => WebContents | null): void {
  ipcMain.handle('native:status', (event) => {
    allowSender(event.sender); // 护理台/胶囊每次调用自动登记（契约内的合法渲染层）
    const save = loadSave();
    const native = save?.native;
    const summary = nativeStatusSummary();
    const entries = new Map(latestEntries.map((e) => [e.id, e]));
    const now = Date.now();
    const neighbors = adjacencyFromDesktop(latestEntries.map((e) => ({ id: e.id, x: e.geometry?.x, y: e.geometry?.y })));
    const planted = native?.planted ?? {};
    const objects = Object.values(native?.objects ?? {})
      .map((obj) => {
        const entry = entries.get(obj.id);
        // 与当前损伤不一致的会话是旧回执（自然推进/完成后），不下发，由护理台新建
        const session = obj.careSession && obj.damage && obj.damage.stage > 0
          && !isCareSessionStale(obj.careSession, obj.damage.family, obj.damage.stage)
          ? obj.careSession : undefined;
        const pendingPlant = planted[obj.id]?.status === 'pending' ? planted[obj.id].species : undefined;
        return {
          objectCategory: obj.objectCategory ?? entry?.objectCategory ?? 'other',
          ...(session ? { careSession: session } : {}),
          ...(pendingPlant ? { plantedSpecies: pendingPlant } : {}),
          ...(obj.glossUntil ? { glossUntil: obj.glossUntil } : {}),
          neighbors: neighbors.get(obj.id) ?? [],
          id: obj.id, displayName: obj.displayName, kind: obj.kind,
          realPath: obj.realPath, damage: obj.damage, careProgress: obj.careProgress ?? 0, careMask: obj.careMask,
          mushroomSpecies: obj.mushroomSpecies, moldImmuneUntil: obj.moldImmuneUntil ?? 0,
          lastAdvanceAt: obj.lastAdvanceAt ?? 0,
          present: Boolean(entry),
          // 护理台基图为原图：对象当前桌面图标可能是我们生成的损伤态，
          // 直接回传会把"损伤叠损伤"带进窗口预览（R7 原图作为合成输入）。
          iconDataUrl: entry ? pristineDataUrlFor(obj.id, obj.realPath, entry.iconDataUrl) : '',
        };
      })
      .sort((a, b) => {
        const rank = (o: typeof a) => (o.damage?.mushroom === 'mature' ? 0 : o.damage && o.damage.stage > 0 ? 1 : 2);
        return rank(a) - rank(b) || b.lastAdvanceAt - a.lastAdvanceAt;
      });
    return {
      ...summary,
      restored: native?.restored === true,
      location: native?.location ?? null,
      snapshot: native?.lastSnapshot ?? null,
      collection: native?.collection ?? {},
      onboarded: native?.onboarded === true,
      coins: save?.player.coins ?? 0,
      owned: save?.player.owned ?? [],
      objects,
      ...v4StatusFields(native, now),
    };
  });

  ipcMain.handle('native:setLocation', async (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload)) return { ok: false, message: 'invalid-request' };
    const { cityId, label, latitude, longitude } = payload;
    if (typeof cityId !== 'string' || typeof label !== 'string' || label.length > 100
      || typeof latitude !== 'number' || !Number.isFinite(latitude)
      || typeof longitude !== 'number' || !Number.isFinite(longitude)) {
      return { ok: false, message: 'invalid-location' };
    }
    // R3：先取得新城市的天气，成功后才保存城市；失败保留原城市与原缓存，不冒充新城市
    const target = { cityId, label, latitude, longitude };
    const lookup = await getWeather(target);
    if (!lookup.snapshot || lookup.status === 'unavailable') {
      return { ok: false, message: '该城市天气暂不可用，已保留原城市，可稍后重试' };
    }
    setNativeLocation(target);
    void runNativeEventCycle(latestCycleCandidates()).catch((error) =>
      console.warn('[native] 改城后事件循环失败:', error));
    return { ok: true };
  });

  ipcMain.handle('native:setPaused', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.paused !== 'boolean') {
      return { ok: false };
    }
    setNativePaused(payload.paused);
    // 回落托盘菜单与状态投影，避免护理台暂停后托盘文案陈旧
    setManagementPausedFlag(payload.paused);
    return { ok: true };
  });

  ipcMain.handle('native:careProgress', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string'
      || typeof payload.progress !== 'number' || !Number.isFinite(payload.progress)
      || payload.progress < 0 || payload.progress > 1) {
      return { ok: false };
    }
    const objectId: string = payload.objectId;
    const progress: number = payload.progress;
    const mask = typeof payload.mask === 'string' && payload.mask.length <= 4096 ? payload.mask : undefined;
    return mutateSave((save) => {
      const obj = save.native!.objects[objectId];
      if (!obj) return fail('对象不存在');
      // 已干净（完成或被自然事件重置）的旧进度回执不得覆盖新状态
      if (!obj.damage || obj.damage.stage === 0) return fail('该对象已经干净，进度未记录');
      obj.careProgress = progress;
      if (mask !== undefined) obj.careMask = mask;
      return succeed();
    });
  });

  const finishCare = (objectId: unknown, sender: WebContents | null): MutateOutcome => {
    if (sender !== getWc() || typeof objectId !== 'string') return { ok: false, message: 'invalid-request' };
    let iconEntry: DesktopEntry | null = null;
    let damage: DamageState | null = null;
    const outcome = mutateSave((save) => {
      const result = completeCare(save.native!, objectId, Date.now());
      if (!result.ok) return fail(result.error ?? '清理失败');
      // v4：清理完成后分层会话作废（否则下次同族同级损伤会续上旧掩码）
      const cleaned = save.native!.objects[objectId];
      if (cleaned) cleaned.careSession = undefined;
      iconEntry = findEntryFor(objectId);
      damage = save.native!.objects[objectId]?.damage ?? null;
      return succeed('已清理完成，10 天内不再发霉（可受潮/发焦）');
    });
    if (outcome.ok && iconEntry && typeof damage !== 'undefined') {
      // 完成护理立即落到桌面图标（干净+菇）；restored 模式下只存进度不写桌面（R8）
      const save = loadSave();
      if (save?.native?.restored !== true) {
        const species = save?.native?.objects[objectId]?.mushroomSpecies ?? undefined;
        void applyAppearance(entryToCandidate(iconEntry), damage, species).catch((error) =>
          console.warn('[native] 护理图标更新失败:', error));
      }
    }
    return outcome;
  };
  ipcMain.handle('native:careComplete', (event, payload: unknown) => {
    if (!isPlainObject(payload)) return { ok: false, message: 'invalid-request' };
    return finishCare(payload.objectId, event.sender);
  });
  ipcMain.handle('native:quickCare', (event, payload: unknown) => {
    if (!isPlainObject(payload)) return { ok: false, message: 'invalid-request' };
    return finishCare(payload.objectId, event.sender); // 快速处理：同样清理+免疫，不自动采菇（R6）
  });

  ipcMain.handle('native:harvest', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string') {
      return { ok: false, message: 'invalid-request' };
    }
    const objectId: string = payload.objectId;
    let coinsDelta = 0;
    let iconEntry: DesktopEntry | null = null;
    let damage: DamageState | null = null;
    const outcome = mutateSave((save) => {
      const result = harvestMushroom(save.native!, objectId, Date.now(), 'oyster');
      if (!result.ok) return fail(result.error ?? '采摘失败');
      save.player.coins += result.coins ?? 0;
      coinsDelta = result.coins ?? 0;
      iconEntry = findEntryFor(objectId);
      damage = save.native!.objects[objectId]?.damage ?? null;
      return succeed(`采摘 +${coinsDelta} 菇币，已收入收藏`);
    });
    if (outcome.ok && iconEntry) {
      const save = loadSave();
      if (save?.native?.restored !== true) {
        const species = (save?.native?.objects[objectId]?.mushroomSpecies) ?? undefined;
        void applyAppearance(entryToCandidate(iconEntry), damage, species).catch((error) =>
          console.warn('[native] 采摘图标更新失败:', error));
      }
    }
    return { ...outcome, coins: outcome.ok ? coinsDelta : 0 };
  });

  ipcMain.handle('native:buy', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.itemId !== 'string') {
      return { ok: false, message: 'invalid-request' };
    }
    const itemId: string = payload.itemId;
    return mutateSave((save) => {
      const result = buyNativeItem(save.native!, save.player.coins, save.player.owned, itemId);
      if (!result.ok) return fail(result.error ?? '购买失败');
      save.player.coins = result.coins!;
      save.player.owned = result.owned!;
      return succeed(`已购买 ${itemId}`);
    });
  });

  ipcMain.handle('native:onboarding', (event) => {
    if (event.sender !== getWc()) return { ok: false };
    return mutateSave((save) => {
      const result = grantOnboarding(save.native!, save.player.coins);
      if (result.alreadyDone) return succeed(); // 重复完成不重发奖励
      save.player.coins = result.coins;
      return succeed('新手奖励 +24 菇币');
    });
  });

  ipcMain.handle('native:restoreAndPause', (event) => {
    if (event.sender !== getWc()) return { ok: false };
    const count = restoreDesktopAndPause();
    return { ok: true, message: `已还原 ${count} 项图标并暂停自然变化` };
  });

  ipcMain.handle('native:resume', (event) => {
    if (event.sender !== getWc()) return { ok: false };
    resumeFromRestored();
    // 显式"继续游戏"后才恢复存档外观（R8）
    void reapplySavedAppearances(latestCycleCandidates()).catch(() => undefined);
    void runNativeEventCycle(latestCycleCandidates()).catch(() => undefined);
    return { ok: true };
  });

  ipcMain.handle('native:setAutostart', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.on !== 'boolean') {
      return { ok: false };
    }
    try {
      // R8：自启默认关闭；开关反映系统实际状态；不使用临时解压路径注册
      app.setLoginItemSettings({ openAtLogin: payload.on, path: app.getPath('exe') });
      const actual = app.getLoginItemSettings();
      const effective = actual.openAtLogin;
      return { ok: effective === payload.on, on: effective, message: effective === payload.on ? undefined : '系统未接受自启设置（可能被安全策略禁用）' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('native:getAutostart', (event) => {
    if (event.sender !== getWc()) return { on: false };
    try { return { on: app.getLoginItemSettings().openAtLogin }; } catch { return { on: false }; }
  });

  registerNativeV2Handlers(getWc);

  ipcMain.handle('native:restoreOne', (event, payload: unknown) => {
    // 单对象手动还原（设置页"恢复全部"的子集入口；也用于调试）
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string') {
      return { ok: false };
    }
    const [report] = restoreIconReferences({ ids: [payload.objectId] });
    return { ok: report?.outcome === 'restored', outcome: report?.outcome, detail: report?.detail };
  });
}

// ---------- v0.2 玩法通道（gameplay-v2 契约 v1.15；领域规则全部来自 src/world 与 src/shared） ----------

/** 结算成功后把对象当前外观写回桌面（restored 模式只存不写，R8）；失败只记录，不回滚存档。 */
function refreshObjectIcon(objectId: string, label: string): void {
  const entry = findEntryFor(objectId);
  if (!entry) return;
  const save = loadSave();
  if (!save?.native || save.native.restored === true) return;
  const obj = save.native.objects[objectId];
  if (!obj) return;
  void applyAppearance(entryToCandidate(entry), obj.damage, obj.mushroomSpecies ?? undefined).catch((error) =>
    console.warn(`[native] ${label}图标更新失败:`, error));
}

function registerNativeV2Handlers(getWc: () => WebContents | null): void {
  ipcMain.handle('native:careProgressV2', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string'
      || typeof payload.family !== 'string' || !DAMAGE_FAMILIES.has(payload.family)
      || typeof payload.stage !== 'number' || ![1, 2, 3].includes(payload.stage)) {
      return { ok: false, message: 'invalid-request' };
    }
    // 掩码长度、进度有限性、工具 ID 由领域校验统一把关；非法直接拒绝，不静默修补
    const session = validateCareSession(payload.session);
    if (!session) return { ok: false, message: '护理会话数据非法' };
    const { objectId, family, stage } = payload as { objectId: string; family: string; stage: number };
    if (session.family !== family || session.stage !== stage) return { ok: false, message: '护理会话与载荷损伤不一致' };
    return mutateSave((save) => {
      const obj = save.native!.objects[objectId];
      if (!obj) return fail('对象不存在');
      if (!obj.damage || obj.damage.stage === 0) return fail('该对象已经干净，进度未记录');
      // 旧回执：渲染层看到的损伤与存档不一致（自然推进/已完成后迟到）
      if (obj.damage.family !== family || obj.damage.stage !== stage) return fail('对象损伤已变化，本次进度未记录');
      obj.careSession = session;
      mirrorCareSessionToLegacy(obj);
      return succeed();
    });
  });

  ipcMain.handle('native:careCompleteV2', (event, payload: unknown): CareCompleteV2Result => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string') {
      return { ok: false, message: 'invalid-request' };
    }
    const objectId: string = payload.objectId;
    let settled: CareCompleteV2Result = { ok: false };
    const outcome = mutateSave((save) => {
      const native = save.native!;
      const obj = native.objects[objectId];
      if (!obj) return fail('对象不存在');
      if (!obj.damage || obj.damage.stage === 0) return fail('该对象已经干净了');
      const session = obj.careSession ? validateCareSession(obj.careSession) : null;
      const fine = session !== null
        && !isCareSessionStale(session, obj.damage.family, obj.damage.stage)
        && judgeFineCare(session, { quickCare: false });
      const economy = { objects: native.objects, coins: save.player.coins, fineCareCount: native.fineCareCount };
      const result = completeCareV2(economy, { objectId, now: Date.now(), fineCare: fine });
      if (!result.ok) return fail(result.message ?? '清理失败');
      save.player.coins = economy.coins;
      native.fineCareCount = economy.fineCareCount;
      settled = result;
      return succeed(fine ? `精细护理完成 +${result.bonusCoins ?? 0} 菇币，10 天内不再发霉` : '已清理完成，10 天内不再发霉（可受潮/发焦）');
    });
    if (!outcome.ok) return { ok: false, message: outcome.message };
    refreshObjectIcon(objectId, '护理');
    return { ...settled, ok: true, message: outcome.message };
  });

  ipcMain.handle('native:harvestV2', (event, payload: unknown): HarvestV2Result => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string'
      || typeof payload.cutQuality !== 'number' || !Number.isFinite(payload.cutQuality)) {
      return { ok: false, message: 'invalid-request' };
    }
    const objectId: string = payload.objectId;
    const cutQuality = Math.max(0, Math.min(1, payload.cutQuality));
    let settled: HarvestV2Result = { ok: false };
    const outcome = mutateSave((save) => {
      const native = save.native!;
      const now = Date.now();
      // 孢子掉落种子：当日事件种子（无 v4 记录时由日期派生），与对象 ID 一起决定，重复点击刷不出
      const seed = todayRecordV4(native, now)?.seed ?? (hashString(`harvest:${localDateKey(now)}`) >>> 0);
      const state = { objects: native.objects, collection: native.collection, spores: native.spores };
      const result = harvestV2(state, objectId, cutQuality, now, seed);
      if (!result.ok) return fail(result.message ?? '采摘失败');
      native.collection = state.collection;
      native.spores = state.spores;
      save.player.coins += result.coins ?? 0;
      settled = result;
      return succeed(`采摘 +${result.coins ?? 0} 菇币${result.spore ? '，获得 1 枚孢子' : ''}`);
    });
    if (!outcome.ok) return { ok: false, message: outcome.message };
    refreshObjectIcon(objectId, '采摘');
    return { ...settled, ok: true, message: outcome.message };
  });

  ipcMain.handle('native:plantSpore', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string'
      || !isNewSpeciesId(payload.species)) {
      return { ok: false, message: 'invalid-request' };
    }
    const objectId: string = payload.objectId;
    const species = payload.species;
    // 只能播到当前桌面上实际存在的对象（删除/移走的对象不复活）
    if (!findEntryFor(objectId)) return { ok: false, message: '对象不在桌面或不可写' };
    return mutateSave((save) => {
      const native = save.native!;
      native.spores = native.spores ?? {};
      native.planted = native.planted ?? {};
      const result = plantSpore({
        objects: native.objects, spores: native.spores, planted: native.planted,
        todayRecord: todayRecordV4(native, Date.now()), now: Date.now(),
      }, objectId, species);
      if (!result.ok) return fail(result.message ?? '播种失败');
      // deferred：今日记录已结算或尚未建立，播种留待下一次每日推进吸收（不额外占用今天的槽位）
      return succeed(result.deferred ? '播种已登记，将在下一次每日推进时长出' : '播种成功，占用今日一个槽位，下一次推进时长出');
    });
  });

  ipcMain.handle('native:cancelPlant', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || typeof payload.objectId !== 'string') {
      return { ok: false, message: 'invalid-request' };
    }
    const objectId: string = payload.objectId;
    return mutateSave((save) => {
      const native = save.native!;
      native.spores = native.spores ?? {};
      native.planted = native.planted ?? {};
      const result = cancelPlant({
        spores: native.spores, planted: native.planted, todayRecord: todayRecordV4(native, Date.now()),
      }, objectId);
      if (!result.ok) return fail(result.message ?? '没有可取消的播种');
      return succeed('已取消播种，孢子已退回');
    });
  });

  ipcMain.handle('native:setOverlayVariant', (event, payload: unknown) => {
    if (event.sender !== getWc() || !isPlainObject(payload) || (payload.variant !== 'A' && payload.variant !== 'B')) {
      return { ok: false, message: 'invalid-request' };
    }
    const variant: 'A' | 'B' = payload.variant;
    const outcome = mutateSave((save) => {
      save.native!.overlayVariant = variant;
      return succeed();
    });
    // 只重新合成已有外观（回显，不是自然事件，不占额度）
    if (outcome.ok) {
      void reapplySavedAppearances(latestCycleCandidates()).catch((error) =>
        console.warn('[native] 切换合成版本后回显失败:', error));
    }
    return outcome;
  });
}
