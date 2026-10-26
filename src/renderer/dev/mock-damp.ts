/**
 * 模拟 window.damp（Task 2；仅开发环境，dev.html 入口加载）
 *
 * 与真实 preload 的差异只在"没有 Windows"：领域规则全部复用 src/world 与
 * src/shared 的同一实现（日账本结算、孢子、护理完成、警报、壁纸合成），
 * 不在模拟环境里另写一套规则（计划书 Task 2 开发限制）。
 * 存档持久化到 localStorage；生产构建的 care.html 不加载本文件。
 */
import type { NativeSaveSection, NativeObjectSave } from '../../shared/types/save';
import type { NativeStatusSnapshot, NativeObjectView } from '../../shared/types/native-status';
import type {
  CareCompleteV2Result, CareProgressV2Payload, CareSessionState, DailyEventRecordV4, DailyForecast,
  HarvestV2Payload, HarvestV2Result, NativeStatusV4Fields, NativeObjectViewV4Fields,
  NewSpeciesId, PlantSporePayload, WallpaperView,
} from '../../shared/types/gameplay';
import type { WeatherLookup, WeatherLocation } from '../../shared/types/weather';
import { buildAdjacency } from '../../world/mold-spread';
import { evaluateAlert, nextCornerMoldStage } from '../../world/damp-alert';
import { buildDailyForecast } from '../../world/daily-forecast';
import { dailyUsedOf } from '../../world/daily-v4';
import { runDailyCycleV4 } from '../../world/daily-cycle';
import { completeCare as completeCareV1, harvestMushroom, grantOnboarding, buyNativeItem } from '../../world/native-care';
import { completeCareV2, harvestV2 as harvestV2Domain, plantSpore, cancelPlant } from '../../world/spores';
import { validateCareSession, judgeFineCare } from '../../shared/care-session';
import { composeWallpaperEffect, fogLevelFor } from '../../shared/wallpaper/effects';
import { applyWipe, wipeProgress } from '../../shared/wallpaper/mask';
import { MockWeather, WEATHER_PRESETS } from './mock-weather';
import { MOCK_SAVE_KEY, buildMockSave } from './mock-save';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

interface MockWallpaperState {
  enabled: boolean;
  status: WallpaperView['status'];
  skipReason?: WallpaperView['skipReason'];
  fogMask?: string;
  cornerMoldStage: 0 | 1 | 2 | 3;
  wipeProgressValue: number;
  lastAppliedAt?: number;
}

export interface MockDamp {
  save: NativeSaveSection;
  now(): number;
  advanceDay(): void;
  selectWeather(key: string): void;
  weatherPresets(): typeof WEATHER_PRESETS;
  reset(): void;
  /** 重新计算壁纸合成（墙面页/设置页用） */
  composeWallpaper(): WallpaperView;
}

