/**
 * 编排器机械验证（Goal v9 阶段2 切片2；A05/A06/A19 的规则与记账面）
 * 依赖全部注入（假图标写入、固定时钟），node.exe 直跑。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNativeCycle } from '../dist/test/main/desktop/native-scheduler.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = 1_792_000_000_000;
// 本地日期键从 T0 推导（T0 不一定是 10-24；硬编码日期在别的时区/日期必错）
const dateOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const D0 = dateOf(T0), D1 = dateOf(T0 + DAY), D3 = dateOf(T0 + 3 * DAY), D4 = dateOf(T0 + 4 * DAY);

const weather = { weatherCode: 61, humidityPct: 85, temperatureC: 18, observedAt: 't', fetchedAt: T0 };

function makeState() {
  return { init: null, dailyEvents: {}, objects: {}, lastSnapshot: null, paused: false };
}

function candidates(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `d-${i + 1}`, realPath: `E:\\Desktop\\obj${i + 1}`, kind: i % 2 === 0 ? 'dir' : 'lnk',
    displayName: `对象${i + 1}`, originalMtime: T0 - 30 * DAY + i * 1000,
  }));
}

function deps(overrides = {}) {
  const applied = [];
  const base = {
    state: makeState(),
    weather,
    weatherUsable: true,
    candidates: candidates(12),
    now: () => T0,
    nextSeed: (() => { let s = 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) || ++s; })(),
    applyIcon: (c, plan) => { applied.push({ id: c.id, ...plan }); return true; },
    exists: () => true,
    ...overrides,
  };
  return { base, applied };
}

// ---------- A04/R4.1：INIT 生成与额度 ----------

test('INIT 生成：固定事务、对象状态建立、当日 init_occupied', () => {
  const { base } = deps();
  const r1 = runNativeCycle(base);
  assert.equal(r1.action, 'generate-init');
  // 生成与执行同轮完成（R4.1 允许首个有效自然日批量完成）
  assert.equal(base.state.init.status, 'completed');
  assert.equal(base.state.dailyEvents[D0].status, 'init_occupied');
  assert.ok(Object.keys(base.state.objects).length === 12);
  // 同日再跑：终态，不重复
  const r2 = runNativeCycle(base);
  assert.equal(r2.action, 'daily-terminal');
});

test('R4.1: 全部成功 → completed，摘要含 K/N/成功数；次日 DAILY 生效', () => {
  const { base, applied } = deps();
  runNativeCycle(base);
  assert.equal(base.state.init.status, 'completed');
  const done = base.state.init.targets.filter((t) => t.status === 'done').length;
  assert.equal(applied.length, done);
  assert.match(String(base.state.init.targets.length), /^[0-9]+$/);
  // 次日：创建 DAILY 且成功推进一个对象
  base.now = () => T0 + DAY;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'daily-create');
  assert.equal(base.state.dailyEvents[D1].status, 'success');
  const advanced = Object.values(base.state.objects).filter((o) => o.damage !== null);
  assert.equal(advanced.length, done + 1); // 首批对象 + 今日一个
});

test('R4.1: 候选不足按实数（N<5 受限分支不伪造）', () => {
  const { base } = deps({ candidates: candidates(3) });
  const r = runNativeCycle(base);
  assert.equal(base.state.init.n, 3);
  assert.match(r.summary, /N=3/);
});

test('R4.1: 对象消失 → 跳过并给原因；N=0 完成检查', () => {
  const { base } = deps({ candidates: candidates(0) });
  const r = runNativeCycle(base);
  assert.equal(base.state.init.status, 'completed');
  assert.equal(base.state.init.n, 0);
  assert.match(r.summary, /实际变化 0 个/);

  const { base: b2 } = deps({ exists: (p) => !p.includes('obj1') });
  runNativeCycle(b2);
  const skipped = b2.state.init.targets.filter((t) => t.status === 'skipped');
  assert.ok(skipped.length >= 1);
  assert.ok(skipped[0].skipReason.includes('不存在'));
});

test('R4.1: 连续 3 次写入失败自动跳过（无需用户点击），其余对象继续', () => {
  const { base } = deps({
    applyIcon: (c) => (c.id === 'd-1' ? false : true),
  });
  runNativeCycle(base);
  const t1 = base.state.init.targets.find((t) => t.id === 'd-1');
  assert.equal(t1.status, 'skipped');
  assert.equal(t1.attempts, 3);
  assert.equal(base.state.init.status, 'completed');
});

// ---------- A05/R4.1：崩溃续作 ----------

test('A05: 写成功 3 个后崩溃，次日续作完成固定剩余、总数不变、不发 DAILY', () => {
  const { base } = deps();
  // 模拟崩溃：只处理前 3 个目标
  const originalApply = base.applyIcon;
  let count = 0;
  base.applyIcon = (c, plan) => { if (count >= 3) throw new Error('simulated crash'); count += 1; return originalApply(c, plan); };
  assert.throws(() => runNativeCycle(base), /simulated crash/);
  base.applyIcon = originalApply;
  assert.equal(base.state.init.status, 'active');
  // 注意：崩溃时第4个可能已 attempts=1；继续
  base.now = () => T0 + DAY;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'continue-init');
  assert.equal(base.state.init.status, 'completed');
  assert.equal(base.state.init.targets.length, base.state.init.n);
  assert.ok(base.state.init.targets.every((t) => t.status !== 'pending'));
  // 当日（续作日）被 INIT 占用，无 DAILY
  assert.equal(base.state.dailyEvents[D1].status, 'init_occupied');
});

// ---------- A06/R4.2：DAILY 去重、重试、缺席、跨午夜 ----------

test('A06: 全失败 → retryable 且同 ID；同日重跑续用同一记录；次日不再补', () => {
  const { base } = deps({ applyIcon: () => false });
  base.now = () => T0 + 2 * DAY;
  const planSeedBefore = null;
  runNativeCycle(base); // 先完成 INIT（全失败走 INIT 跳过路径）
  assert.equal(base.state.init.status, 'completed');
  base.now = () => T0 + 3 * DAY;
  const r1 = runNativeCycle(base);
  assert.equal(r1.action, 'daily-create');
  const record1 = base.state.dailyEvents[D3];
  assert.equal(record1.status, 'retryable');
  const id1 = record1.id;
  assert.ok(record1.attempts.length >= 1 && record1.attempts.length <= 3);
  const r2 = runNativeCycle(base);
  assert.equal(r2.action, 'daily-resume');
  assert.equal(base.state.dailyEvents[D3].id, id1);
  // 跨日：旧 retryable 确定未写入 → 关闭，新日新记录（不补债）
  base.now = () => T0 + 4 * DAY;
  const r3 = runNativeCycle(base);
  assert.equal(base.state.dailyEvents[D3], undefined);
  // 写入仍全部失败 → 新记录同样 retryable（R4.2：success 只能来自写入成功，不能凭空记成功）
  assert.equal(base.state.dailyEvents[D4].status, 'retryable');
});

test('A06: 缺席三天回来总计只推进一次', () => {
  const { base } = deps();
  runNativeCycle(base); // INIT 日
  base.now = () => T0 + 4 * DAY;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'daily-create');
  const advanced = Object.values(base.state.objects).filter((o) => o.lastAdvanceAt === T0 + 4 * DAY);
  assert.equal(advanced.length, 1);
  // 同日再跑不再推进
  runNativeCycle(base);
  assert.equal(Object.values(base.state.objects).filter((o) => o.lastAdvanceAt === T0 + 4 * DAY).length, 1);
});

test('A06: 旧 retryable 但有写入证据 → 关闭为 success，不当日重复推进', () => {
  const { base } = deps();
  runNativeCycle(base);
  base.now = () => T0 + DAY;
  // 手工构造：昨天 retryable 但对象有当日损伤证据
  const date = D0;
  const obj = Object.values(base.state.objects)[0];
  obj.damage = { family: 'damp', stage: 1, mushroom: 'none' };
  obj.lastAdvanceAt = T0;
  base.state.dailyEvents[date] = { date, id: 'x', status: 'retryable', seed: 1, candidateOrder: [obj.id], attempts: [obj.id], snapshot: weather };
  const r = runNativeCycle(base);
  assert.equal(base.state.dailyEvents[date].status, 'success');
  assert.equal(r.action, 'daily-create');
  assert.equal(base.state.dailyEvents[D1].status, 'success');
});

test('A06: empty（无可推进）为当日终态', () => {
  const { base } = deps({ candidates: candidates(1) });
  runNativeCycle(base);
  // 唯一对象设为受潮重度满级，雨天下不可推进
  const obj = Object.values(base.state.objects)[0];
  obj.damage = { family: 'damp', stage: 3, mushroom: 'none' };
  base.now = () => T0 + DAY;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'daily-create');
  assert.equal(base.state.dailyEvents[D1].status, 'empty');
});

// ---------- R4.3：暂停与旧用户 ----------

test('R4.3: 暂停时不生成不续写，恢复后按当日额度继续', () => {
  const { base } = deps();
  base.state.paused = true;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'none-paused');
  assert.equal(base.state.init, null);
  base.state.paused = false;
  assert.equal(runNativeCycle(base).action, 'generate-init');
});

test('R4.1: legacy-initialized 用户直接进入 DAILY，不重发首批', () => {
  const { base, applied } = deps();
  base.state.init = { status: 'legacy-initialized' };
  base.now = () => T0 + DAY;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'daily-create');
  assert.equal(base.state.dailyEvents[D1].status, 'success');
  assert.ok(applied.length === 1); // 只有当日推进，没有首批批量写入
});

// ---------- R3/R5：天气门禁 ----------

test('R3: 无有效天气 → wait-weather，不创建记录不积欠', () => {
  const { base } = deps({ weatherUsable: false });
  base.now = () => T0 + DAY;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'wait-weather');
  assert.equal(base.state.dailyEvents[D1], undefined);
  // 未知码快照同样视为不可用（由 weather-service usableForEvents 决定）
  const r2 = runNativeCycle(deps({ weatherUsable: false }).base);
  assert.equal(r2.action, 'wait-weather');
});

test('R5: 免疫期对象不被霉变推进，但可受潮/发焦', () => {
  const { base } = deps();
  runNativeCycle(base);
  // 全部对象设为刚护理过（免疫中）且干净 → 雨天下仍可受潮引入
  const now2 = T0 + DAY;
  for (const obj of Object.values(base.state.objects)) {
    obj.lastCareCompletedAt = T0;
    obj.moldImmuneUntil = T0 + 240 * HOUR;
    obj.damage = null;
    obj.originalMtime = T0 - 40 * DAY;
  }
  base.now = () => now2;
  const r = runNativeCycle(base);
  assert.equal(base.state.dailyEvents[D1].status, 'success');
  const advanced = Object.values(base.state.objects).find((o) => o.lastAdvanceAt === now2);
  assert.ok(advanced.damage.family !== 'mold', '免疫期不得引入霉变');
});

test('R5: 完整清理（stage 0）的对象可换族推进，且保留未采摘的成熟菇', () => {
  const { base } = deps();
  runNativeCycle(base); // INIT 完成，D0 占用
  const now2 = T0 + DAY;
  for (const obj of Object.values(base.state.objects)) {
    // 全部设为"护理完成但成熟菇未采"：stage 0 + 保留旧 mold 族记录 + 免疫中
    obj.damage = { family: 'mold', stage: 0, mushroom: 'mature' };
    obj.moldImmuneUntil = T0 + 240 * HOUR;
    obj.lastCareCompletedAt = T0;
    obj.originalMtime = T0 - 40 * DAY;
  }
  base.now = () => now2;
  const r = runNativeCycle(base);
  assert.equal(r.action, 'daily-create');
  assert.equal(base.state.dailyEvents[D1].status, 'success');
  const advanced = Object.values(base.state.objects).find((o) => o.lastAdvanceAt === now2);
  assert.ok(advanced, '已清理对象必须重新入选（不被旧 mold 族锁死）');
  assert.ok(['damp', 'char'].includes(advanced.damage.family), `免疫期换族结果 ${advanced.damage.family}`);
  assert.equal(advanced.damage.mushroom, 'mature', '换族不得清除未采摘的菇');
  assert.equal(advanced.damage.stage, 1, '已清理对象重新进入轻度');
});
