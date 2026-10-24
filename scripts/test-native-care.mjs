/**
 * 护理/采摘/收藏/小铺 领域机械验证（Goal v9 阶段3；R5/R6）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIG_SPONGE_ID, buyNativeItem, completeCare, grantOnboarding, harvestMushroom, scrubRadiusMultiplier,
} from '../dist/test/world/native-care.js';
import { MOLD_IMMUNITY_MS } from '../dist/test/shared/types/native.js';

const NOW = 1_792_000_000_000;

function stateWith(obj = {}) {
  return {
    init: null, dailyEvents: {}, objects: {
      'd-1': {
        id: 'd-1', realPath: 'E:\\Desktop\\x', kind: 'dir', displayName: '对象一', originalMtime: 1,
        damage: { family: 'mold', stage: 3, mushroom: 'mature' }, mushroomSpecies: 'oyster', ...obj,
      },
    }, lastSnapshot: null, ...{},
  };
}

test('R5: 清洗不采菇——完整清理后菇保留、损伤清零、免疫 240h', () => {
  const state = stateWith();
  const r = completeCare(state, 'd-1', NOW);
  assert.ok(r.ok && r.iconReset);
  const obj = state.objects['d-1'];
  assert.deepEqual(obj.damage, { family: 'mold', stage: 0, mushroom: 'mature' });
  assert.equal(obj.lastCareCompletedAt, NOW);
  assert.equal(obj.moldImmuneUntil, NOW + MOLD_IMMUNITY_MS);
});

test('R5: 先采菇再洗——采菇不动损伤/护理，清洗只清损伤', () => {
  const state = stateWith();
  const h = harvestMushroom(state, 'd-1', NOW, 'enoki');
  assert.ok(h.ok && h.coins === 4 && h.species === 'oyster');
  assert.equal(state.objects['d-1'].damage.stage, 3); // 损伤保留
  assert.equal(state.objects['d-1'].damage.mushroom, 'none');
  const c = completeCare(state, 'd-1', NOW);
  assert.ok(c.ok);
  assert.equal(state.objects['d-1'].damage.stage, 0);
});

test('R5: 先洗净再采菇仍干净——采菇不重新加霉', () => {
  const state = stateWith();
  completeCare(state, 'd-1', NOW);
  const h = harvestMushroom(state, 'd-1', NOW + 1, 'enoki');
  assert.ok(h.ok);
  assert.equal(state.objects['d-1'].damage.stage, 0); // 不重新加霉
  assert.equal(state.objects['d-1'].damage.mushroom, 'none');
});

test('R5: 重复采摘不重复结算', () => {
  const state = stateWith();
  assert.ok(harvestMushroom(state, 'd-1', NOW, 'enoki').ok);
  const again = harvestMushroom(state, 'd-1', NOW, 'enoki');
  assert.equal(again.ok, false);
});

test('R5: 干净/无菇对象不可采', () => {
  const clean = stateWith({ damage: { family: 'damp', stage: 0, mushroom: 'none' } });
  assert.equal(harvestMushroom(clean, 'd-1', NOW, 'enoki').ok, false);
  const young = stateWith({ damage: { family: 'mold', stage: 3, mushroom: 'young' } });
  assert.equal(harvestMushroom(young, 'd-1', NOW, 'enoki').ok, false);
});

test('R6: 引导奖励只发一次（完成或跳过同路径），重练不重发', () => {
  const state = { init: null, dailyEvents: {}, objects: {}, lastSnapshot: null };
  const first = grantOnboarding(state, 0);
  assert.deepEqual(first, { coins: 24, alreadyDone: false });
  const second = grantOnboarding(state, 24);
  assert.deepEqual(second, { coins: 24, alreadyDone: true });
});

test('R6: 大海绵 12 币/护理垫 8 币；扣币原子；重复购买拒绝；余额不足拒绝', () => {
  const state = { init: null, dailyEvents: {}, objects: {}, lastSnapshot: null };
  assert.deepEqual(buyNativeItem(state, 24, [], BIG_SPONGE_ID), { ok: true, coins: 12, owned: [BIG_SPONGE_ID] });
  assert.equal(buyNativeItem(state, 24, [BIG_SPONGE_ID], BIG_SPONGE_ID).ok, false);
  assert.equal(buyNativeItem(state, 5, [], BIG_SPONGE_ID).error, '菇币不足');
  assert.equal(buyNativeItem(state, 24, [], 'unknown-item').ok, false);
  assert.deepEqual(buyNativeItem(state, 8, [], 'care-mat'), { ok: true, coins: 0, owned: ['care-mat'] });
});

test('R6: 大海绵使擦洗范围 +30%', () => {
  assert.equal(scrubRadiusMultiplier([]), 1);
  assert.equal(scrubRadiusMultiplier([BIG_SPONGE_ID]), 1.3);
});

test('R6: 收藏记录品种、首次获得与来源名；同名再采更新来源', () => {
  const state = stateWith();
  harvestMushroom(state, 'd-1', NOW, 'enoki');
  assert.deepEqual(state.collection.oyster, { species: 'oyster', firstSeenAt: NOW, sourceName: '对象一' });
  state.objects['d-1'].damage.mushroom = 'mature';
  state.objects['d-1'].mushroomSpecies = 'oyster'; // 再生菇由编排层指定品种
  state.objects['d-1'].displayName = '改名后';
  harvestMushroom(state, 'd-1', NOW + 5, 'enoki');
  assert.equal(state.collection.oyster.firstSeenAt, NOW); // 首次获得不变
  assert.equal(state.collection.oyster.sourceName, '改名后');
});
