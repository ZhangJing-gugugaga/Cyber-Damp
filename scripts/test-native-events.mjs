/**
 * 原生自然事件纯领域层机械验证（Goal v9 阶段2，覆盖 A04–A09 规则面）
 * 运行：并入 npm test（scripts/test-all.mjs）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDamage, applyCareImmunity, availableFamilies, createRand, dailyWeight,
  decideNativeBranch, familyWeights, isEligibleForDaily, localDateKey,
  moldImmuneUntilAfterCare, pickDailyFamily, planDailyOrder, planInit,
} from '../dist/test/world/native-events.js';
import { MOLD_IMMUNITY_MS } from '../dist/test/shared/types/native.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = 1_792_000_000_000; // 固定基准时刻

const snap = (code, humidity, tempC = 20) => ({
  weatherCode: code, humidityPct: humidity, temperatureC: tempC, observedAt: 't', fetchedAt: T0,
});

function candidates(count, mtimeBase = T0 - 30 * DAY) {
  return Array.from({ length: count }, (_, i) => ({
    id: `d-${i + 1}`, realPath: `E:\\Desktop\\obj${i + 1}`, kind: i % 2 === 0 ? 'dir' : 'lnk',
    displayName: `对象${i + 1}`, originalMtime: mtimeBase + i * 1000, damage: null,
  }));
}

// ---------- A04：K 抽取与 N=min(K,候选数) ----------

test('A04: 固定种子 K∈{5..10}，N=min(K,候选数)，只取 mtime 最旧的 N 个', () => {
  for (const seed of [1, 7, 42, 12345, 999]) {
    const plan12 = planInit(candidates(12), snap(61, 80), seed, T0);
    assert.ok(plan12.k >= 5 && plan12.k <= 10, `K=${plan12.k}`);
    assert.equal(plan12.n, Math.min(plan12.k, 12));
    assert.equal(plan12.targets.length, plan12.n);
    // mtime 升序（旧→新）：candidates() 的 mtime 随下标递增
    const chosen = new Set(plan12.targets.map((t) => t.id));
    for (let i = 0; i < 12; i += 1) {
      const expectedIn = i < plan12.n;
      assert.equal(chosen.has(`d-${i + 1}`), expectedIn, `种子${seed}: d-${i + 1} 应${expectedIn ? '在' : '不在'}首批`);
    }
  }
});

test('A04: 候选 0/3/8 时 N=min(K,候选数)；N=0 也返回计划（占额度由编排层处理）', () => {
  assert.equal(planInit(candidates(0), snap(61, 80), 5, T0).n, 0);
  const plan3 = planInit(candidates(3), snap(61, 80), 5, T0);
  assert.equal(plan3.n, 3);
  const plan8 = planInit(candidates(8), snap(61, 80), 5, T0);
  assert.equal(plan8.n, Math.min(plan8.k, 8));
});

test('A04: 同种子计划完全固定（重启不重抽）；异种子分布覆盖不同 K', () => {
  const a = planInit(candidates(12), snap(61, 80), 777, T0);
  const b = planInit(candidates(12), snap(61, 80), 777, T0);
  assert.deepEqual(a, b);
  // generatedAt 随事务建立时刻变化，但 K/N/目标/状态/快照/种子全部不变
  const later = planInit(candidates(12), snap(61, 80), 777, T0 + DAY);
  assert.equal(later.k, a.k); assert.equal(later.n, a.n); assert.equal(later.seed, a.seed);
  assert.deepEqual(later.targets, a.targets); assert.deepEqual(later.snapshot, a.snapshot);
  const ks = new Set(Array.from({ length: 40 }, (_, i) => planInit(candidates(12), snap(61, 80), i, T0).k));
  assert.ok(ks.size >= 3, `40 个种子应覆盖多种 K，实际 ${ks.size}`);
});

// ---------- A05/R4.1：强度与菇状态约束 ----------

test('R4.1: 首批重度最多 2 项；重霉对象菇状态 ∈ {none, young, mature}', () => {
  let sawHeavyBatch = false;
  for (let seed = 0; seed < 60; seed += 1) {
    const plan = planInit(candidates(12), snap(61, 80), seed, T0);
    const heavy = plan.targets.filter((t) => t.stage === 3);
    assert.ok(heavy.length <= 2, `种子${seed} 重度 ${heavy.length} 超上限`);
    if (heavy.length === 2) sawHeavyBatch = true;
    for (const t of plan.targets) {
      if (t.family === 'mold' && t.stage === 3) {
        assert.ok(['none', 'young', 'mature'].includes(t.mushroom));
      } else {
        assert.equal(t.mushroom, 'none');
      }
    }
  }
  assert.ok(sawHeavyBatch, '60 个种子中应出现满 2 项重度的批次');
});

// ---------- A09/R5：天气权重表 ----------

test('R5: 降水类 RH≥70 → 85/15/0；RH<70 → 100/0/0', () => {
  assert.deepEqual(familyWeights(snap(61, 85)), { damp: 85, mold: 15, char: 0 });
  assert.deepEqual(familyWeights(snap(95, 70)), { damp: 85, mold: 15, char: 0 });
  assert.deepEqual(familyWeights(snap(61, 69)), { damp: 100, mold: 0, char: 0 });
});

test('R5: 雾 45/48 RH≥70 → 60/40/0；否则 100/0/0', () => {
  assert.deepEqual(familyWeights(snap(45, 90)), { damp: 60, mold: 40, char: 0 });
  assert.deepEqual(familyWeights(snap(48, 50)), { damp: 100, mold: 0, char: 0 });
});

test('R5: 其他天气 RH≥70 → 40/60/0；RH<70 且 晴码0/1 或 ≥30°C → 30/0/70；其余 → 90/0/10', () => {
  assert.deepEqual(familyWeights(snap(2, 75)), { damp: 40, mold: 60, char: 0 });
  assert.deepEqual(familyWeights(snap(0, 50)), { damp: 30, mold: 0, char: 70 });
  assert.deepEqual(familyWeights(snap(2, 50, 31)), { damp: 30, mold: 0, char: 70 });
  assert.deepEqual(familyWeights(snap(2, 50, 25)), { damp: 90, mold: 0, char: 10 });
});

test('R5: 官方认可码逐个可用；未说明码（68/69/79/87-90 等）返回 null 不推进', () => {
  const known = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99];
  for (const code of known) assert.ok(familyWeights(snap(code, 80)) !== null, `码 ${code}`);
  for (const code of [68, 69, 79, 87, 88, 89, 90]) {
    assert.equal(familyWeights(snap(code, 80)), null, `码 ${code} 不应被认可`);
    assert.deepEqual(availableFamilies(snap(code, 80)), []);
  }
});

// ---------- A07/A08：240h 免疫 ----------

test('A07: T+239h、T+240h−1ms 霉变硬排除；T+240h、T+240h+1ms 恢复候选', () => {
  const rain = snap(61, 85);
  const T = T0;
  const until = moldImmuneUntilAfterCare(T);
  assert.equal(until, T + MOLD_IMMUNITY_MS);
  assert.deepEqual(availableFamilies(rain, T + 239 * HOUR < until).filter((f) => f === 'mold'), []);
  assert.ok(T + 239 * HOUR < until);
  assert.deepEqual(availableFamilies(rain, true).includes('mold'), false);
  assert.ok(availableFamilies(rain, false).includes('mold'));
  // 边界数值：240h−1ms 仍免疫，240h 与 +1ms 结束
  assert.ok(T + MOLD_IMMUNITY_MS - 1 < until);
  assert.ok(T + MOLD_IMMUNITY_MS >= until);
  assert.ok(T + MOLD_IMMUNITY_MS + 1 >= until);
});

test('A07: 免疫对象仍可按天气受潮/发焦（雨停霉权重为0时不受潮不受罚）', () => {
  const immune = familyWeights(snap(61, 85), true);
  assert.deepEqual(immune, { damp: 85, mold: 0, char: 0 });
  const dryHot = familyWeights(snap(0, 40, 33), true);
  assert.deepEqual(dryHot, { damp: 30, mold: 0, char: 70 });
  const mist = familyWeights(snap(45, 90), true);
  assert.deepEqual(mist, { damp: 60, mold: 0, char: 0 }); // 免疫时雾天只剩受潮
});

test('A08: applyCareImmunity 刷新 lastCareCompletedAt 与免疫窗口', () => {
  const obj = { id: 'd-1', realPath: 'p', kind: 'dir', displayName: 'x', originalMtime: 1, damage: { family: 'damp', stage: 2, mushroom: 'none' } };
  const cared = applyCareImmunity(obj, T0);
  assert.equal(cared.lastCareCompletedAt, T0);
  assert.equal(cared.moldImmuneUntil, T0 + MOLD_IMMUNITY_MS);
});

// ---------- A09/R4.2：DAILY 候选与推进 ----------

test('R4.2: 冷落权重 d 与 w=1+min(d,30)；无基准 w=31', () => {
  const base = { id: 'd-1', realPath: 'p', kind: 'dir', displayName: 'x', originalMtime: T0, damage: null };
  assert.equal(dailyWeight({ ...base, originalMtime: 0 }, T0), 31);
  assert.equal(dailyWeight(base, T0), 1);
  assert.equal(dailyWeight(base, T0 + 3 * DAY), 4);
  assert.equal(dailyWeight(base, T0 + 100 * DAY), 31);
  // 基准取 max(mtime, lastAdvanceAt, lastCareCompletedAt)
  assert.equal(dailyWeight({ ...base, lastCareCompletedAt: T0 + 5 * DAY }, T0 + 6 * DAY), 2);
});

test('R4.2: 干净对象可引入；同族未满级可继续；重度损伤不再空推进；免疫期霉变对象被排除', () => {
  const rain = snap(61, 85);
  const clean = { id: 'a', realPath: 'p', kind: 'dir', displayName: 'x', originalMtime: T0, damage: null };
  const moldLight = { ...clean, id: 'b', damage: { family: 'mold', stage: 1, mushroom: 'none' } };
  const moldHeavy = { ...clean, id: 'c', damage: { family: 'mold', stage: 3, mushroom: 'none' } };
  const moldMature = { ...clean, id: 'd', damage: { family: 'mold', stage: 3, mushroom: 'mature' } };
  const dampHeavy = { ...clean, id: 'e', damage: { family: 'damp', stage: 3, mushroom: 'none' } };
  const immuneMold = { ...moldLight, id: 'f', moldImmuneUntil: T0 + 10 * DAY };
  assert.equal(isEligibleForDaily(clean, rain, T0), true);
  assert.equal(isEligibleForDaily(moldLight, rain, T0), true);
  assert.equal(isEligibleForDaily(moldHeavy, rain, T0), true); // 霉变重度还有菇阶段
  assert.equal(isEligibleForDaily(moldMature, rain, T0), false); // 成熟菇为终点
  assert.equal(isEligibleForDaily(dampHeavy, rain, T0), false); // 受潮重度满级
  assert.equal(isEligibleForDaily(immuneMold, rain, T0), false); // 免疫期霉变硬排除
});

test('R4.2: planDailyOrder 按种子稳定、不含不合格候选、最多 3 个', () => {
  const rain = snap(61, 85);
  const objs = candidates(10).map((o, i) => (i === 0 ? { ...o, moldImmuneUntil: T0 + DAY } : o));
  const a = planDailyOrder(objs, rain, T0, 99);
  const b = planDailyOrder(objs, rain, T0, 99);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 1 && a.length <= 3);
  assert.ok(!a.includes('d-1')); // 免疫中被排除
  const empty = planDailyOrder([candidates(1)[0] && { ...candidates(1)[0], damage: { family: 'damp', stage: 3, mushroom: 'none' } }], snap(0, 40, 20), T0, 1);
  assert.equal(empty.length, 0); // 晴天低位温度无候选 → empty
});

test('R5: 推进一次一级，霉变重度→幼菇→成熟菇；换族从轻度进入', () => {
  const clean = null;
  const d1 = advanceDamage(clean, 'mold').damage;
  assert.deepEqual(d1, { family: 'mold', stage: 1, mushroom: 'none' });
  const d2 = advanceDamage(d1, 'mold').damage;
  const d3 = advanceDamage(d2, 'mold').damage;
  assert.equal(d3.stage, 3);
  const d4 = advanceDamage(d3, 'mold').damage;
  assert.equal(d4.mushroom, 'young');
  const d5 = advanceDamage(d4, 'mold').damage;
  assert.equal(d5.mushroom, 'mature');
  assert.equal(advanceDamage(d5, 'mold').advanced, false);
  // 换族：已清理（damage null）后进入受潮轻度
  const damp = advanceDamage(null, 'damp').damage;
  assert.deepEqual(damp, { family: 'damp', stage: 1, mushroom: 'none' });
  // 先采菇不改变损伤/护理进度；先洗净再采菇仍干净——采摘不改损伤（编排层规则，域层只保证 advance 纯净）
});

// ---------- R4.4：单入口唯一分支 ----------

test('R4.4: 八分支按序唯一匹配', () => {
  const terminal = { status: 'success' };
  assert.equal(decideNativeBranch({ paused: true, hasValidWeather: true, initStatus: 'not-generated', todayRecord: null }), 'none-paused');
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: false, initStatus: 'not-generated', todayRecord: null }), 'wait-weather');
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: true, initStatus: 'not-generated', todayRecord: null }), 'generate-init');
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: true, initStatus: 'active', todayRecord: null }), 'continue-init');
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: false, initStatus: 'active', todayRecord: null }), 'wait-weather');
  for (const status of ['success', 'empty', 'init_occupied']) {
    assert.equal(decideNativeBranch({ paused: false, hasValidWeather: true, initStatus: 'completed', todayRecord: { status } }), 'daily-terminal');
  }
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: false, initStatus: 'completed', todayRecord: null }), 'wait-weather');
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: true, initStatus: 'completed', todayRecord: { status: 'retryable' } }), 'daily-resume');
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: true, initStatus: 'completed', todayRecord: { status: 'pending' } }), 'daily-resume');
  assert.equal(decideNativeBranch({ paused: false, hasValidWeather: true, initStatus: 'completed', todayRecord: null }), 'daily-create');
  // 暂停优先于一切（含终态）
  assert.equal(decideNativeBranch({ paused: true, hasValidWeather: true, initStatus: 'completed', todayRecord: terminal }), 'none-paused');
});

// ---------- 本地自然日 ----------

test('localDateKey 按系统本地日期', () => {
  const d = new Date(2026, 9, 24, 23, 50).getTime(); // 本地 2026-10-24 23:50
  assert.equal(localDateKey(d), '2026-10-24');
  assert.equal(localDateKey(d + 20 * 60 * 1000), '2026-10-25'); // 跨午夜
});

// ---------- R5 换族（Goal 阶段一：护理完成后不被旧损伤族锁死） ----------

function baseObj(overrides = {}) {
  return {
    id: 'd-1', realPath: 'E:/Desktop/obj1', kind: 'dir',
    displayName: '对象1', originalMtime: T0 - 30 * DAY, damage: null, ...overrides,
  };
}

test('R5: 完整清理（stage 0）后按当日天气进入新族，不被旧族锁死', () => {
  const obj = baseObj({
    damage: { family: 'mold', stage: 0, mushroom: 'none' },
    moldImmuneUntil: T0 + MOLD_IMMUNITY_MS,
  });
  // 干燥高温晴天：可用族只剩受潮/焦化，霉变权重 0（免疫再叠加仍为 0）
  const dry = snap(0, 40, 35);
  assert.equal(isEligibleForDaily(obj, dry, T0), true, '已清理对象在干燥日应可入选');
  const family = pickDailyFamily(obj, dry, T0, 42);
  assert.ok(['damp', 'char'].includes(family), `干燥日选族结果 ${family}`);
  const advanced = advanceDamage(obj.damage, family);
  assert.equal(advanced.advanced, true);
  assert.equal(advanced.damage.family, family);
  assert.equal(advanced.damage.stage, 1);
});

test('R5: 换族进入轻度时保留既有成熟菇（菇独立于损伤）', () => {
  const cleaned = { family: 'mold', stage: 0, mushroom: 'mature' };
  const switched = advanceDamage(cleaned, 'damp');
  assert.deepEqual(switched.damage, { family: 'damp', stage: 1, mushroom: 'mature' });
  // 干净对象（无损伤记录）首次引入仍无菇
  const fresh = advanceDamage(null, 'damp');
  assert.deepEqual(fresh.damage, { family: 'damp', stage: 1, mushroom: 'none' });
  // 已清理的同族对象再推进同样保留菇
  const sameFamily = advanceDamage(cleaned, 'mold');
  assert.deepEqual(sameFamily.damage, { family: 'mold', stage: 1, mushroom: 'mature' });
});

test('R5: 未清理对象仍锁定主族（stage>0 的霉变对象在干燥日不入选）', () => {
  const obj = baseObj({ damage: { family: 'mold', stage: 2, mushroom: 'none' } });
  const dry = snap(0, 40, 35);
  assert.equal(isEligibleForDaily(obj, dry, T0), false, '霉变对象在干燥日应跳过');
  const wet = snap(61, 85);
  assert.equal(isEligibleForDaily(obj, wet, T0), true, '同族适配日仍可推进');
  assert.equal(pickDailyFamily(obj, wet, T0, 7), 'mold', '未清理对象沿主族推进');
});

test('R5: 免疫期已清理对象不引入霉变（权重硬排除，多种子）', () => {
  const obj = baseObj({
    damage: { family: 'mold', stage: 0, mushroom: 'none' },
    moldImmuneUntil: T0 + MOLD_IMMUNITY_MS,
  });
  const wet = snap(61, 85); // 常规权重 受潮85/霉变15
  for (const seed of [1, 7, 42, 999, 123456]) {
    assert.notEqual(pickDailyFamily(obj, wet, T0, seed), 'mold', `种子 ${seed} 不得引入霉变`);
  }
});
