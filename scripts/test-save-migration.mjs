/**
 * 存档迁移与原生事件段校验（Goal v9 阶段2 + v0.2 v4 迁移；R4.1 旧用户不重发首批）
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

test('v1 迁移：标记 legacy-initialized，v4 字段增量写入但版本号保持 3（可回退）', () => {
  const migrated = migrateSave(v1Save);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 3, '旧版程序 validateSave 只认 1/2/3，版本号不提升（员工2审查 #1）');
  assert.ok(migrated.native);
  assert.deepEqual(migrated.native.init, { status: 'legacy-initialized' });
  assert.deepEqual(migrated.native.dailyEvents, {});
  assert.deepEqual(migrated.native.objects, {});
  assert.equal(migrated.native.lastSnapshot, null);
  assert.deepEqual(migrated.native.spores, {});
  assert.deepEqual(migrated.native.planted, {});
  assert.deepEqual(migrated.native.alert, { active: false, precipitationStreak: 0 });
  // 迁移幂等：再迁移一次结果不变
  assert.deepEqual(migrateSave(migrated), migrated);
});

test('v3 无 native 字段 = 新安装（未初始化）', () => {
  const fresh = { ...v1Save, schemaVersion: 3 };
  assert.ok(validateSave(fresh));
  assert.equal(fresh.native, undefined);
});

test('v3 字段迁移：旧日记录补 limit/alert/slots；careMask/careProgress 迁为上层会话且旧字段保留镜像', () => {
  const v3 = {
    ...v1Save,
    schemaVersion: 3,
    native: {
      init: { status: 'legacy-initialized' },
      dailyEvents: {
        '2026-10-25': { date: '2026-10-25', id: 'e1', status: 'success', seed: 1, candidateOrder: ['d-1'], attempts: ['d-1'] },
      },
      objects: {
        'd-1': {
          id: 'd-1', realPath: 'E:\\Desktop\\x', kind: 'lnk', displayName: 'x', originalMtime: 1,
          damage: { family: 'char', stage: 2, mushroom: 'none' },
          careProgress: 0.42,
          careMask: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
        },
      },
      lastSnapshot: null,
    },
  };
  const v4 = migrateSave(v3);
  assert.ok(v4);
  assert.equal(v4.schemaVersion, 3, '版本号保持 3（员工2审查 #1）');
  const record = v4.native.dailyEvents['2026-10-25'];
  assert.equal(record.limit, 1);
  assert.equal(record.alert, false);
  assert.deepEqual(record.slots, []);
  const obj = v4.native.objects['d-1'];
  // 旧字段保留并镜像：主进程 native-handlers 仍读 careProgress/careMask
  assert.equal(obj.careProgress, 0.42);
  assert.ok(obj.careMask && obj.careMask.length > 0);
  assert.ok(obj.careSession);
  assert.equal(obj.careSession.version, 2);
  assert.equal(obj.careSession.family, 'char');
  // 焦化迁移到烟灰层（上层）；进度原样保留，掩码不缩水
  assert.equal(obj.careSession.layers[0].layer, 'soot');
  assert.equal(obj.careSession.layers[0].progress, 0.42);
  assert.ok(obj.careSession.layers[0].mask.length > 0);
  // 收藏原样保留
  const withCollection = { ...v3, native: { ...v3.native, collection: { oyster: { species: 'oyster', firstSeenAt: 1, sourceName: '旧菇' } } } };
  const kept = migrateSave(withCollection);
  assert.equal(kept.native.collection.oyster.sourceName, '旧菇');
  // 幂等且不覆盖已有 v2 会话（v2 写入的进度不会被旧掩码重建覆盖）
  const advanced = JSON.parse(JSON.stringify(v4));
  advanced.native.objects['d-1'].careSession.progress = 0.9;
  const again = migrateSave(advanced);
  assert.equal(again.native.objects['d-1'].careSession.progress, 0.9);
});

test('v4 native 段：合法孢子/播种/警报/槽位通过；脏数据整体拒绝', () => {
  const base = {
    ...v1Save,
    schemaVersion: 4,
    native: {
      init: { status: 'legacy-initialized' },
      dailyEvents: {
        '2026-10-26': {
          date: '2026-10-26', id: 'e2', status: 'pending', seed: 7, limit: 3, alert: false,
          candidateOrder: [], attempts: [],
          slots: [{ objectId: 'd-1', source: 'planted', family: 'mold', fromStage: 3, toStage: 3, mushroom: 'young', species: 'bell', status: 'pending' }],
        },
      },
      objects: { 'd-1': { id: 'd-1', realPath: 'E:\\Desktop\\x', kind: 'lnk', displayName: 'x', originalMtime: 1, damage: null } },
      lastSnapshot: null,
      spores: { bell: 2 },
      planted: { 'd-1': { objectId: 'd-1', species: 'bell', plantedAt: 1, status: 'pending' } },
      alert: { active: true, startedAt: 1, endsAt: 2, reason: 'humidity', precipitationStreak: 1 },
    },
  };
  assert.ok(validateSave(base));

  const badSpore = JSON.parse(JSON.stringify(base));
  badSpore.native.spores.bell = -1;
  assert.equal(validateSave(badSpore), null);

  const badSporeKey = JSON.parse(JSON.stringify(base));
  badSporeKey.native.spores.shy = 1; // 旧品种不掉孢子（孢子库存只收新品种）
  assert.equal(validateSave(badSporeKey), null);

  const badSlotSpecies = JSON.parse(JSON.stringify(base));
  badSlotSpecies.native.dailyEvents['2026-10-26'].slots[0].species = 'shy-old';
  assert.equal(validateSave(badSlotSpecies), null);

  const badAlert = JSON.parse(JSON.stringify(base));
  badAlert.native.alert.precipitationStreak = 1.5;
  assert.equal(validateSave(badAlert), null);

  const badPlant = JSON.parse(JSON.stringify(base));
  badPlant.native.planted['d-1'].status = 'growing';
  assert.equal(validateSave(badPlant), null);

  const badObjectCategory = JSON.parse(JSON.stringify(base));
  badObjectCategory.native.objects['d-1'].objectCategory = 'memestream';
  assert.equal(validateSave(badObjectCategory), null);
});

test('v1 的坏数据迁移仍返回 null（迁移不得放大接受面）', () => {
  assert.equal(migrateSave({ ...v1Save, stats: undefined }), null);
  assert.equal(migrateSave(null), null);
});

test('0.1.28 回归：版本号 2 但已有 native 段的存档迁移后保留对象、账本与收藏（不清空）', () => {
  const v2WithNative = {
    ...v1Save,
    schemaVersion: 2,
    native: {
      init: { status: 'legacy-initialized' },
      dailyEvents: {
        '2026-10-25': { date: '2026-10-25', id: 'e1', status: 'success', seed: 1, candidateOrder: ['d-1'], attempts: ['d-1'] },
      },
      objects: {
        // 护理完成后的真实形态：stage=0 且残留 careProgress:0（0.1.27 实机存档中迁移失败的形态）
        'd-1': { id: 'd-1', realPath: 'E:\\Desktop\\a', kind: 'dir', displayName: 'a', originalMtime: 1, damage: { family: 'damp', stage: 0, mushroom: 'none' }, careProgress: 0, lastCareCompletedAt: 5 },
        'd-2': { id: 'd-2', realPath: 'E:\\Desktop\\b.lnk', kind: 'lnk', displayName: 'b', originalMtime: 2, damage: null },
      },
      lastSnapshot: null,
      collection: { oyster: { species: 'oyster', firstSeenAt: 3, sourceName: 'a' } },
    },
  };
  assert.ok(validateSave(v2WithNative), '夹具本身必须是合法存档');
  const migrated = migrateSave(v2WithNative);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(Object.keys(migrated.native.objects).sort(), ['d-1', 'd-2']);
  assert.equal(migrated.native.objects['d-1'].lastCareCompletedAt, 5);
  assert.ok(migrated.native.dailyEvents['2026-10-25'], '日账本保留');
  assert.ok(migrated.native.collection.oyster, '收藏保留');
  assert.deepEqual(migrateSave(migrated), migrated, '幂等');
});
