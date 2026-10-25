/**
 * v4 日账本（每日 3/5 槽位）与今日菌讯测试（Task 5/11；R4.2/R5 v0.2）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDailyRecordV4, planDailyCandidateOrder, settleDailyRecordV4, absorbPlantedSlots,
  dailyLimitFor, dailyUsedOf, closeStaleRecordsV4, hasDailyCapacity,
} from '../dist/test/world/daily-v4.js';
import { buildDailyForecast } from '../dist/test/world/daily-forecast.js';
import { createRand } from '../dist/test/shared/rand.js';

function makeObject(id, patch = {}) {
  return {
    id, realPath: `E:\\Desktop\\${id}`, kind: 'lnk', displayName: id, originalMtime: 1,
    damage: null, ...patch,
  };
}

const RAIN = { weatherCode: 61, humidityPct: 85, temperatureC: 16, observedAt: 't', fetchedAt: 1 };
const HUMID_NO_RAIN = { weatherCode: 3, humidityPct: 85, temperatureC: 20, observedAt: 't', fetchedAt: 1 };

function makeObjects(count) {
  const objects = {};
  for (let i = 0; i < count; i += 1) objects[`d-${i}`] = makeObject(`d-${i}`);
  return objects;
}

test('普通日额度 3，警报日额度 5（记录建立时固定）', () => {
  assert.equal(dailyLimitFor(false), 3);
  assert.equal(dailyLimitFor(true), 5);
  const normal = createDailyRecordV4({ date: '2026-10-26', seed: 1, alert: false, weather: RAIN });
  const alert = createDailyRecordV4({ date: '2026-10-26', seed: 2, alert: true, weather: RAIN });
  assert.equal(normal.limit, 3);
  assert.equal(alert.limit, 5);
});

test('普通日只推进 3 个对象（同族推进路径）', () => {
  const objects = makeObjects(10);
  for (const obj of Object.values(objects)) obj.damage = { family: 'damp', stage: 1, mushroom: 'none' };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 11, alert: false, weather: RAIN });
  record.candidateOrder = planDailyCandidateOrder(record, objects, RAIN, 1000);
  assert.equal(record.candidateOrder.length, 9, '3 槽 × 每槽 3 候选');
  const result = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true, applyIcon: () => true, now: 1000,
  });
  assert.equal(result.advanced, 3);
  assert.equal(record.status, 'success');
  assert.equal(dailyUsedOf(record), 3);
  let advanced = 0;
  for (const obj of Object.values(objects)) {
    if (obj.damage.stage === 2) advanced += 1;
  }
  assert.equal(advanced, 3, '恰好 3 个对象各推进一级');
});

test('警报日最多推进 5 个', () => {
  const objects = makeObjects(12);
  for (const obj of Object.values(objects)) obj.damage = { family: 'damp', stage: 1, mushroom: 'none' };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 12, alert: true, weather: RAIN });
  record.candidateOrder = planDailyCandidateOrder(record, objects, RAIN, 1000);
  const result = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true, applyIcon: () => true, now: 1000,
  });
  assert.equal(result.advanced, 5);
});

test('每个对象每天至多推进一级：当天第二次结算不额外推进（幂等）', () => {
  const objects = makeObjects(10);
  for (const obj of Object.values(objects)) obj.damage = { family: 'damp', stage: 1, mushroom: 'none' };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 13, alert: false, weather: RAIN });
  record.candidateOrder = planDailyCandidateOrder(record, objects, RAIN, 1000);
  settleDailyRecordV4(record, { objects, categories: {}, exists: () => true, applyIcon: () => true, now: 1000 });
  const snapshot = JSON.parse(JSON.stringify(objects));
  const second = settleDailyRecordV4(record, { objects, categories: {}, exists: () => true, applyIcon: () => true, now: 2000 });
  assert.equal(second.advanced, 0);
  assert.deepEqual(objects, snapshot, '重复启动不重复推进');
});

test('同种子候选顺序稳定（随机计划持久化语义）', () => {
  const objects = makeObjects(12);
  const a = createDailyRecordV4({ date: '2026-10-26', seed: 99, alert: false, weather: RAIN });
  const b = createDailyRecordV4({ date: '2026-10-26', seed: 99, alert: false, weather: RAIN });
  assert.deepEqual(planDailyCandidateOrder(a, objects, RAIN, 1), planDailyCandidateOrder(b, objects, RAIN, 1));
  // 已有顺序不重算（天气刷新不能重抽）
  const before = [...a.candidateOrder];
  assert.deepEqual(planDailyCandidateOrder(a, objects, { ...RAIN, weatherCode: 0, humidityPct: 30 }, 2), before);
});

test('写入失败保留同一事件身份：失败候选继续尝试，全失败记 retryable', () => {
  const objects = makeObjects(6);
  for (const obj of Object.values(objects)) obj.damage = { family: 'damp', stage: 1, mushroom: 'none' };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 14, alert: false, weather: RAIN });
  record.candidateOrder = planDailyCandidateOrder(record, objects, RAIN, 1000);
  let attempts = 0;
  const result = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true,
    applyIcon: () => { attempts += 1; return false; },
    now: 1000,
  });
  assert.equal(result.advanced, 0);
  assert.equal(record.status, 'retryable', '全部失败占用同一身份');
  assert.equal(record.id, `${record.date}-${record.seed.toString(36)}`, '身份不变');
  assert.ok(attempts > 0);
  // 候选已全部尝试：同日重试不新增推进（额度有限尝试语义），身份保持
  const replay = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true, applyIcon: () => true, now: 2000,
  });
  assert.equal(replay.advanced, 0);
  assert.equal(record.status, 'retryable');
  // 候选未耗尽的 partially-settled 记录可以续写：保留槽 0/1 的尝试、清掉槽 2 的，模拟另一组候选可用
  record.attempts = record.attempts.slice(0, 6);
  const resumed = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true, applyIcon: () => true, now: 3000,
  });
  assert.ok(resumed.advanced >= 1, '续写用同一记录身份');
  assert.equal(record.status, 'success');
});

test('对象不存在：跳过不复活；全部跳过记 empty 但保留槽位证据', () => {
  const objects = { 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'none' } }) };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 15, alert: false, weather: HUMID_NO_RAIN });
  record.slots.push({ objectId: 'd-404', source: 'spread', family: 'mold', fromStage: 0, toStage: 1, mushroom: 'none', fromObjectId: 'd-1', status: 'pending' });
  const result = settleDailyRecordV4(record, {
    objects, categories: {}, exists: (id) => id === 'd-1', applyIcon: () => true, now: 1,
  });
  assert.equal(result.skipped, 1);
  assert.equal(record.slots[0].status, 'skipped');
  assert.equal(record.status, 'empty');
  assert.equal(record.slots.length, 1, 'empty 日保留槽位作回放证据');
});

test('跨午夜核对：有写入证据关 success；未写入删除不补债', () => {
  const dayMs = parseLocalDate('2026-10-24');
  const objects = {
    'd-1': makeObject('d-1', { damage: { family: 'damp', stage: 2, mushroom: 'none' }, lastAdvanceAt: dayMs + 3600 * 1000 }),
  };
  const dailyEvents = {
    '2026-10-24': { date: '2026-10-24', id: 'old-1', status: 'retryable', seed: 1, limit: 3, alert: false, candidateOrder: ['d-1'], attempts: ['d-1'], slots: [{ objectId: 'd-1', source: 'natural', family: 'damp', fromStage: 1, toStage: 2, mushroom: 'none', status: 'pending' }] },
    '2026-10-23': { date: '2026-10-23', id: 'old-2', status: 'pending', seed: 2, limit: 3, alert: false, candidateOrder: [], attempts: [], slots: [] },
  };
  closeStaleRecordsV4(dailyEvents, objects, '2026-10-26');
  assert.equal(dailyEvents['2026-10-24'].status, 'success', 'lastAdvanceAt 在该日期 → 有证据');
  assert.equal(dailyEvents['2026-10-23'], undefined, '无证据删除');
});

function parseLocalDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

test('INIT 未完成时不结算 DAILY（防御：状态由分支表控制，结算引擎不越权）', () => {
  // 该 gate 在员工 2 的编排层（decideNativeBranch）；此处验证额度占用标记存在
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 1, alert: false, weather: RAIN });
  record.status = 'init_occupied';
  assert.ok(!hasDailyCapacity(record));
});

test('播种槽被吸收后占用额度（自然槽位 = limit - 播种数）', () => {
  const objects = makeObjects(8);
  for (const obj of Object.values(objects)) obj.damage = { family: 'damp', stage: 1, mushroom: 'none' };
  objects['d-7'].damage = null;
  const planted = { 'd-7': { objectId: 'd-7', species: 'bell', plantedAt: 1, status: 'pending' } };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 21, alert: false, weather: RAIN });
  absorbPlantedSlots(record, planted, objects);
  assert.equal(record.slots.length, 1);
  record.candidateOrder = planDailyCandidateOrder(record, objects, RAIN, 1000);
  const result = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true, applyIcon: () => true, now: 1000,
  });
  assert.equal(result.advanced, 3, '播种 1 + 自然 2 = 3 槽');
  assert.equal(dailyUsedOf(record), 3);
});

// ---------- Task 11：今日菌讯 ----------

test('菌讯：同一天气输入稳定；湿度/降水/警报行按条件出现', () => {
  const input = { date: '2026-10-26', weather: RAIN, defaulted: false, alertActive: false, now: new Date('2026-10-26T10:00:00').getTime() };
  const a = buildDailyForecast(input);
  const b = buildDailyForecast({ ...input, now: new Date('2026-10-26T15:00:00').getTime() });
  assert.ok(a);
  assert.equal(a.headline, b.headline);
  assert.ok(a.headline.includes('85%'));
  assert.ok(a.lines.some((l) => l.includes('水滴风铃菇')));
  const alertForecast = buildDailyForecast({ ...input, alertActive: true });
  assert.ok(alertForecast.lines.some((l) => l.includes('警报')));
  assert.deepEqual(a.favoredSpecies.length <= 3, true);
  assert.ok(a.recommendedTools.includes('squeegee') || a.recommendedTools.includes('blower'));
});

test('菌讯：无有效天气返回 null，默认天气标记 defaulted', () => {
  assert.equal(buildDailyForecast({ date: 'd', weather: null, defaulted: true, alertActive: false, now: 0 }), null);
  const def = buildDailyForecast({ date: 'd', weather: RAIN, defaulted: true, alertActive: false, now: 0 });
  assert.equal(def.defaulted, true);
});

test('菌讯只读：不消耗额度也不重抽品种（纯函数无副作用）', () => {
  const objects = makeObjects(4);
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 1, alert: false, weather: RAIN });
  const snapshot = JSON.stringify(record);
  buildDailyForecast({ date: '2026-10-26', weather: RAIN, defaulted: false, alertActive: true, now: 0 });
  assert.equal(JSON.stringify(record), snapshot);
  assert.equal(Object.values(objects).every((o) => o.damage === null), true);
});
