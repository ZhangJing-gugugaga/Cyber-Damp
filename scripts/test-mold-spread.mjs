/**
 * 相邻蔓延测试（Task 12；R5.2 v0.2）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdjacency, planSpreadPairs, insertSpreadSlots, isSpreadSource } from '../dist/test/world/mold-spread.js';
import { createDailyRecordV4, settleDailyRecordV4, dailyUsedOf } from '../dist/test/world/daily-v4.js';
import { createRand } from '../dist/test/shared/rand.js';

function makeObject(id, patch = {}) {
  return {
    id, realPath: `E:\\Desktop\\${id}`, kind: 'lnk', displayName: id, originalMtime: 1,
    damage: null, ...patch,
  };
}

const GRID_X = 96; // 假设图标格距
const RAIN = { weatherCode: 61, humidityPct: 85, temperatureC: 16, observedAt: 't', fetchedAt: 1 };
const SUNNY = { weatherCode: 0, humidityPct: 40, temperatureC: 33, observedAt: 't', fetchedAt: 1 };

function gridPoints(cols, rows) {
  const points = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      points.push({ id: `d-${r}-${c}`, x: c * GRID_X, y: r * GRID_X });
    }
  }
  return points;
}

test('相邻对象可以建立关系；远距离对象不会被错误连接', () => {
  const adjacency = buildAdjacency(gridPoints(4, 3), { maxDistance: GRID_X * 1.5, diagonal: true });
  assert.ok(adjacency.get('d-0-0').includes('d-0-1'));
  assert.ok(adjacency.get('d-0-0').includes('d-1-0'));
  assert.ok(adjacency.get('d-0-0').includes('d-1-1'), '对角邻居（diagonal=true）');
  assert.ok(!adjacency.get('d-0-0').includes('d-0-2'), '隔一格不相邻');
  assert.ok(!adjacency.get('d-0-0').includes('d-2-0'));
  assert.equal(adjacency.get('d-1-1').length, 8, '中间对象 8 邻居');
});

test('diagonal=false 时对角不相连', () => {
  const adjacency = buildAdjacency(gridPoints(3, 3), { maxDistance: GRID_X * 1.5, diagonal: false });
  assert.ok(!adjacency.get('d-0-0').includes('d-1-1'));
  assert.ok(adjacency.get('d-0-0').includes('d-1-0'));
});

test('空桌面、单对象、重叠坐标安全处理', () => {
  assert.equal(buildAdjacency([], { maxDistance: 100, diagonal: true }).size, 0);
  const single = buildAdjacency([{ id: 'd-1', x: 0, y: 0 }], { maxDistance: 100, diagonal: true });
  assert.deepEqual(single.get('d-1'), []);
  const overlap = buildAdjacency(
    [{ id: 'd-1', x: 50, y: 50 }, { id: 'd-2', x: 50, y: 50 }, { id: 'd-3', x: 50, y: 50 }],
    { maxDistance: 10, diagonal: false },
  );
  assert.equal(overlap.get('d-1').length, 2, '重叠视为相邻');
  // 同坐标同种子：邻接表稳定
  const again = buildAdjacency(
    [{ id: 'd-3', x: 50, y: 50 }, { id: 'd-2', x: 50, y: 50 }, { id: 'd-1', x: 50, y: 50 }],
    { maxDistance: 10, diagonal: false },
  );
  assert.deepEqual(again.get('d-1'), overlap.get('d-1'));
});

test('蔓延规划：只从重度霉变出发，防霉对象硬排除，天气不允许霉变时不蔓延', () => {
  const objects = {
    src: makeObject('src', { damage: { family: 'mold', stage: 3, mushroom: 'none' } }),
    clean: makeObject('clean'),
    immune: makeObject('immune', { moldImmuneUntil: 5000 }),
    dirty: makeObject('dirty', { damage: { family: 'damp', stage: 1, mushroom: 'none' } }),
  };
  const adjacency = new Map([['src', ['clean', 'immune', 'dirty']]]);
  assert.ok(isSpreadSource(objects.src));
  const pairs = planSpreadPairs(['src'], objects, adjacency, RAIN, 1000, 5, createRand(1));
  assert.deepEqual(pairs, [{ sourceId: 'src', targetId: 'clean' }]);
  // 晴热天气霉变权重为 0 → 不蔓延
  assert.deepEqual(planSpreadPairs(['src'], objects, adjacency, SUNNY, 1000, 5, createRand(1)), []);
});

test('同坐标同种子得到同样蔓延结果（确定性洗牌）', () => {
  const objects = {
    src: makeObject('src', { damage: { family: 'mold', stage: 3, mushroom: 'none' } }),
    a: makeObject('a'), b: makeObject('b'), c: makeObject('c'),
  };
  const adjacency = new Map([['src', ['a', 'b', 'c']]]);
  const first = planSpreadPairs(['src'], objects, adjacency, RAIN, 0, 2, createRand(77));
  const second = planSpreadPairs(['src'], objects, adjacency, RAIN, 0, 2, createRand(77));
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
});

test('蔓延占用每日额度：额度满不再插蔓延槽；同目标只插一次', () => {
  const objects = { 'd-1': makeObject('d-1') };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 1, alert: false, weather: RAIN });
  const pairs = [
    { sourceId: 'src', targetId: 'd-1' },
    { sourceId: 'src', targetId: 'd-1' },
    { sourceId: 'src', targetId: 'd-2' },
  ];
  assert.equal(insertSpreadSlots(record, pairs, objects), 1, '重复目标只插一次');
  assert.equal(insertSpreadSlots(record, pairs, objects), 0, '已插过不再插');
  // 占满额度
  const full = createDailyRecordV4({ date: '2026-10-27', seed: 2, alert: false, weather: RAIN });
  for (let i = 0; i < 3; i += 1) {
    full.slots.push({ objectId: `d-x${i}`, source: 'natural', family: 'damp', fromStage: 0, toStage: 1, mushroom: 'none', status: 'pending' });
  }
  assert.equal(insertSpreadSlots(full, pairs, objects), 0, '额度满不蔓延');
  assert.equal(dailyUsedOf(full), 3);
});

test('蔓延槽结算：干净邻对象获得霉变轻度；记录传染源', () => {
  const objects = { 'd-1': makeObject('d-1'), src: makeObject('src', { damage: { family: 'mold', stage: 3, mushroom: 'none' } }) };
  const record = createDailyRecordV4({ date: '2026-10-26', seed: 1, alert: false, weather: RAIN });
  insertSpreadSlots(record, [{ sourceId: 'src', targetId: 'd-1' }], objects);
  const result = settleDailyRecordV4(record, {
    objects, categories: {}, exists: () => true, applyIcon: () => true, now: 100,
  });
  assert.equal(result.advanced, 1);
  assert.equal(objects['d-1'].damage.family, 'mold');
  assert.equal(objects['d-1'].damage.stage, 1);
  const slot = record.slots[0];
  assert.equal(slot.source, 'spread');
  assert.equal(slot.fromObjectId, 'src');
  assert.equal(record.status, 'success');
});
