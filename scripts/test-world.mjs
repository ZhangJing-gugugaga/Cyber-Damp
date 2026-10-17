/**
 * world 纯领域层机械验证（node:test，Node 22.18+ 原生类型剥离直跑 TS）
 * 运行：npm run test:world
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepEvolution, deriveStage } from '../dist/test/world/evolution.js';
import { generateDesktop, countMoldy } from '../dist/test/world/virtual-desktop.js';
import { pickSpecies, SPECIES } from '../dist/test/world/mushroom-species.js';
import { simulateDay } from '../dist/test/world/weather-simulator.js';
import { sellMushroom } from '../dist/test/world/economy.js';
import { purchase } from '../dist/test/world/shop-catalog.js';
import { validateSave } from '../dist/test/shared/save/save-schema.js';
import { GB } from '../dist/test/shared/constants.js';

function mkRuntime(over = {}) {
  return { id: 't', humidity: 0.2, mold: 0, char: 0, stage: 'damp', state: 'idle', mushroom: null, ...over };
}

test('高湿环境湿度上升', () => {
  const rt = mkRuntime({ humidity: 0.2 });
  for (let i = 0; i < 100; i++) stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.ok(rt.humidity > 0.7, `应趋向 0.81，实算 ${rt.humidity.toFixed(2)}`);
});

test('绳上晾晒趋向干爽且大风加速', () => {
  const calm = mkRuntime({ state: 'hung', humidity: 0.8 });
  const windy = mkRuntime({ state: 'hung', humidity: 0.8 });
  // AC-13 慢干速率（DRY_RATE=0.0034）：600 帧 = 60s 游戏时间，calm 约降 12%/min 中档
  for (let i = 0; i < 600; i++) {
    stepEvolution(calm, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
    stepEvolution(windy, { humidity: 0.9, heat: 0, wind: 1 }, 0.1, 'doc-code', 0.99);
  }
  assert.ok(windy.humidity < calm.humidity, `大风应更干：windy ${windy.humidity.toFixed(3)} < calm ${calm.humidity.toFixed(3)}`);
  assert.ok(calm.humidity > 0.6, `无风应缓慢干爽（>0.6）：实算 ${calm.humidity.toFixed(3)}`);
});

test('mold>0.6 萌生蘑菇并生长至可采摘', () => {
  const rt = mkRuntime({ mold: 0.7 });
  stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.1);
  assert.ok(rt.mushroom, '应萌生蘑菇');
  // SPEC 速率 dt×0.01：100 秒游戏时间成熟（1050 帧留余量）
  for (let i = 0; i < 1050; i++) stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.equal(rt.mushroom.growth, 1, '应生长至 1');
});

test('过热焦化并锁定 burnt', () => {
  const rt = mkRuntime({ humidity: 0.1 });
  // SPEC 速率 dt×0.01：持续热风 60 秒游戏时间 char 过 0.6（620 帧留余量）
  for (let i = 0; i < 620; i++) stepEvolution(rt, { humidity: 0.1, heat: 0.9, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.equal(rt.state, 'burnt', 'char>0.6 应锁定 burnt');
  const charBefore = rt.char;
  stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 1, 'doc-code', 0.1);
  assert.equal(rt.char, charBefore, 'burnt 后演化冻结');
});

test('deriveStage 四阶段边界', () => {
  const now = 1_000_000_000_000;
  const day = 86400000;
  assert.equal(deriveStage(now - 2 * day, now), 'fresh');
  assert.equal(deriveStage(now - 5 * day, now), 'damp');
  assert.equal(deriveStage(now - 20 * day, now), 'wet');
  assert.equal(deriveStage(now - 40 * day, now), 'moldy');
});

test('pin 集：16 个锚文件、≥8 个陈年老文件、demo.mp4 钉 2.3GB', () => {
  const now = 1_700_000_000_000;
  const nodes = generateDesktop(now);
  assert.equal(nodes.length, 16, '应恰 16 个锚文件');
  assert.ok(countMoldy(nodes, now) >= 8, `>30 天文件应 ≥8，实算 ${countMoldy(nodes, now)}`);
  const demo = nodes.find((n) => n.name === 'demo.mp4');
  assert.ok(demo, 'demo.mp4 必须在 pin 集');
  assert.equal(demo.sizeBytes, 2.3 * GB, 'demo.mp4 应钉 2.3GB');
  // 架构师锁定：≥1 个 24GB 级锚文件（AC-37 下垂/Demo 预检/钢杆价值三锚点依赖）
  const szip = nodes.find((n) => n.name === '学习资料.7z');
  assert.equal(szip.sizeBytes, 24 * GB, '学习资料.7z 应钉 24GB');
  // 字节预检必要性自证：demo.mp4 + 学习资料.7z = 26.3GB > 麻绳 5GB（不预检必断）
  assert.ok(demo.sizeBytes + szip.sizeBytes > 5 * GB, '两个大文件之和应超麻绳上限（Demo 预检必要性）');
  const names = nodes.map((n) => n.name);
  for (const expect of ['毕业论文_最终版_不改了_v3.docx', '新建文件夹 (2)', '学习资料.7z', 'main.py', '表情包.gif', '报销单.xlsx']) {
    assert.ok(names.includes(expect), `pin 集缺 ${expect}`);
  }
  // 坐标避让：左右边缘 140px 内无文件
  for (const n of nodes) {
    assert.ok(n.x > 140 && n.x < 1920 - 140, `${n.name} x=${n.x} 应在避让区外`);
  }
});

test('确定性：同日同桌面（mtime 与 sizeBytes 可复现）', () => {
  const t1 = generateDesktop(1_700_000_000_000);
  const t2 = generateDesktop(1_700_000_000_000);
  assert.deepEqual(t1.map((n) => [n.name, n.sizeBytes, n.mtime]), t2.map((n) => [n.name, n.sizeBytes, n.mtime]));
});

test('pickSpecies：代码类 40% 金针菇，压缩包类 15% 胆小菇（AC-30），其他类只有平菇', () => {
  assert.equal(pickSpecies('doc-code', 0.1), 'enoki');
  assert.equal(pickSpecies('doc-code', 0.9), 'oyster');
  assert.equal(pickSpecies('image-video', 0.1), 'oyster');
  assert.equal(pickSpecies('audio', 0.1), 'oyster');
  assert.equal(pickSpecies('archive', 0.1), 'oyster');
  assert.equal(pickSpecies('archive', 0.85), 'shy');  // ≥0.85 → SSR 胆小菇
  assert.equal(pickSpecies('archive', 0.84), 'oyster'); // 边界外仍平菇
});

test('胆小菇 SSR 定价与售卖（AC-30/AC-20）', () => {
  assert.equal(SPECIES.shy.rarity, 'SSR');
  assert.equal(SPECIES.shy.price, 400);
  const res = sellMushroom([{ species: 'shy', growth: 1 }], 0);
  assert.equal(res.coins, 400);
});

test('天气模拟确定性与城市差异', () => {
  const a = simulateDay('guangzhou', 20261017);
  const b = simulateDay('guangzhou', 20261017);
  assert.deepEqual(a, b, '同日同城应同天气');
  assert.ok(a.humidity > simulateDay('dunhuang', 20261017).humidity, '广州应湿于敦煌');
});

test('售卖只收成熟蘑菇', () => {
  const inv = [
    { species: 'oyster', growth: 1 },
    { species: 'enoki', growth: 1 },
    { species: 'oyster', growth: 0.5 },
  ];
  const r = sellMushroom(inv, 10);
  assert.equal(r.coins, 45, '5+30+10=45');
  assert.equal(r.remaining.length, 1, '未成熟应保留');
});

test('购买：扣币/余额不足/已拥有', () => {
  assert.deepEqual(purchase(200, 'rope-2', ['rope-1']), { ok: true, coins: 100 });
  assert.equal(purchase(50, 'rope-2', ['rope-1']).reason, 'insufficient');
  assert.equal(purchase(200, 'rope-2', ['rope-2']).reason, 'owned');
});

test('存档校验：坏数据 null，好数据通过', () => {
  assert.equal(validateSave(null), null);
  assert.equal(validateSave({ schemaVersion: 2 }), null);
  const good = {
    schemaVersion: 1, savedAt: 1,
    player: { coins: 5, owned: ['rope-1'], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'guangzhou', migratedOn: '2026-10-17' },
    files: [{ id: 'f-001', humidity: 0.5, mold: 0.1, char: 0, state: 'idle', mushroom: null }],
    ropes: [], stats: { harvested: 0, earned: 0, playedMs: 0 },
  };
  assert.ok(validateSave(good), '合法存档应通过');
});
