/**
 * 回南天警报测试（Task 13；R5.3 v0.2 参数表）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAlert, alertDurationDays, nextCornerMoldStage, alertDailyLimit,
  ALERT_HUMIDITY_THRESHOLD, ALERT_PRECIPITATION_STREAK, IDLE_ALERT,
} from '../dist/test/world/damp-alert.js';

const HUMID = { weatherCode: 3, humidityPct: 92, temperatureC: 20, observedAt: 't-h', fetchedAt: 1 };
const RAIN1 = { weatherCode: 61, humidityPct: 80, temperatureC: 18, observedAt: 't-r1', fetchedAt: 1 };
const RAIN2 = { weatherCode: 63, humidityPct: 82, temperatureC: 18, observedAt: 't-r2', fetchedAt: 2 };
const RAIN3 = { weatherCode: 65, humidityPct: 84, temperatureC: 18, observedAt: 't-r3', fetchedAt: 3 };
const DAY = 24 * 60 * 60 * 1000;

test('湿度达到 90% 阈值时正确触发；阈值常量为 90', () => {
  assert.equal(ALERT_HUMIDITY_THRESHOLD, 90);
  const alert = evaluateAlert(IDLE_ALERT, HUMID, { defaulted: false, now: 1000, seed: 1 });
  assert.ok(alert.active);
  assert.equal(alert.reason, 'humidity');
  assert.equal(alert.startedAt, 1000);
});

test('连续 3 次不同 observedAt 的降水检查可以触发；同一快照刷新不累加', () => {
  assert.equal(ALERT_PRECIPITATION_STREAK, 3);
  let alert = IDLE_ALERT;
  alert = evaluateAlert(alert, RAIN1, { defaulted: false, now: 1, seed: 1 });
  assert.ok(!alert.active);
  alert = evaluateAlert(alert, RAIN1, { defaulted: false, now: 2, seed: 1 });
  assert.equal(alert.precipitationStreak, 1, '同一快照重复刷新不累加');
  alert = evaluateAlert(alert, RAIN2, { defaulted: false, now: 3, seed: 1 });
  alert = evaluateAlert(alert, RAIN3, { defaulted: false, now: 4, seed: 1 });
  assert.ok(alert.active, '连续 3 次不同快照降水触发');
  assert.equal(alert.reason, 'precipitation-streak');
});

test('警报持续 1–3 天（按事件种子）；种子相同结果相同', () => {
  const seen = new Set();
  for (let seed = 0; seed < 60; seed += 1) {
    const days = alertDurationDays(seed);
    assert.ok(days >= 1 && days <= 3);
    assert.equal(days, alertDurationDays(seed));
    seen.add(days);
  }
  assert.ok(seen.size >= 2, '应覆盖多个时长档位');
});

test('警报期间额度 5，普通日 3', () => {
  assert.equal(alertDailyLimit({ active: true, precipitationStreak: 0 }), 5);
  assert.equal(alertDailyLimit(IDLE_ALERT), 3);
});

test('警报有明确结束时间，结束后不会无限持续', () => {
  const alert = evaluateAlert(IDLE_ALERT, HUMID, { defaulted: false, now: 0, seed: 2 });
  assert.ok(alert.endsAt > alert.startedAt);
  const ended = evaluateAlert(alert, { ...HUMID, humidityPct: 60 }, { defaulted: false, now: alert.endsAt, seed: 2 });
  assert.ok(!ended.active, '到期结束');
});

test('警报进行中重复刷新不延长、不重复创建', () => {
  const alert = evaluateAlert(IDLE_ALERT, HUMID, { defaulted: false, now: 0, seed: 3 });
  const again = evaluateAlert(alert, HUMID, { defaulted: false, now: 1000, seed: 4 });
  assert.equal(again.startedAt, alert.startedAt, '保持原警报');
  assert.equal(again.endsAt, alert.endsAt, '不延长');
});

test('时钟回拨：不重复开启已结束的警报；未结束的保持', () => {
  const alert = evaluateAlert(IDLE_ALERT, HUMID, { defaulted: false, now: 5 * DAY, seed: 5 });
  // 回拨到 startedAt 之前
  const rolled = evaluateAlert(alert, HUMID, { defaulted: false, now: 1 * DAY, seed: 6 });
  assert.deepEqual(rolled, alert, '回拨不重建');
  // 已结束 + 回拨
  const finished = { active: false, precipitationStreak: 0 };
  const normal = evaluateAlert(finished, { ...HUMID, humidityPct: 50 }, { defaulted: false, now: 1, seed: 7 });
  assert.ok(!normal.active);
});

test('默认天气与未知天气码不触发警报、不累计连击', () => {
  let alert = evaluateAlert(IDLE_ALERT, RAIN1, { defaulted: true, now: 1, seed: 1 });
  assert.equal(alert.precipitationStreak, 0);
  alert = evaluateAlert(alert, { ...RAIN1, weatherCode: 79 }, { defaulted: false, now: 2, seed: 1 });
  assert.equal(alert.precipitationStreak, 0, '未知码不累计');
  assert.ok(!alert.active);
});

test('非降水天气清零连击', () => {
  let alert = evaluateAlert(IDLE_ALERT, RAIN1, { defaulted: false, now: 1, seed: 1 });
  alert = evaluateAlert(alert, RAIN2, { defaulted: false, now: 2, seed: 1 });
  assert.equal(alert.precipitationStreak, 2);
  alert = evaluateAlert(alert, { ...RAIN1, weatherCode: 1, observedAt: 't-c' }, { defaulted: false, now: 3, seed: 1 });
  assert.equal(alert.precipitationStreak, 0);
});

test('墙角霉斑：只在警报期增长、封顶 3、结束不清除', () => {
  assert.equal(nextCornerMoldStage(0, false), 0);
  assert.equal(nextCornerMoldStage(0, true), 1);
  assert.equal(nextCornerMoldStage(2, true), 3);
  assert.equal(nextCornerMoldStage(3, true), 3);
  assert.equal(nextCornerMoldStage(2, false), 2, '警报结束不清除');
});
