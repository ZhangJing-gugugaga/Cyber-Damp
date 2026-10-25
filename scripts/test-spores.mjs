/**
 * 采菇、孢子与播种测试（Task 9；R5.1/R6 v0.2 参数表）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  harvestV2, plantSpore, cancelPlant, markPlantedCompleted, completeCareV2,
} from '../dist/test/world/spores.js';
import { createDailyRecordV4, absorbPlantedSlots, settleDailyRecordV4 } from '../dist/test/world/daily-v4.js';

function makeObject(id, patch = {}) {
  return {
    id, realPath: `E:\\Desktop\\${id}`, kind: 'lnk', displayName: id, originalMtime: 1,
    damage: null, ...patch,
  };
}

function makeState(objects) {
  return { objects, collection: {}, spores: {}, planted: {}, coins: 0 };
}

const WEATHER = { weatherCode: 61, humidityPct: 88, temperatureC: 16, observedAt: 't1', fetchedAt: 1 };

test('成熟菇可以正常采摘：+4 币、进收藏；损伤仍保留', () => {
  const state = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'bell' }) });
  const result = harvestV2(state, 'd-1', 0.9, 1000, 42);
  assert.ok(result.ok);
  assert.equal(result.coins, 4);
  assert.equal(result.species, 'bell');
  const obj = state.objects['d-1'];
  assert.equal(obj.damage.stage, 3, '采摘不清除损伤');
  assert.equal(obj.damage.mushroom, 'none', '只移除菇实例');
  assert.equal(state.collection.bell.sourceName, 'd-1');
});

test('先护理后采摘与先采摘后护理互不干扰（顺序无关）', () => {
  const a = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'bell', careProgress: 0.5 }) });
  // 先护理（直接改进度模拟）再采摘
  a.objects['d-1'].careProgress = 1;
  harvestV2(a, 'd-1', 0.9, 1, 1);
  assert.equal(a.objects['d-1'].damage.mushroom, 'none');
  assert.equal(a.objects['d-1'].careProgress, 1);
  // 先采摘再护理
  const b = makeState({ 'd-2': makeObject('d-2', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'bell', careProgress: 0 }) });
  harvestV2(b, 'd-2', 0.9, 1, 1);
  b.objects['d-2'].careProgress = 1;
  assert.equal(b.objects['d-2'].damage.mushroom, 'none');
});

test('重复采摘不重复给币（第二次失败）', () => {
  const state = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'bell' }) });
  assert.ok(harvestV2(state, 'd-1', 0.9, 1, 1).ok);
  const again = harvestV2(state, 'd-1', 0.9, 2, 1);
  assert.equal(again.ok, false);
});

test('剪得准（≥0.6）按存档种子 50% 掉孢子；同种子同结果；重复点击不能刷孢子', () => {
  // 找一个会掉孢子的种子与一个不会的种子
  let dropsSeed = null;
  let noDropSeed = null;
  for (let seed = 0; seed < 200 && (!dropsSeed || !noDropSeed); seed += 1) {
    const state = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'bell' }) });
    const result = harvestV2(state, 'd-1', 0.8, 1, seed);
    if (result.spore && dropsSeed === null) dropsSeed = seed;
    if (!result.spore && noDropSeed === null) noDropSeed = seed;
  }
  assert.ok(dropsSeed !== null && noDropSeed !== null, '50% 掉落应有两个方向的结果');
  // 确定性：同种子重放一致
  const replay = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'bell' }) });
  assert.equal(harvestV2(replay, 'd-1', 0.8, 1, dropsSeed).spore, 'bell');
  // 剪歪（<0.6）不掉孢子
  const crooked = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'bell' }) });
  assert.equal(harvestV2(crooked, 'd-1', 0.3, 1, dropsSeed).spore, undefined);
  // 旧品种不掉孢子
  const legacy = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'oyster' }) });
  assert.equal(harvestV2(legacy, 'd-1', 0.99, 1, dropsSeed).spore, undefined);
});

test('播种：扣 1 孢子、登记 pending；孢子不足/对象不存在失败不扣', () => {
  const obj = makeObject('d-2');
  const deps = {
    objects: { 'd-2': obj },
    spores: { bell: 1 },
    planted: {},
    todayRecord: null,
    now: 100,
  };
  const bad = plantSpore(deps, 'd-2', 'moss');
  assert.equal(bad.ok, false, '孢子不足');
  assert.equal(deps.spores.moss, undefined);
  deps.spores.moss = 2;
  const missing = plantSpore(deps, 'd-404', 'moss');
  assert.equal(missing.ok, false, '对象不在桌面');
  assert.equal(deps.spores.moss, 2);
  const ok = plantSpore(deps, 'd-2', 'moss');
  assert.ok(ok.ok);
  assert.equal(deps.spores.moss, 1);
  assert.equal(deps.planted['d-2'].status, 'pending');
  // 同对象重复播种拒绝
  const dup = plantSpore(deps, 'd-2', 'bell');
  assert.equal(dup.ok, false);
});

test('播种占用当日额度：额度未满立即插槽；额度满顺延次日', () => {
  const objects = { 'd-1': makeObject('d-1') };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 5, alert: false, weather: WEATHER });
  const deps = { objects, spores: { bell: 5 }, planted: {}, todayRecord: record, now: 100 };
  // 占满 3 个普通日槽位（直接插入 pending 槽模拟）
  for (let i = 0; i < 3; i += 1) {
    record.slots.push({ objectId: `d-x${i}`, source: 'natural', family: 'damp', fromStage: 0, toStage: 1, mushroom: 'none', status: 'pending' });
  }
  const deferred = plantSpore(deps, 'd-1', 'bell');
  assert.ok(deferred.ok);
  assert.equal(deferred.deferred, true, '额度满应顺延');
  assert.equal(record.slots.length, 3, '不应挤占今日槽位');
  assert.equal(deps.planted['d-1'].eventId, undefined);
  // 次日新记录吸收
  const tomorrow = createDailyRecordV4({ date: '2026-10-27', seed: 6, alert: false, weather: WEATHER });
  absorbPlantedSlots(tomorrow, deps.planted, objects);
  assert.equal(tomorrow.slots.length, 1);
  assert.equal(tomorrow.slots[0].source, 'planted');
  assert.equal(deps.planted['d-1'].eventId, tomorrow.id);
  // 播种槽结算：长出指定品种
  const applied = [];
  const result = settleDailyRecordV4(tomorrow, {
    objects,
    categories: {},
    exists: () => true,
    applyIcon: (id, plan) => { applied.push(plan); return true; },
    now: 200,
  });
  assert.equal(result.advanced, 1);
  assert.equal(objects['d-1'].damage.mushroom, 'young');
  assert.equal(objects['d-1'].mushroomSpecies, 'bell');
  markPlantedCompleted(deps.planted, 'd-1');
  assert.equal(deps.planted['d-1'].status, 'completed');
});

test('取消播种：只退 pending，退 1 枚孢子并移除未结算槽位', () => {
  const objects = { 'd-1': makeObject('d-1') };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 5, alert: false, weather: WEATHER });
  const deps = { objects, spores: { bell: 1 }, planted: {}, todayRecord: record, now: 100 };
  plantSpore(deps, 'd-1', 'bell');
  assert.equal(record.slots.length, 1);
  const cancel = cancelPlant(deps, 'd-1');
  assert.ok(cancel.ok);
  assert.equal(cancel.refunded, 'bell');
  assert.equal(deps.spores.bell, 1);
  assert.equal(record.slots.length, 0);
  // 再取消失败
  assert.equal(cancelPlant(deps, 'd-1').ok, false);
});

test('播种槽遇到已有蘑菇的对象：跳过不覆盖', () => {
  const objects = { 'd-1': makeObject('d-1', { damage: { family: 'mold', stage: 3, mushroom: 'young' }, mushroomSpecies: 'undo' }) };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 5, alert: true, weather: WEATHER });
  record.slots.push({ objectId: 'd-1', source: 'planted', family: 'mold', fromStage: 3, toStage: 3, mushroom: 'young', species: 'bell', status: 'pending' });
  const result = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true, applyIcon: () => true, now: 1,
  });
  assert.equal(result.advanced, 0);
  assert.equal(objects['d-1'].mushroomSpecies, 'undo', '已有品种不被覆盖');
});

test('精细护理完成：+2 币、光泽 24h、防霉 240h；重复完成被拒绝', () => {
  const state = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'damp', stage: 2, mushroom: 'none' } }) });
  state.coins = 10;
  const result = completeCareV2(state, { objectId: 'd-1', now: 1000, fineCare: true });
  assert.ok(result.ok);
  assert.equal(result.fine, true);
  assert.equal(result.bonusCoins, 2);
  assert.equal(state.coins, 12);
  assert.equal(state.objects['d-1'].glossUntil, 1000 + 24 * 3600 * 1000);
  assert.equal(state.objects['d-1'].moldImmuneUntil, 1000 + 240 * 3600 * 1000);
  assert.equal(state.objects['d-1'].damage.stage, 0, '损伤清零但菇保留');
  const again = completeCareV2(state, { objectId: 'd-1', now: 2000, fineCare: true });
  assert.equal(again.ok, false, '重复结算不发奖');
});

test('快速处理完成：不发光泽与加成，仍刷新防霉', () => {
  const state = makeState({ 'd-1': makeObject('d-1', { damage: { family: 'damp', stage: 1, mushroom: 'none' } }) });
  state.coins = 10;
  const result = completeCareV2(state, { objectId: 'd-1', now: 1000, fineCare: false });
  assert.ok(result.ok);
  assert.equal(result.fine, false);
  assert.equal(result.bonusCoins, undefined);
  assert.equal(state.coins, 10);
  assert.equal(state.objects['d-1'].glossUntil, undefined);
  assert.equal(state.objects['d-1'].moldImmuneUntil, 1000 + 240 * 3600 * 1000);
});