/** 装载模拟 window.damp；返回测试/演示用的控制接口。 */
export function installMockDamp(): MockDamp {
  const weather = new MockWeather();
  let now = Date.now();
  let save = loadSave(now);
  let lastSpreadInserted = 0;
  const wallpaper: MockWallpaperState = {
    enabled: false,
    status: 'off',
    cornerMoldStage: 0,
    wipeProgressValue: 0,
  };

  function persist(): void {
    try {
      localStorage.setItem(MOCK_SAVE_KEY, JSON.stringify({ save, now }));
    } catch { /* 隐私模式等场景下忽略：模拟存档丢失只影响演示 */ }
  }

  function loadSave(at: number): NativeSaveSection {
    try {
      const raw = localStorage.getItem(MOCK_SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { save: NativeSaveSection; now: number };
        if (parsed.save && parsed.save.objects) {
          now = parsed.now ?? at;
          return parsed.save;
        }
      }
    } catch { /* 损坏的模拟存档按新开局处理 */ }
    return buildMockSave(at);
  }

  // ---------- 每日循环（真实领域路径） ----------

  function ensureDailyRecord(): void {
    ensureDailyRecordViaCycle();
  }

  function ensureDailyRecordViaCycle(): void {
    const result = runDailyCycleV4({
      native: save,
      weather: weather.snapshot(now),
      weatherDefaulted: weather.isDefaulted(),
      now,
      seed: MockWeather.seedForDate(MockWeather.dateKey(now)),
      categories: objectCategories(),
      exists: () => true, // 模拟桌面对象恒存在
      applyIcon: () => true, // 模拟环境图标写入恒成功
      adjacency: adjacency(),
    });
    if (result.action === 'paused' || result.action === 'terminal') return;
    lastSpreadInserted = result.spreadInserted;
  }

  function objectCategories(): Record<string, NonNullable<NativeObjectSave['objectCategory']>> {
    const out: Record<string, NonNullable<NativeObjectSave['objectCategory']>> = {};
    for (const [id, obj] of Object.entries(save.objects)) out[id] = obj.objectCategory ?? 'other';
    return out;
  }

  function todayRecord(): DailyEventRecordV4 | null {
    const record: unknown = save.dailyEvents[MockWeather.dateKey(now)];
    if (!record || typeof record !== 'object' || !('slots' in record)) return null;
    return record as DailyEventRecordV4;
  }

  function todayForecast(): DailyForecast | null {
    return buildDailyForecast({
      date: MockWeather.dateKey(now),
      weather: weather.snapshot(now),
      defaulted: weather.isDefaulted(),
      alertActive: save.alert?.active ?? false,
      now,
    });
  }

  // ---------- 壁纸（真实合成路径） ----------

  function composeWallpaper(): WallpaperView {
    const snapshot = weather.snapshot(now);
    const base = mockWallpaperPixels();
    const result = composeWallpaperEffect({
      width: 480,
      height: 270,
      humidityPct: snapshot.humidityPct,
      weatherCode: snapshot.weatherCode,
      alertActive: save.alert?.active ?? false,
      cornerMoldStage: wallpaper.cornerMoldStage,
      fogMask: wallpaper.fogMask,
      seed: MockWeather.seedForDate(MockWeather.dateKey(now)),
      base,
    });
    wallpaper.lastAppliedAt = now;
    const view: WallpaperView = {
      enabled: wallpaper.enabled,
      status: wallpaper.enabled ? 'active' : 'off',
      ...(wallpaper.skipReason ? { skipReason: wallpaper.skipReason } : {}),
      fogLevel: fogLevelFor({ humidityPct: snapshot.humidityPct, weatherCode: snapshot.weatherCode, alertActive: save.alert?.active ?? false }),
      cornerMoldStage: wallpaper.cornerMoldStage,
      ...(wallpaper.fogMask ? { fogMask: wallpaper.fogMask } : {}),
      wipeProgress: wallpaper.wipeProgressValue,
      thumbnailDataUrl: rgbaToDataUrl(result.rgba, 480, 270),
      lastAppliedAt: wallpaper.lastAppliedAt,
    };
    return view;
  }

  // ---------- window.damp 实现 ----------

  const damp = {
    management: {
      async get() { return { paused: save.paused ?? false, shortcut: 'Ctrl+Alt+D' }; },
      async open() { /* 浏览器里没有托盘 */ },
      async command() { return { ok: true }; },
      onStatus() { return () => {}; },
    },
    window: {
      async setIgnoreMouseEvents() { /* 浏览器无此概念 */ },
    },
    weather: {
      async current(_location: WeatherLocation, _force?: boolean): Promise<WeatherLookup> {
        const snapshot = weather.snapshot(now);
        return {
          status: weather.isDefaulted() ? 'stale' : 'ok',
          snapshot: { ...snapshot, source: 'open-meteo' },
          ageMs: 0,
          usableForEvents: !weather.isDefaulted(),
          defaulted: weather.isDefaulted(),
        };
      },
      async searchCity(query: string) {
        const options = ['长沙', '上海', '广州', '杭州', '成都']
          .filter((c) => c.includes(query) || query.length === 0)
          .map((c, i) => ({ id: `mock-${i}`, name: c, admin1: '演示', latitude: 28 + i, longitude: 112 + i }));
        return { ok: true as const, options };
      },
    },
    native: {
      async status() {
        ensureDailyRecord();
        persist();
        const record = todayRecord();
        const objects = Object.values(save.objects).map((obj) => {
          const view: NativeObjectView & NativeObjectViewV4Fields = {
            id: obj.id,
            displayName: obj.displayName,
            kind: obj.kind,
            realPath: obj.realPath,
            damage: obj.damage,
            careProgress: obj.careSession?.progress ?? obj.careProgress ?? 0,
            ...(obj.careMask ? { careMask: obj.careMask } : obj.careSession ? { careMask: obj.careSession.layers[0]?.mask } : {}),
            ...(obj.mushroomSpecies ? { mushroomSpecies: obj.mushroomSpecies } : {}),
            moldImmuneUntil: obj.moldImmuneUntil ?? 0,
            lastAdvanceAt: obj.lastAdvanceAt ?? 0,
            present: true,
            iconDataUrl: mockIconDataUrl(obj),
            objectCategory: obj.objectCategory ?? 'other',
            ...(obj.careSession ? { careSession: obj.careSession } : {}),
            plantedSpecies: save.planted?.[obj.id]?.status === 'pending' ? save.planted[obj.id].species : undefined,
            ...(obj.glossUntil ? { glossUntil: obj.glossUntil } : {}),
            neighbors: adjacency().get(obj.id) ?? [],
          };
          return view;
        });
        const snapshot: NativeStatusSnapshot & NativeStatusV4Fields = {
          paused: save.paused ?? false,
          restored: save.restored ?? false,
          initStatus: save.init && 'status' in save.init ? save.init.status : 'completed',
          initProgress: save.init && 'status' in save.init && save.init.status === 'completed' ? '首批已完成' : '旧版用户',
          today: MockWeather.dateKey(now),
          todayStatus: record?.status ?? 'none',
          location: save.location ?? null,
          snapshot: save.lastSnapshot,
          collection: save.collection ?? {},
          onboarded: save.onboarded ?? false,
          coins: coins,
          owned: owned,
          objects,
          forecast: todayForecast(),
          alert: save.alert ?? { active: false, precipitationStreak: 0 },
          spores: save.spores ?? {},
          planted: Object.values(save.planted ?? {}),
          dailyLimit: record?.limit ?? 3,
          dailyUsed: dailyUsedOf(record),
          overlayVariant: save.overlayVariant ?? 'A',
        };
        return snapshot;
      },
      async setLocation(location: WeatherLocation) {
        save.location = location;
        persist();
        return { ok: true };
      },
      async setPaused(paused: boolean) {
        save.paused = paused;
        persist();
        return { ok: true };
      },
      // v1 通道（旧 UI 兼容）
      async careProgress(objectId: string, progress: number, mask?: string) {
        const obj = save.objects[objectId];
        if (!obj) return { ok: false, message: '对象不存在' };
        if (!Number.isFinite(progress) || progress < 0 || progress > 1) return { ok: false, message: '非法进度' };
        obj.careProgress = progress;
        if (mask) obj.careMask = mask;
        persist();
        return { ok: true };
      },
      async careComplete(objectId: string) {
        const result = completeCareV1(save, objectId, now);
        persist();
        return result.ok ? { ok: true } : { ok: false, message: result.error };
      },
      async quickCare(objectId: string) {
        const eco = { objects: save.objects, coins, fineCareCount: save.fineCareCount };
        const result = completeCareV2(eco, { objectId, now, fineCare: false });
        coins = eco.coins;
        save.fineCareCount = eco.fineCareCount;
        if (!result.ok) return { ok: false, message: result.message };
        persist();
        return { ok: true };
      },
      async harvest(objectId: string) {
        const seed = MockWeather.seedForDate(MockWeather.dateKey(now));
        const result = harvestV2Domain({ objects: save.objects, collection: save.collection, spores: save.spores }, objectId, 1, now, seed);
        if (!result.ok) return { ok: false, message: result.message };
        coins += result.coins ?? 0;
        persist();
        return { ok: true, coins: result.coins };
      },
      async buy(itemId: string) {
        const result = buyNativeItem(save, coins, owned, itemId);
        if (!result.ok) return { ok: false, message: result.error };
        coins = result.coins!;
        owned = result.owned!;
        persist();
        return { ok: true };
      },
      async onboardingDone() {
        const result = grantOnboarding(save, coins);
        coins = result.coins;
        persist();
        return { ok: true, message: result.alreadyDone ? '已完成过引导' : undefined };
      },
      async restoreAndPause() {
        save.paused = true;
        save.restored = true;
        persist();
        return { ok: true, message: '模拟环境：不触碰真实桌面' };
      },
      async resume() {
        save.paused = false;
        save.restored = false;
        persist();
        return { ok: true };
      },
      async setAutostart() { return { ok: true, on: false }; },
      async getAutostart() { return { on: false }; },
      // ---------- v2 通道（gameplay-v2 契约；员工 2 接线后同语义） ----------
      async careProgressV2(payload: CareProgressV2Payload) {
        const obj = save.objects[payload.objectId];
        if (!obj) return { ok: false, message: '对象不存在' };
        if (!obj.damage || obj.damage.family !== payload.family || obj.damage.stage !== payload.stage) {
          return { ok: false, message: '会话与对象当前损伤不一致（旧回执）' };
        }
        const session = validateCareSession(payload.session);
        if (!session) return { ok: false, message: '会话数据非法' };
        obj.careSession = session;
        obj.careProgress = session.progress;
        obj.careMask = session.layers[0]?.mask;
        persist();
        return { ok: true as const };
      },
      async careCompleteV2(objectId: string): Promise<CareCompleteV2Result> {
        const obj = save.objects[objectId];
        if (!obj || !obj.damage || obj.damage.stage === 0) return { ok: false, message: '对象不存在或已干净' };
        const session = obj.careSession ? validateCareSession(obj.careSession) : null;
        const fine = session ? judgeFineCare(session, { quickCare: false }) : false;
        const eco = { objects: save.objects, coins, fineCareCount: save.fineCareCount };
        const result = completeCareV2(eco, { objectId, now, fineCare: fine });
        coins = eco.coins;
        save.fineCareCount = eco.fineCareCount;
        if (!result.ok) return result;
        persist();
        return result;
      },
      async harvestV2(payload: HarvestV2Payload): Promise<HarvestV2Result> {
        const seed = MockWeather.seedForDate(MockWeather.dateKey(now));
        const result = harvestV2Domain({ objects: save.objects, collection: save.collection, spores: save.spores }, payload.objectId, payload.cutQuality, now, seed);
        if (!result.ok) return result;
        coins += result.coins ?? 0;
        persist();
        return result;
      },
      async plantSpore(payload: PlantSporePayload) {
        ensureDailyRecord();
        const record = todayRecord();
        const result = plantSpore(
          { objects: save.objects, spores: save.spores ?? {}, planted: save.planted ?? {}, todayRecord: todayRecord(), now },
          payload.objectId,
          payload.species,
        );
        if (result.ok) persist();
        return result.ok
          ? { ok: true as const, message: result.deferred ? '今日额度已满，播种顺延到明天' : '播种成功，下一次自然推进长出' }
          : { ok: false as const, message: result.message };
      },
      async cancelPlant(objectId: string) {
        const result = cancelPlant({ spores: save.spores ?? {}, planted: save.planted ?? {}, todayRecord: todayRecord() }, objectId);
        if (result.ok) persist();
        return result.ok ? { ok: true as const } : { ok: false as const, message: result.message };
      },
      async setOverlayVariant(variant: 'A' | 'B') {
        save.overlayVariant = variant;
        persist();
        return { ok: true as const };
      },
    },
    wallpaper: {
      async status(): Promise<WallpaperView> {
        return composeWallpaper();
      },
      async setEnabled(on: boolean) {
        wallpaper.enabled = on;
        wallpaper.status = on ? 'active' : 'off';
        if (!on) wallpaper.fogMask = undefined;
        const view = composeWallpaper();
        persist();
        return { ok: true as const, view };
      },
      async wipe(payload: { fogMask: string; progress: number }) {
        if (!wallpaper.enabled) return { ok: false as const, message: '壁纸效果未开启' };
        wallpaper.fogMask = payload.fogMask;
        wallpaper.wipeProgressValue = wipeProgress(payload.fogMask);
        const view = composeWallpaper();
        persist();
        return { ok: true as const, view };
      },
    },
    app: {
      async version() { return '0.2.0-mock'; },
      async quit() { /* 浏览器：刷新即可 */ },
      async track() { /* 模拟环境不埋点 */ },
    },
  };

  // 模拟经济状态（挂外层变量，save.player 段在 native 场景中由主进程持有）
  let coins = 24;
  let owned: string[] = [];

  // ---------- 模拟桌面几何（邻接） ----------

  function adjacency(): Map<string, string[]> {
    const points = Object.values(save.objects).map((obj, i) => ({
      id: obj.id,
      x: (i % 4) * 96,
      y: Math.floor(i / 4) * 96,
    }));
    return buildAdjacency(points, { maxDistance: 100, diagonal: false });
  }

  // ---------- 暴露给 dev-entry 的控制面 ----------

  const control: MockDamp = {
    save,
    now: () => now,
    advanceDay() {
      now += DAY;
      ensureDailyRecord();
      // 警报期墙角霉斑按日增长（真实规则）
      if (save.alert?.active) {
        wallpaper.cornerMoldStage = nextCornerMoldStage(wallpaper.cornerMoldStage, true);
      }
      persist();
    },
    selectWeather(key: string) {
      weather.select(key);
      ensureDailyRecord();
      persist();
    },
    weatherPresets: () => WEATHER_PRESETS,
    reset() {
      localStorage.removeItem(MOCK_SAVE_KEY);
      save = buildMockSave(Date.now());
      now = Date.now();
      persist();
      location.reload();
    },
    composeWallpaper,
  };

  (window as unknown as { damp: typeof damp }).damp = damp;
  (window as unknown as { __mockDamp?: MockDamp }).__mockDamp = control;
  return control;
}

