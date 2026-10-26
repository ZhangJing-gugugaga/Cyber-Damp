/**
 * 主进程 v4 接线的前提（员工 2）：native-event-scheduler.executeDailyV4 先在存档深拷贝上
 * 预演 runDailyCycleV4 收集图标计划、异步合成 ICO，再在真实存档上同输入正式结算。
 * 本测试锁定"预演计划 == 正式计划"，以及正式结算写入失败时不会多推进。
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDailyCycleV4 } from '../dist/test/world/daily-cycle.js';
import { adjacencyFromDesktop } from '../dist/test/shared/desktop-adjacency.js';

const NOW = new Date(2026, 9, 26, 10).getTime();
// 湿度 85%：降雨但未达警报阈值（90%），普通日额度 3
const RAIN = { weatherCode: 61, humidityPct: 85, temperatureC: 17, observedAt: '2026-10-26T10:00', fetchedAt: NOW };
const ALERT_RAIN = { ...RAIN, humidityPct: 93 };

function makeNative() {
  const objects = {};
  const coords = [];
  for (let i = 0; i < 12; i += 1) {
    const id = `d-${i}`;
    objects[id] = { id, realPath: `E:\\Desktop\\${id}`, kind: 'lnk', displayName: id, originalMtime: 1000 + i, damage: null };
    coords.push({ id, x: 20 + (i % 3) * 90, y: 10 + Math.floor(i / 3) * 90 });
  }
  objects['d-4'].damage = { family: 'mold', stage: 3, mushroom: 'none' }; // 蔓延源
  objects['d-7'].damage = { family: 'mold', stage: 3, mushroom: 'young' };
  objects['d-7'].mushroomSpecies = 'moss';
  return {
    native: {
      init: { status: 'legacy-initialized' }, dailyEvents: {}, objects, lastSnapshot: null,
      spores: {}, planted: { 'd-9': { objectId: 'd-9', species: 'lantern', plantedAt: NOW - 86400e3, status: 'pending' } },
    },
    adjacency: adjacencyFromDesktop(coords),
  };
}

function deps(native, adjacency, applyIcon, overrides = {}) {
  return {
    native, weather: RAIN, weatherDefaulted: false, now: NOW, seed: 4242,
    categories: Object.fromEntries(Object.keys(native.objects).map((id) => [id, 'other'])),
    exists: () => true, adjacency, applyIcon, ...overrides,
  };
}

const planOf = (id, plan, native) => `${id}|${plan.family}-${plan.stage}-${plan.mushroom}-${plan.species ?? native.objects[id]?.mushroomSpecies ?? ''}`;

test('预演计划与正式计划逐项一致（含播种、蔓延、自然槽）', () => {
  const { native, adjacency } = makeNative();
  const rehearsal = structuredClone(native);
  const planned = [];
  runDailyCycleV4(deps(rehearsal, adjacency, (id, plan) => { planned.push(planOf(id, plan, rehearsal)); return true; }));
  const actual = [];
  const result = runDailyCycleV4(deps(native, adjacency, (id, plan) => { actual.push(planOf(id, plan, native)); return true; }));
  assert.ok(planned.length >= 2, `应有多个槽位：${planned.join(', ')}`);
  assert.deepEqual(actual, planned);
  assert.equal(result.dailyUsed, 3, '普通日 3 槽');
  assert.ok(result.record.slots.some((s) => s.source === 'planted'), '播种槽被吸收');
  assert.deepEqual(native.objects, rehearsal.objects, '预演结果与正式结果一致');
});

test('回南天警报日：预演与正式一致，额度 5', () => {
  const { native, adjacency } = makeNative();
  const rehearsal = structuredClone(native);
  const planned = [];
  runDailyCycleV4(deps(rehearsal, adjacency, (id, plan) => { planned.push(planOf(id, plan, rehearsal)); return true; }, { weather: ALERT_RAIN }));
  const actual = [];
  const result = runDailyCycleV4(deps(native, adjacency, (id, plan) => { actual.push(planOf(id, plan, native)); return true; }, { weather: ALERT_RAIN }));
  assert.deepEqual(actual, planned);
  assert.equal(result.alert.active, true);
  assert.equal(result.record.limit, 5);
  assert.equal(native.alert.active, rehearsal.alert.active);
});

test('预演不改动真实存档', () => {
  const { native, adjacency } = makeNative();
  const before = JSON.stringify(native);
  const rehearsal = structuredClone(native);
  runDailyCycleV4(deps(rehearsal, adjacency, () => true));
  assert.equal(JSON.stringify(native), before);
});

test('正式结算中缓存缺失（applyIcon=false）不多推进，同日续写可补齐', () => {
  const { native, adjacency } = makeNative();
  const rehearsal = structuredClone(native);
  const planned = new Set();
  runDailyCycleV4(deps(rehearsal, adjacency, (id, plan) => { planned.add(planOf(id, plan, rehearsal)); return true; }));
  // 模拟第一个计划的 ICO 合成失败：正式结算时该键缺失
  const missing = [...planned][0];
  let writes = 0;
  const first = runDailyCycleV4(deps(native, adjacency, (id, plan) => {
    const key = planOf(id, plan, native);
    if (key === missing || !planned.has(key)) return false;
    writes += 1;
    return true;
  }));
  const record = first.record;
  assert.ok(record.slots.filter((s) => s.status === 'success').length <= record.limit, '成功槽不超额');
  assert.ok(writes <= record.limit);
  // 同日再次触发（下一轮会重新预演/物化）：总推进数仍不超过当日额度
  const second = runDailyCycleV4(deps(native, adjacency, () => true, { now: NOW + 600e3 }));
  const success = second.record?.slots.filter((s) => s.status === 'success').length ?? record.slots.filter((s) => s.status === 'success').length;
  assert.ok(success <= 3, `当日成功槽 ${success} ≤ 3`);
});
