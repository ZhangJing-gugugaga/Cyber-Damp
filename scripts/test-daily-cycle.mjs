/**
 * 每日编排测试（daily-cycle；R4.2 顺序与幂等、蔓延/播种占额度、警报评估）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDailyCycleV4 } from '../dist/test/world/daily-cycle.js';
import { buildAdjacency } from '../dist/test/world/mold-spread.js';
import { migrateSave } from '../dist/test/shared/save/save-schema.js';

const RAIN = { weatherCode: 63, humidityPct: 92, temperatureC: 17, observedAt: '2026-10-26T10:00:00Z', fetchedAt: 1 };
/** 非警报降雨（RH<90，普通日额度 3） */
const RAIN_NORMAL = { ...RAIN, humidityPct: 85 };
const SUNNY = { weatherCode: 0, humidityPct: 42, temperatureC: 31, observedAt: '2026-10-26T10:00:00Z', fetchedAt: 1 };

function makeNative(objects) {
  return {
    init: { status: 'legacy-initialized' },
    dailyEvents: {},
    objects,
    lastSnapshot: null,
    paused: false,
    spores: {},
    planted: {},
    alert: { active: false, precipitationStreak: 0 },
  };
}

function obj(id, patch = {}) {
  return { id, realPath: `E:\\Desktop\\${id}`, kind: 'lnk', displayName: id, originalMtime: 1, damage: null, ...patch };
}

test('暂停：不创建记录、不推进、警报保持', () => {
  const native = makeNative({ 'd-1': obj('d-1') });
  native.paused = true;
  const result = runDailyCycleV4({
    native, weather: RAIN, weatherDefaulted: false, now: new Date('2026-10-26T10:00:00').getTime(),
    seed: 1, categories: {}, exists: () => true, applyIcon: () => true,
  });
  assert.equal(result.action, 'paused');
  assert.equal(result.advanced, 0);
  assert.deepEqual(native.dailyEvents, {});
});

test('同日第二次调用幂等：不重复推进（终态直接返回）', () => {
  const objects = {};
  for (let i = 0; i < 8; i += 1) objects[`d-${i}`] = obj(`d-${i}`, { damage: { family: 'damp', stage: 1, mushroom: 'none' } });
  const native = makeNative(objects);
  const now = new Date('2026-10-26T10:00:00').getTime();
  const deps = { native, weather: RAIN_NORMAL, weatherDefaulted: false, now, seed: 7, categories: {}, exists: () => true, applyIcon: () => true };
  const first = runDailyCycleV4(deps);
  assert.equal(first.advanced, 3, '普通日 3 个');
  const snapshot = JSON.stringify(native.objects);
  const second = runDailyCycleV4(deps);
  assert.equal(second.action, 'terminal');
  assert.equal(second.advanced, 0);
  assert.equal(JSON.stringify(native.objects), snapshot);
});

test('默认天气：不创建自然事件、不触发警报（R3/R5）', () => {
  const objects = { 'd-1': obj('d-1') };
  const native = makeNative(objects);
  const result = runDailyCycleV4({
    native, weather: { ...RAIN, humidityPct: 95 }, weatherDefaulted: true,
    now: new Date('2026-10-26T10:00:00').getTime(), seed: 3, categories: {}, exists: () => true, applyIcon: () => true,
  });
  assert.equal(result.action, 'wait-weather');
  assert.equal(result.advanced, 0);
  assert.equal(result.alert.active, false, '默认天气不触发警报');
  assert.deepEqual(native.dailyEvents, {}, '默认天气不创建日账本');
});

test('高湿有效快照触发警报且当日额度 5', () => {
  const objects = {};
  for (let i = 0; i < 8; i += 1) objects[`d-${i}`] = obj(`d-${i}`, { damage: { family: 'damp', stage: 1, mushroom: 'none' } });
  const native = makeNative(objects);
  const result = runDailyCycleV4({
    native, weather: { ...RAIN, humidityPct: 93 }, weatherDefaulted: false,
    now: new Date('2026-10-26T10:00:00').getTime(), seed: 4, categories: {}, exists: () => true, applyIcon: () => true,
  });
  assert.equal(result.alert.active, true);
  assert.equal(result.record.limit, 5);
  assert.equal(result.advanced, 5);
});

test('蔓延走邻接：重度霉变邻接干净对象占用额度，总额度不超', () => {
  const objects = {
    src: obj('src', { damage: { family: 'mold', stage: 3, mushroom: 'none' } }),
    near1: obj('near1'),
    near2: obj('near2'),
    far: obj('far'),
  };
  const adjacency = buildAdjacency([
    { id: 'src', x: 0, y: 0 }, { id: 'near1', x: 90, y: 0 }, { id: 'near2', x: 0, y: 90 }, { id: 'far', x: 900, y: 900 },
  ], { maxDistance: 100, diagonal: false });
  const native = makeNative(objects);
  const result = runDailyCycleV4({
    native, weather: RAIN, weatherDefaulted: false,
    now: new Date('2026-10-26T10:00:00').getTime(), seed: 9, categories: {},
    exists: () => true, applyIcon: () => true, adjacency,
  });
  assert.ok(result.spreadInserted >= 1, '应有蔓延槽');
  assert.ok(result.advanced <= result.record.limit, '总额度不超 limit');
  assert.ok(objects.near1.damage || objects.near2.damage, '邻接对象被蔓延');
  assert.ok(!result.record.slots.some((s) => s.source === 'spread' && s.objectId === 'far'), '远距离对象没有蔓延槽');
});

