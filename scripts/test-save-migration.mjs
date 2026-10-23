/**
 * 存档 v3 迁移与原生事件段校验（Goal v9 阶段2；R4.1 旧用户不重发首批）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSave, migrateSave } from '../dist/test/shared/save/save-schema.js';

const v1Save = {
  schemaVersion: 1,
  savedAt: 1_792_000_000_000,
  player: { coins: 24, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
  weather: { city: 'hangzhou', migratedOn: '2026-10-24' },
  files: [],
  ropes: [],
  stats: { harvested: 0, earned: 0, playedMs: 0 },
};

test('v1 迁移到 v3：标记 legacy-initialized，不重发首批（R4.1）', () => {
  const migrated = migrateSave(v1Save);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 3);
  assert.ok(migrated.native);
  assert.deepEqual(migrated.native.init, { status: 'legacy-initialized' });
  assert.deepEqual(migrated.native.dailyEvents, {});
  assert.deepEqual(migrated.native.objects, {});
  assert.equal(migrated.native.lastSnapshot, null);
  // 迁移幂等：再迁移一次结果不变
  assert.deepEqual(migrateSave(migrated), migrated);
});

test('v3 无 native 字段 = 新安装（未初始化）', () => {
  const fresh = { ...v1Save, schemaVersion: 3 };
  assert.ok(validateSave(fresh));
  assert.equal(fresh.native, undefined);
});

test('v3 native 段：合法 INIT/日记录/对象通过；脏数据整体拒绝', () => {
  const base = {
    ...v1Save,
    schemaVersion: 3,
    native: {
      init: {
        status: 'active', k: 8, n: 8, seed: 42, generatedAt: 1,
        targets: [{ id: 'd-1', family: 'mold', stage: 3, mushroom: 'young', status: 'pending' }],
        snapshot: { weatherCode: 61, humidityPct: 85, temperatureC: 18, observedAt: 't', fetchedAt: 1 },
      },
      dailyEvents: { '2026-10-25': { date: '2026-10-25', id: 'e1', status: 'init_occupied', seed: 1, candidateOrder: [], attempts: [] } },
      objects: { 'd-1': { id: 'd-1', realPath: 'E:\\Desktop\\x', kind: 'lnk', displayName: 'x', originalMtime: 1, damage: null } },
      lastSnapshot: null,
    },
  };
  assert.ok(validateSave(base));

  const badStatus = JSON.parse(JSON.stringify(base));
  badStatus.native.dailyEvents['2026-10-25'].status = 'done';
  assert.equal(validateSave(badStatus), null);

  const badKind = JSON.parse(JSON.stringify(base));
  badKind.native.objects['d-1'].kind = 'file';
  assert.equal(validateSave(badKind), null);

  const badTarget = JSON.parse(JSON.stringify(base));
  badTarget.native.init.targets[0].stage = 4;
  assert.equal(validateSave(badTarget), null);

  const badPaused = JSON.parse(JSON.stringify(base));
  badPaused.native.paused = 'yes';
  assert.equal(validateSave(badPaused), null);
});

test('v1 的坏数据迁移仍返回 null（迁移不得放大接受面）', () => {
  assert.equal(migrateSave({ ...v1Save, stats: undefined }), null);
  assert.equal(migrateSave(null), null);
});
