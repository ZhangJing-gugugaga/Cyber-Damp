/**
 * world 纯领域层机械验证（node:test，Node 22.18+ 原生类型剥离直跑 TS）
 * 运行：npm run test:world
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepEvolution, deriveStage } from '../dist/test/world/evolution.js';
import { layoutDesktopCells, buildFileNodes } from '../dist/test/world/desktop-layout.js';
import { pickSpecies, SPECIES } from '../dist/test/world/mushroom-species.js';
import { simulateDay } from '../dist/test/world/weather-simulator.js';
import { sellMushroom } from '../dist/test/world/economy.js';
import { purchase } from '../dist/test/world/shop-catalog.js';
import { validateSave } from '../dist/test/shared/save/save-schema.js';
import { GB, ropePointLoad } from '../dist/test/shared/constants.js';
import {
  VerletRope,
  ROPE_NODE_COUNT,
  ROPE_ITERATIONS,
  PIN_MIN_DISTANCE,
} from '../dist/test/world/verlet-rope.js';
import { ropeLoadState } from '../dist/test/world/rope-load.js';
import { FileEntity } from '../dist/test/world/file-entity.js';
import { seedMoldyMushroom } from '../dist/test/world/file-seed.js';
import { heatFile, stopHeating, scorchedCharacters } from '../dist/test/world/file-material.js';

test('打开陈年文件不自动清洗；明确换新后按护理时间保持新鲜', () => {
  const now = 1800000000000;
  const mtime = now - 60 * 86400000;
  const entity = new FileEntity({ id:'used', name:'old.txt', ext:'txt', category:'doc-code', sizeBytes:20, mtime, lastOpenedAt:now, x:0, y:0, realPath:'C:\\Desktop\\old.txt', kind:'file', iconDataUrl:'' });
  entity.syncStage(now + 10000);
  assert.equal(entity.runtime.stage, 'moldy');
  assert.equal(entity.node.mtime, mtime);
  entity.runtime.refreshedAt = now;
  entity.syncStage(now + 10000);
  assert.equal(entity.runtime.stage, 'fresh');
  entity.syncStage(now + 4 * 86400000);
  assert.equal(entity.runtime.stage, 'damp');
});

function mkRuntime(over = {}) {
  return { id: 't', humidity: 0.2, mold: 0, char: 0, stage: 'damp', state: 'idle', mushroom: null, ...over };
}

test('热风须持续超过五秒才焦化，不能在干燥前期提前烤黑', () => {
  const rt = mkRuntime({ humidity: 0.9 });
  for (let i = 0; i < 50; i++) stepEvolution(rt, { humidity: 0.1, heat: 1, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.equal(rt.char, 0);
  for (let i = 0; i < 10; i++) stepEvolution(rt, { humidity: 0.1, heat: 1, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.ok(rt.char >= 0.3, '第六秒应有肉眼可见的焦斑');
});

test('沙漠和挂绳过晒都会干瘪，复湿可恢复，短时暴露不会立刻缩水', () => {
  for (const state of ['idle', 'hung']) {
    const rt = mkRuntime({ humidity: 0.1, state });
    for (let i = 0; i < 10; i++) stepEvolution(rt, { humidity: 0.1, heat: 0, wind: 0.6 }, 0.1, 'doc-code', 0.99);
    assert.ok(rt.dryness < 0.04, '一秒干风不应瞬间干瘪');
    for (let i = 0; i < 290; i++) stepEvolution(rt, { humidity: 0.1, heat: 0, wind: 0.6 }, 0.1, 'doc-code', 0.99);
    assert.ok(rt.dryness >= 0.99, `${state} 必须达到缩水20%的脱水度`);
    rt.humidity = 0.95;
    for (let i = 0; i < 60; i++) stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
    assert.equal(rt.dryness, 0);
  }
});

test('松开热风再按不会把两次不足五秒的暴露累计成过热', () => {
  const rt = mkRuntime({ humidity:0.8 });
  for (let i = 0; i < 40; i++) heatFile(rt, 0.1);
  stopHeating(rt);
  for (let i = 0; i < 40; i++) heatFile(rt, 0.1);
  assert.equal(rt.char, 0);
  for (let i = 0; i < 20; i++) heatFile(rt, 0.1);
  assert.ok(rt.char > 0.3);
});

test('陈年湿文件在29%至34%的干旱天气下最终干瘪，不被平衡湿度卡住', () => {
  const actualDunhuang = simulateDay('dunhuang', 20261019).humidity;
  for (const humidity of [actualDunhuang, 0.34]) {
    const rt = mkRuntime({ humidity: 0.9, stage: 'moldy', dryness: 0 });
    for (let i = 0; i < 3600; i++) stepEvolution(rt, { humidity, heat: 0, wind: 0 }, 1 / 60, 'doc-code', 0.99);
    assert.ok(rt.dryness >= 0.99, `干旱天气${humidity}下文件湿度${rt.humidity}不能阻止长期缩水，dryness=${rt.dryness}`);
    assert.equal(rt.char, 0, '日晒不能当作热风焦化');
  }
  const humidRope = mkRuntime({ humidity: 0.3, state: 'hung', dryness: 0 });
  for (let i = 0; i < 600; i++) stepEvolution(humidRope, { humidity: 0.7, heat: 0, wind: 0 }, 1 / 60, 'doc-code', 0.99);
  assert.equal(humidRope.dryness, 0, '高湿环境挂绳仍需先降至原来的25%门槛');
});

test('炭块只替换文件主体的1–2个完整字元，扩展名和原名称保持不变', () => {
  for (const name of ['会议记录.docx', '照片😀🌧.png', '<script>.txt', '微信.lnk']) {
    const before = name;
    const parts = scorchedCharacters(name, name, 0.8);
    const carbon = parts.filter(p=>p.carbon);
    assert.ok(carbon.length >= 1 && carbon.length <= 2);
    if (name.endsWith('.txt')) assert.ok(parts.map(p=>p.glyph).join('').endsWith('.txt'));
    assert.equal(name, before);
    assert.deepEqual(parts, scorchedCharacters(name,name,0.8));
    assert.equal(scorchedCharacters(name,name,0).some(p=>p.carbon),false);
  }
});

test('真实新建文件夹及其编号变体自然长胆小菇，普通同名文件不误判', () => {
  for (const name of ['新建文件夹', '新建文件夹 (2)', 'New folder', 'New folder (3)']) {
    const rt = mkRuntime({ stage: 'moldy', mold: 0.8 });
    seedMoldyMushroom(rt, 'doc-code', 'folder-test', name, 'dir');
    assert.equal(rt.mushroom?.species, 'shy', name);
  }
  const rt = mkRuntime({ stage:'moldy', mold:0.8 });
  seedMoldyMushroom(rt, 'doc-code', 'folder-test', '新建文件夹', 'file');
  assert.notEqual(rt.mushroom?.species, 'shy');
});

test('高湿环境湿度上升', () => {
  const rt = mkRuntime({ humidity: 0.2 });
  for (let i = 0; i < 100; i++) stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.ok(rt.humidity > 0.7, `应趋向 0.81，实算 ${rt.humidity.toFixed(2)}`);
});

test('绳上晾晒趋向干爽且大风加速', () => {
  const calm = mkRuntime({ state: 'hung', humidity: 0.8 });
  const windy = mkRuntime({ state: 'hung', humidity: 0.8 });
  for (let i = 0; i < 600; i++) {
    stepEvolution(calm, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
    stepEvolution(windy, { humidity: 0.9, heat: 0, wind: 1 }, 0.1, 'doc-code', 0.99);
  }
  assert.ok(windy.humidity < calm.humidity, `大风应更干：windy ${windy.humidity.toFixed(3)} < calm ${calm.humidity.toFixed(3)}`);
  assert.ok(calm.humidity > 0.6, `无风应缓慢干爽（>0.6）：实算 ${calm.humidity.toFixed(3)}`);
});

test('霉斑局部萌芽后缓慢生长，短时间不会同时成熟；干燥保留霉斑并冻结生长', () => {
  const rt = mkRuntime({ mold: 0.7 });
  stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0);
  assert.ok(rt.mushroom, '应萌生蘑菇');
  for (let i = 0; i < 1050; i++) stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.ok(rt.mushroom.growth > 0 && rt.mushroom.growth < .01);
  rt.dryCare = true;
  const before = { mold: rt.mold, growth: rt.mushroom.growth };
  for (let i = 0; i < 3600; i++) stepEvolution(rt, { humidity: .9, heat: 0, wind: 0 }, 1, 'doc-code', 0);
  assert.equal(rt.mold, before.mold);
  assert.equal(rt.mushroom.growth, before.growth);
  assert.ok(rt.humidity < .16);
});

test('过热焦化并锁定 burnt', () => {
  const rt = mkRuntime({ humidity: 0.1 });
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

test('真实桌面网格：100x192、预留顶部/底部空间、纵向优先', () => {
  const cells = layoutDesktopCells(20, 1536, 864);
  const rows = Math.floor((864 - 144 - 54 - 124) / 192) + 1;
  assert.deepEqual(cells[0], { x: 4, y: 144 });
  assert.deepEqual(cells[1], { x: 4, y: 336 });
  assert.deepEqual(cells[2], { x: 4, y: 528 });
  assert.deepEqual(cells[rows], { x: 104, y: 144 }, '第 rows+1 个换到第二列顶部');
  for (const c of cells) {
    assert.ok(c.x >= 0 && c.x + 100 <= 1536, `x 出界: ${c.x}`);
    assert.ok(c.y >= 0 && c.y + 110 <= 864, `y 出界: ${c.y}`);
  }
});

test('真实条目 → FileNode 1:1 映射（名称/大小/mtime/图标不变）', () => {
  const entry = {
    id: 'd-abc',
    name: '真实文件.docx',
    ext: 'docx',
    category: 'doc-code',
    sizeBytes: 123456,
    mtime: 1700000000000,
    realPath: 'C:\\Users\\x\\Desktop\\真实文件.docx',
    kind: 'file',
    iconDataUrl: 'data:image/png;base64,AA==',
    geometry: { x: 90, y: 42, size: 48, labelX: 80, labelY: 94, labelWidth: 80, labelHeight: 24 },
  };
  const nodes = buildFileNodes([entry], 1536, 864);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, entry.name);
  assert.equal(nodes[0].sizeBytes, entry.sizeBytes);
  assert.equal(nodes[0].mtime, entry.mtime);
  assert.equal(nodes[0].iconDataUrl, entry.iconDataUrl);
  assert.equal(nodes[0].realPath, entry.realPath);
  assert.deepEqual({ x: nodes[0].x, y: nodes[0].y }, { x: 72, y: 38 });
  assert.deepEqual(nodes[0].geometry, entry.geometry);
  assert.throws(() => buildFileNodes([{ ...entry, geometry: undefined }], 1536, 864), /缺少原生桌面布局/);
});

test('载荷公式 Fg = log10(sizeBytes+10)×1.8', () => {
  assert.equal(ropePointLoad(1024).toFixed(2), '5.43');
  assert.equal(ropePointLoad(1024 * 1024).toFixed(2), '10.84');
  assert.equal(ropePointLoad(24 * GB).toFixed(2), '18.74');
});

test('绳负载状态：safe / 80% warn / 100% break', () => {
  assert.equal(ropeLoadState(3.9 * GB, 'rope-1'), 'safe');
  assert.equal(ropeLoadState(4 * GB, 'rope-1'), 'warn', '恰好 80% 进入预警');
  assert.equal(ropeLoadState(5 * GB, 'rope-1'), 'break');
});

test('Verlet 绳：32 质点 / 15 次约束 / 有松弛量可下垂', () => {
  assert.equal(ROPE_NODE_COUNT, 32);
  assert.equal(ROPE_ITERATIONS, 15);
  const rope = new VerletRope(100, 100, 1100, 100);
  assert.equal(rope.points.length, 32);
  for (let i = 0; i < 600; i++) rope.step(1 / 60, { width: 1920, floorY: 1080 });
  const mid = rope.points[16];
  assert.ok(mid.y > 140, `悬链线中点应下垂，实算 y=${mid.y.toFixed(1)}`);
  assert.ok(mid.y < 600, `不应无限下坠，实算 y=${mid.y.toFixed(1)}`);
});

test('重文件载荷使绳中点更深（24GB > 1KB）', () => {
  const light = new VerletRope(100, 100, 1100, 100);
  const heavy = new VerletRope(100, 100, 1100, 100);
  light.attach('light', 1024, light.length / 2);
  heavy.attach('heavy', 24 * GB, heavy.length / 2);
  for (let i = 0; i < 900; i++) {
    light.step(1 / 60, { width: 1920, floorY: 1080 });
    heavy.step(1 / 60, { width: 1920, floorY: 1080 });
  }
  const lightMid = light.pointAtS(light.length / 2);
  const heavyMid = heavy.pointAtS(heavy.length / 2);
  assert.ok(
    heavyMid.y > lightMid.y + 20,
    `重文件应明显更深：heavy ${heavyMid.y.toFixed(1)} vs light ${lightMid.y.toFixed(1)}`,
  );
});

test('几KB文本几乎不增加下垂，4.2GiB文件夹仍明显压深同一跨度', () => {
  const settledBottom = (bytes) => {
    const rope = new VerletRope(10,240,1400,240);
    if (bytes !== null) rope.attach('owned',bytes,rope.length/2);
    for (let i=0;i<2400;i++) rope.step(1/60,{width:1536,floorY:804});
    return Math.max(...rope.points.map(p=>p.y));
  };
  const empty=settledBottom(null);
  const light=settledBottom(3072);
  const heavy=settledBottom(Math.ceil(4.2*GB));
  assert.ok(light-empty<=12,`3KB仅应轻微压低：${(light-empty).toFixed(2)} DIP`);
  assert.ok(heavy-light>=60,`4.2GiB必须明显更深：${(heavy-light).toFixed(2)} DIP`);
});

test('5+ 个挂载图标沿弧长保持 ≥72px，无重叠', () => {
  const rope = new VerletRope(60, 120, 1460, 120);
  for (let i = 0; i < 6; i++) rope.attach(`f${i}`, GB, rope.length / 2);
  for (let i = 0; i < 900; i++) rope.step(1 / 60, { width: 1920, floorY: 1080 });
  const ss = rope.pins.map((p) => p.s).sort((a, b) => a - b);
  assert.equal(ss.length, 6);
  for (let i = 0; i < ss.length - 1; i++) {
    assert.ok(
      ss[i + 1] - ss[i] >= PIN_MIN_DISTANCE - 0.5,
      `弧长间距 ${(ss[i + 1] - ss[i]).toFixed(1)} < ${PIN_MIN_DISTANCE}`,
    );
  }
});

test('超载断右端 → 0.3s 后整绳自由落体到 floorY', () => {
  const rope = new VerletRope(100, 100, 1100, 100);
  rope.attach('x', 24 * GB, rope.length / 2);
  rope.breakRight();
  assert.equal(rope.attachedRight, false);
  assert.equal(rope.attachedLeft, true);
  for (let i = 0; i < 180; i++) rope.step(1 / 60, { width: 1920, floorY: 900 });
  assert.equal(rope.attachedLeft, false, '0.3s 后左端也应脱开');
  assert.ok(
    rope.points.every((p) => p.y <= 900.5),
    '所有质点在 floorY 上方',
  );
  assert.ok(rope.points[0].y > 500, '整绳已落到下方');
});

test('pickSpecies：代码类 40% 金针菇，压缩包类 15% 胆小菇（AC-30），其他类只有平菇', () => {
  assert.equal(pickSpecies('doc-code', 0.1), 'enoki');
  assert.equal(pickSpecies('doc-code', 0.9), 'oyster');
  assert.equal(pickSpecies('image-video', 0.1), 'oyster');
  assert.equal(pickSpecies('audio', 0.1), 'oyster');
  assert.equal(pickSpecies('archive', 0.1), 'oyster');
  assert.equal(pickSpecies('archive', 0.85), 'shy');
  assert.equal(pickSpecies('archive', 0.84), 'oyster');
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

function goodSave() {
  return {
    schemaVersion: 1, savedAt: 1,
    player: { coins: 5, owned: ['rope-1'], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'guangzhou', migratedOn: '2026-10-17' },
    files: [{ id: 'f-001', humidity: 0.5, mold: 0.1, char: 0, state: 'idle', mushroom: null }],
    ropes: [], stats: { harvested: 0, earned: 0, playedMs: 0 },
  };
}

test('存档校验：坏数据 null，好数据通过', () => {
  assert.equal(validateSave(null), null);
  assert.equal(validateSave({ schemaVersion: 2 }), null);
  assert.ok(validateSave(goodSave()), '合法存档应通过');
});

test('脱水度存档向后兼容，拒绝非数值或越界的缩水状态', () => {
  assert.ok(validateSave(goodSave()), '旧存档无dryness仍可读取');
  const valid = goodSave(); valid.files[0].dryness = 0.95;
  assert.equal(validateSave(valid)?.files[0].dryness,0.95);
  for (const dryness of [NaN, Infinity, -0.1, 1.1, '0.5']) {
    const bad = goodSave(); bad.files[0].dryness = dryness;
    assert.equal(validateSave(bad),null);
  }
});

test('存档校验拒绝 NaN 绳坐标/未知绳型/非法状态/NaN 蘑菇（AC-24/27）', () => {
  const badRope = { ...goodSave(), ropes: [{ id: 'r-1', ax: NaN, ay: 1, bx: 2, by: 3, tier: 'rope-1', fileIds: [] }] };
  assert.equal(validateSave(badRope), null, 'NaN 锚点必须拒绝');
  const badTier = { ...goodSave(), ropes: [{ id: 'r-1', ax: 0, ay: 1, bx: 2, by: 3, tier: 'rope-x', fileIds: [] }] };
  assert.equal(validateSave(badTier), null, '未知绳型必须拒绝');
  const badState = { ...goodSave(), files: [{ ...goodSave().files[0], state: 'zombie' }] };
  assert.equal(validateSave(badState), null, '非法状态必须拒绝');
  const badGrowth = { ...goodSave(), files: [{ ...goodSave().files[0], mushroom: { species: 'oyster', growth: NaN } }] };
  assert.equal(validateSave(badGrowth), null, 'NaN 生长值必须拒绝');
  const withRope = { ...goodSave(), ropes: [{ id: 'r-1', ax: 10, ay: 20, bx: 300, by: 200, tier: 'rope-2', fileIds: ['f-001'] }] };
  assert.ok(validateSave(withRope), '合法绳条目应通过');
});

test('NaN 输入不穿透演化（AC-27 存档防线）', () => {
  const rt = mkRuntime({ humidity: NaN });
  stepEvolution(rt, { humidity: 0.9, heat: 0, wind: 0 }, 0.1, 'doc-code', 0.99);
  assert.ok(Number.isFinite(rt.humidity), '湿度必须为有限数');
  assert.ok(Number.isFinite(rt.mold), '霉变必须为有限数');
});

test('AC-16 晴天风干速率约为高湿 2 倍', () => {
  const sunny = mkRuntime({ state: 'hung', humidity: 0.8 });
  const damp = mkRuntime({ state: 'hung', humidity: 0.8 });
  for (let i = 0; i < 100; i++) {
    stepEvolution(sunny, { humidity: 0.5, heat: 0, wind: 0.6 }, 0.1, 'doc-code', 0.99);
    stepEvolution(damp, { humidity: 0.5, heat: 0, wind: 0.15 }, 0.1, 'doc-code', 0.99);
  }
  const ratio = (0.8 - sunny.humidity) / (0.8 - damp.humidity);
  assert.ok(ratio > 1.6 && ratio < 2.0, `风干倍率应约 1.8，实算 ${ratio.toFixed(2)}`);
});

test('未知菌种售卖不崩溃（脏存档防御）', () => {
  const r = sellMushroom([{ species: 'ghost', growth: 1 }], 10);
  assert.equal(r.coins, 10);
  assert.equal(r.remaining.length, 1);
});

test('真实桌面替身保留菌盖/HUD顶部空间和任务栏上方标签，当前29/33项不丢失', () => {
  for (const count of [29,33]) {
    for (const [w,h] of [[1536,864],[1280,720],[1920,1080]]) {
      const cells=layoutDesktopCells(count,w,h);
      assert.equal(cells.length,count,'Every scanned desktop item must remain represented');
      assert.equal(new Set(cells.map(c=>`${c.x}:${c.y}`)).size,count,'No duplicate cells');
      for(const c of cells) {
        assert.ok(c.y+12-72>=72,'Tallest mature cap plus sway must clear the top HUD');
        assert.ok(c.y+124<=h-54,'Three-line labels must stay above the shared taskbar floor');
        assert.ok(c.x>=0&&c.x+100<=w,'Native artwork and label must stay inside the viewport');
        const next=cells.find(n=>n.x===c.x&&n.y>c.y);
        if(next) assert.ok(next.y+12-72>=c.y+124+4,'The next mushroom cap must not hide the previous filename');
      }
    }
  }
});


test('顶部留白与行距不能降低旧网格的105项容量',()=>{const cells=layoutDesktopCells(105,1536,864);assert.equal(cells.length,105);for(const c of cells)assert.ok(c.x>=0&&c.x+100<=1536&&c.y>=0&&c.y+124<=810);});