// ---------- 模拟像素工具 ----------

let wallpaperPixelsCache: Uint8ClampedArray | null = null;

/** 虚拟原壁纸（480×270 渐变 + 山形），只在内存里，不写任何文件。 */
function mockWallpaperPixels(): Uint8ClampedArray {
  if (wallpaperPixelsCache) return wallpaperPixelsCache;
  const w = 480;
  const h = 270;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const sky = y / h;
      px[i] = 96 + sky * 90;
      px[i + 1] = 150 + sky * 60;
      px[i + 2] = 190 + sky * 50;
      px[i + 3] = 255;
      const ridge = h * 0.62 + Math.sin(x / 40) * 18 + Math.sin(x / 13) * 6;
      if (y > ridge) {
        px[i] = 70;
        px[i + 1] = 96;
        px[i + 2] = 78;
      }
    }
  }
  wallpaperPixelsCache = px;
  return px;
}

function rgbaToDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas.toDataURL('image/png');
}

const iconCache = new Map<string, string>();

/** 虚拟图标：按对象画一个带标签的圆角方块（模拟环境专用，不代表真实文件）。 */
function mockIconDataUrl(obj: NativeObjectSave): string {
  const cached = iconCache.get(obj.id);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const hue = (hashString(obj.id) % 360);
  ctx.fillStyle = `hsl(${hue} 55% 68%)`;
  roundRect(ctx, 12, 22, size - 24, size - 40, 14);
  ctx.fill();
  ctx.fillStyle = `hsl(${hue} 55% 55%)`;
  roundRect(ctx, 12, 22, size - 24, 22, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 30px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(obj.kind === 'dir' ? '📁' : '🔗', size / 2, size / 2 + 12);
  ctx.font = '500 11px "Segoe UI", sans-serif';
  const label = obj.displayName.length > 10 ? `${obj.displayName.slice(0, 9)}…` : obj.displayName;
  ctx.fillText(label, size / 2, size - 14);
  const url = canvas.toDataURL('image/png');
  iconCache.set(obj.id, url);
  return url;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export type { CareSessionState };