test('播种在当日循环里被吸收：长出指定品种（额度允许时当日生效）', () => {
  const objects = { 'd-1': obj('d-1') };
  const native = makeNative(objects);
  native.spores = { bell: 1 };
  native.planted = { 'd-1': { objectId: 'd-1', species: 'bell', plantedAt: 1, status: 'pending' } };
  const result = runDailyCycleV4({
    native, weather: RAIN, weatherDefaulted: false,
    now: new Date('2026-10-26T10:00:00').getTime(), seed: 11, categories: {}, exists: () => true, applyIcon: () => true,
  });
  assert.equal(objects['d-1'].mushroomSpecies, 'bell');
  assert.equal(objects['d-1'].damage.mushroom, 'young');
  assert.equal(native.planted['d-1'].status, 'completed');
  assert.equal(result.dailyUsed, 1);
});

test('INIT 未完成（进行中/未生成）不创建当天 DAILY 记录（R4.1；员工2审查#2）', () => {
  const objects = { 'd-1': obj('d-1') };
  const now = new Date('2026-10-26T10:00:00').getTime();
  for (const init of [
    { status: 'active', k: 5, n: 5, seed: 1, targets: [], snapshot: RAIN, generatedAt: 1 },
    null,
  ]) {
    const native = makeNative(objects);
    native.init = init;
    const result = runDailyCycleV4({
      native, weather: RAIN_NORMAL, weatherDefaulted: false, now, seed: 1,
      categories: {}, exists: () => true, applyIcon: () => true,
    });
    assert.equal(result.action, 'wait-init');
    assert.equal(result.advanced, 0);
    assert.deepEqual(native.dailyEvents, {}, 'INIT 期间不发 DAILY');
  }
  // legacy-initialized 与 completed 正常发放
  for (const init of [
    { status: 'legacy-initialized' },
    { status: 'completed', k: 5, n: 5, seed: 1, targets: [], snapshot: RAIN, generatedAt: 1, completedAt: 2 },
  ]) {
    const native = makeNative({ 'd-1': obj('d-1') });
    native.init = init;
    const result = runDailyCycleV4({
      native, weather: RAIN_NORMAL, weatherDefaulted: false, now, seed: 2,
      categories: {}, exists: () => true, applyIcon: () => true,
    });
    assert.equal(result.action, 'created');
  }
});

test('重启读档不抹账本：cycle → migrateSave → 再 cycle，记录与额度不变（员工2审查#1）', () => {
  const objects = {};
  for (let i = 0; i < 8; i += 1) objects[`d-${i}`] = obj(`d-${i}`, { damage: { family: 'damp', stage: 1, mushroom: 'none' } });
  const native = makeNative(objects);
  const now = new Date('2026-10-26T10:00:00').getTime();
  const deps = { native, weather: RAIN_NORMAL, weatherDefaulted: false, now, seed: 21, categories: {}, exists: () => true, applyIcon: () => true };
  const first = runDailyCycleV4(deps);
  assert.equal(first.advanced, 3);
  const recordBefore = JSON.parse(JSON.stringify(native.dailyEvents['2026-10-26']));
  assert.equal(recordBefore.limit, 3);
  assert.equal(recordBefore.slots.length, 3);

  // 完整存档包一层，走真实读档迁移路径
  const save = {
    schemaVersion: 3, savedAt: now,
    player: { coins: 24, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'changsha', migratedOn: '2026-10-26' },
    files: [], ropes: [], stats: { harvested: 0, earned: 0, playedMs: 0 },
    native: JSON.parse(JSON.stringify(native)),
  };
  const migrated = migrateSave(save);
  assert.ok(migrated);
  const recordAfter = migrated.native.dailyEvents['2026-10-26'];
  assert.deepEqual(recordAfter, recordBefore, 'v4 记录读档后原样保留（limit/slots/seed 不重写）');
  assert.equal(migrated.schemaVersion, 3);

  // 读档后再跑一次：终态，不重复推进
  const again = runDailyCycleV4({
    ...deps,
    native: migrated.native,
  });
  assert.equal(again.action, 'terminal');
  assert.equal(again.advanced, 0);
  assert.deepEqual(migrated.native.dailyEvents['2026-10-26'], recordBefore);
});

test('写入全失败：维持同一事件身份（retryable），不创建第二个记录', () => {
  const objects = {};
  for (let i = 0; i < 6; i += 1) objects[`d-${i}`] = obj(`d-${i}`, { damage: { family: 'damp', stage: 1, mushroom: 'none' } });
  const native = makeNative(objects);
  const now = new Date('2026-10-26T10:00:00').getTime();
  const deps = { native, weather: RAIN_NORMAL, weatherDefaulted: false, now, seed: 12, categories: {}, exists: () => true, applyIcon: () => false };
  const first = runDailyCycleV4(deps);
  assert.equal(first.advanced, 0);
  const date = '2026-10-26';
  const id = native.dailyEvents[date].id;
  assert.equal(native.dailyEvents[date].status, 'retryable');
  const second = runDailyCycleV4(deps);
  assert.equal(native.dailyEvents[date].id, id, '同一事件身份');
  assert.equal(Object.keys(native.dailyEvents).length, 1);
  assert.equal(second.advanced, 0);
});
