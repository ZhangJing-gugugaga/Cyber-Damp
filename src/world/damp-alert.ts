/**
 * 回南天警报（R5.3 v0.2；Task 13 纯领域逻辑）
 *
 * 触发（参数表）：有效快照 RH ≥ 90%，或连续 3 次不同 observedAt 的降水码检查；
 * 持续 1–3 天（按事件种子）；警报期间日额度 5、开放雨神之冠、壁纸效果加重。
 * 警报不是任务；默认天气/未知码不触发也不累计降水连击；
 * 同一快照反复刷新不累加；时钟回拨不重复开启已结束的警报；
 * 警报状态持久化，结束不清除已有损伤/菇状态（本模块只管警报本身）。
 */
import type { AlertState } from '../shared/types/gameplay';
import type { NativeWeatherSnapshot } from '../shared/types/native';
import { KNOWN_WMO_CODES, PRECIPITATION_CODES } from '../shared/types/native';
import { createRand, hashString } from '../shared/rand';

export const ALERT_HUMIDITY_THRESHOLD = 90;
export const ALERT_PRECIPITATION_STREAK = 3;
/** 警报持续时间 1–3 天（按事件种子），以 24h 计 */
export const ALERT_DURATION_DAY_MS = 24 * 60 * 60 * 1000;

export const IDLE_ALERT: AlertState = { active: false, precipitationStreak: 0 };

function isPrecipitation(code: number): boolean {
  return PRECIPITATION_CODES.has(code);
}

/** 本次激活的持续天数（1–3，事件种子决定；同种子同结果）。 */
export function alertDurationDays(seed: number): number {
  const rand = createRand(hashString(`alert:${seed}`) >>> 0);
  return 1 + Math.floor(rand() * 3);
}

/**
 * 评估警报状态（纯函数，返回新状态；调用方负责持久化）。
 *
 * @param prev 持久化的当前警报状态
 * @param snapshot 最新有效天气快照；null/默认天气传 defaulted=true
 * @param now 当前时间戳
 * @param seed 本次激活的事件种子（建议：存档种子 + 日期派生）
 */
export function evaluateAlert(
  prev: AlertState,
  snapshot: NativeWeatherSnapshot | null,
  options: { defaulted: boolean; now: number; seed: number },
): AlertState {
  const now = options.now;
  // 时钟回拨保护：startedAt 在"未来"说明回拨，不重复开启（R4.3 同语义）
  const rollback = prev.active && prev.startedAt !== undefined && prev.startedAt > now;
  // 1) 进行中的警报：到期自然结束
  if (prev.active && !rollback) {
    if (prev.endsAt !== undefined && now >= prev.endsAt) {
      return { active: false, precipitationStreak: prev.precipitationStreak, lastObservedAt: prev.lastObservedAt };
    }
    // 未到期保持（湿度回落不提前解除；重复触发不延长）
    return prev;
  }
  if (rollback) return prev;
  // 2) 降水连击累计：同一 observedAt 的刷新不累加（契约审阅意见）
  let streak = prev.precipitationStreak;
  let lastObservedAt = prev.lastObservedAt;
  const usable = snapshot !== null && !options.defaulted && KNOWN_WMO_CODES.has(snapshot.weatherCode);
  if (usable && snapshot) {
    if (isPrecipitation(snapshot.weatherCode)) {
      if (lastObservedAt !== snapshot.observedAt) {
        streak += 1;
        lastObservedAt = snapshot.observedAt;
      }
    } else {
      streak = 0;
      lastObservedAt = snapshot.observedAt;
    }
  }
  // 3) 触发判定：未知码/默认天气不触发（湿度路径同样要求 usable）
  const humidityTrigger = usable && snapshot !== null && snapshot.humidityPct >= ALERT_HUMIDITY_THRESHOLD;
  const streakTrigger = streak >= ALERT_PRECIPITATION_STREAK;
  if (humidityTrigger || streakTrigger) {
    const days = alertDurationDays(options.seed);
    return {
      active: true,
      startedAt: now,
      endsAt: now + days * ALERT_DURATION_DAY_MS,
      reason: humidityTrigger ? 'humidity' : 'precipitation-streak',
      precipitationStreak: streak,
      lastObservedAt: snapshot?.observedAt ?? lastObservedAt,
    };
  }
  return { active: false, precipitationStreak: streak, lastObservedAt };
}

/** 警报期间的日额度（5）；普通日 3。 */
export function alertDailyLimit(alert: AlertState): 3 | 5 {
  return alert.active ? 5 : 3;
}

/**
 * 墙角霉斑等级（0–3，WallpaperView 口径）：只在警报期按日增长，封顶 3；
 * 非警报日不增长也不倒退（警报结束不清除已有状态）。
 */
export function nextCornerMoldStage(current: 0 | 1 | 2 | 3, alertActive: boolean): 0 | 1 | 2 | 3 {
  if (!alertActive) return current;
  return Math.min(3, current + 1) as 0 | 1 | 2 | 3;
}
