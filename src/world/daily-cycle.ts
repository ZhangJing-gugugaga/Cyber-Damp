/**
 * v4 每日编排（R4.2；员工 1 审查后新增，员工 2 主进程与浏览器模拟共用同一实现）
 *
 * 顺序（契约）：暂停检查 → 警报评估 → 复活/创建当日唯一记录 → 吸收播种 →
 * 规划蔓延（占用剩余额度）→ 规划自然候选 → 结算 → 播种标记完成。
 * 全部依赖注入（时钟、种子、存在性、图标写入、邻接、类别），零 Electron 依赖；
 * 幂等：同日重复调用不会重复推进（记录终态直接返回）。
 */
import type { NativeSaveSection } from '../shared/types/save';
import type { NativeWeatherSnapshot } from '../shared/types/native';
import type {
  AlertState, DailyEventRecordV4, ObjectCategory,
} from '../shared/types/gameplay';
import type { DamageFamily, DamageStage } from '../shared/types/native';
import { evaluateAlert } from './damp-alert';
import {
  absorbPlantedSlots, closeStaleRecordsV4, createDailyRecordV4, isDailyTerminal,
  planDailyCandidateOrder, settleDailyRecordV4, dailyUsedOf,
} from './daily-v4';
import { insertSpreadSlots, planSpreadPairs, isSpreadSource } from './mold-spread';
import { createRand, localDateKey } from './native-events';
import { hashString } from '../shared/rand';
import { KNOWN_WMO_CODES } from '../shared/types/native';

export interface DailyCycleDeps {
  /** 存档 native 段（对象、日账本、播种、警报、暂停、lastSnapshot） */
  native: NativeSaveSection;
  weather: NativeWeatherSnapshot;
  /** 内置默认/未知天气：不触发警报、不产生自然事件 */
  weatherDefaulted: boolean;
  now: number;
  /** 当日事件种子（生产建议：存档种子 + 日期派生） */
  seed: number;
  categories: Record<string, ObjectCategory>;
  exists(objectId: string): boolean;
  applyIcon(objectId: string, plan: {
    family: DamageFamily; stage: DamageStage; mushroom: string; species?: string;
  }): boolean;
  /** 桌面邻接（真实坐标计算；缺省则不做蔓延） */
  adjacency?: Map<string, string[]>;
  log?(message: string): void;
}

export interface DailyCycleResult {
  action: 'paused' | 'wait-weather' | 'terminal' | 'settled' | 'created';
  advanced: number;
  skipped: number;
  alert: AlertState;
  record: DailyEventRecordV4 | null;
  dailyUsed: number;
  spreadInserted: number;
}

/**
 * 跑一次当日编排。调用方负责把 native 段落盘（本函数只改内存状态）。
 * 主进程接线时把 applyIcon 换成图标合成/写入、adjacency 换成真实桌面坐标邻接。
 */
export function runDailyCycleV4(deps: DailyCycleDeps): DailyCycleResult {
  const { native } = deps;
  const log = deps.log ?? (() => {});
  const date = localDateKey(deps.now);
  native.lastSnapshot = deps.weather;

  // 跨午夜核对：旧 pending/retryable 关闭（有证据 success / 无证据删除，不补债）
  const v4Events: Record<string, DailyEventRecordV4> = {};
  for (const [key, record] of Object.entries(native.dailyEvents ?? {})) {
    if ('slots' in record) v4Events[key] = record;
  }
  closeStaleRecordsV4(v4Events, native.objects, date);

  const initialAlert = native.alert ?? { active: false, precipitationStreak: 0 };
  if (native.paused) {
    return { action: 'paused', advanced: 0, skipped: 0, alert: initialAlert, record: null, dailyUsed: 0, spreadInserted: 0 };
  }
  // R3/R5：内置默认或未知天气码不生成自然事件、不触发/累计警报（分支表在编排层，防守在此）
  if (deps.weatherDefaulted || !KNOWN_WMO_CODES.has(deps.weather.weatherCode)) {
    return { action: 'wait-weather', advanced: 0, skipped: 0, alert: initialAlert, record: null, dailyUsed: 0, spreadInserted: 0 };
  }

  // 警报评估（默认天气不触发、不累计连击）
  const alert = evaluateAlert(
    initialAlert,
    deps.weatherDefaulted ? null : deps.weather,
    { defaulted: deps.weatherDefaulted, now: deps.now, seed: deps.seed },
  );
  native.alert = alert;

  const existing = v4Events[date] ?? null;
  if (existing && isDailyTerminal(existing)) {
    return {
      action: 'terminal', advanced: 0, skipped: 0, alert,
      record: existing, dailyUsed: dailyUsedOf(existing), spreadInserted: 0,
    };
  }

  const record = existing ?? createDailyRecordV4({
    date,
    seed: deps.seed,
    alert: alert.active,
    weather: deps.weather,
  });
  native.dailyEvents[date] = record;
  native.spores = native.spores ?? {};
  native.planted = native.planted ?? {};

  // 1) 播种吸收（当日剩余槽位优先，否则保持 pending 顺延）
  absorbPlantedSlots(record, native.planted, native.objects);

  // 2) 蔓延规划：只用剩余额度，源=未清理重度霉变，目标=干净邻接
  let spreadInserted = 0;
  if (deps.adjacency) {
    const remaining = Math.max(0, record.limit - record.slots.length);
    if (remaining > 0) {
      const sources = Object.values(native.objects).filter(isSpreadSource).map((o) => o.id);
      const rand = createRand(hashString(`${record.seed}:spread`) >>> 0);
      const pairs = planSpreadPairs(sources, native.objects, deps.adjacency, deps.weather, deps.now, remaining, rand);
      spreadInserted = insertSpreadSlots(record, pairs, native.objects);
    }
  }

  // 3) 自然候选 + 结算（每对象每天至多一步；写入失败保留同一身份）
  planDailyCandidateOrder(record, native.objects, deps.weather, deps.now);
  const { advanced, skipped } = settleDailyRecordV4(record, {
    objects: native.objects,
    categories: deps.categories,
    exists: deps.exists,
    applyIcon: deps.applyIcon,
    now: deps.now,
    log,
  });

  // 4) 播种槽结算成功后标记 completed
  for (const slot of record.slots) {
    if (slot.source === 'planted' && slot.status === 'success' && native.planted[slot.objectId]) {
      native.planted[slot.objectId].status = 'completed';
    }
  }

  return {
    action: existing ? 'settled' : 'created',
    advanced,
    skipped,
    alert,
    record,
    dailyUsed: dailyUsedOf(record),
    spreadInserted,
  };
}
