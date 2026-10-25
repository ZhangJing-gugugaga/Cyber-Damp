/**
 * 品种判定测试（Task 4；R5.1）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollSpecies, speciesWeights } from '../dist/test/shared/species/species-roll.js';
import { SPECIES_CATALOG } from '../dist/test/shared/species/species-catalog.js';

const BASE = {
  category: 'other',
  weatherCode: 1,
  humidity: 60,
  temperatureC: 20,
  localHour: 14,
  alertActive: false,
};

test('相同输入得到相同品种（种子确定性）', () => {
  for (let seed = 0; seed < 50; seed += 1) {
    const a = rollSpecies({ ...BASE, seed });
    const b = rollSpecies({ ...BASE, seed });
    assert.equal(a, b);
    assert.ok(a);
  }
});

test('不同种子产生多个品种（不是常量函数）', () => {
  const results = new Set();
  for (let seed = 0; seed < 400; seed += 1) {
    const s = rollSpecies({ ...BASE, seed });
    if (s) results.add(s);
  }
  assert.ok(results.size >= 5, `只出现 ${results.size} 种，权重表可能塌缩`);
});

test('雨天提高水滴风铃菇概率', () => {
  const dry = speciesWeights({ ...BASE, humidity: 60 });
  const rain = speciesWeights({ ...BASE, weatherCode: 63 });
  assert.ok(rain.bell > dry.bell);
  // 大样本频率方向一致
  let rainBell = 0;
  let dryBell = 0;
  for (let seed = 0; seed < 2000; seed += 1) {
    if (rollSpecies({ ...BASE, weatherCode: 63, seed }) === 'bell') rainBell += 1;
    if (rollSpecies({ ...BASE, seed }) === 'bell') dryBell += 1;
  }
  assert.ok(rainBell > dryBell, `雨天 ${rainBell} 未高于非雨天 ${dryBell}`);
});

test('雾天提高雾灯菇概率', () => {
  const clear = speciesWeights({ ...BASE });
  const fog = speciesWeights({ ...BASE, weatherCode: 45 });
  assert.ok(fog.lantern > clear.lantern);
});

test('高湿提高返潮泡泡菇与青苔披肩菇概率', () => {
  const dry = speciesWeights({ ...BASE });
  const humid = speciesWeights({ ...BASE, humidity: 90 });
  assert.ok(humid.bubble > dry.bubble);
  assert.ok(humid.moss > dry.moss);
});

test('深夜提高晚安失眠菇概率', () => {
  const day = speciesWeights({ ...BASE });
  const night = speciesWeights({ ...BASE, localHour: 2 });
  assert.ok(night.sleepless > day.sleepless);
});

test('类别倾向：压缩包/截图/聊天/编程对象分别提升对应品种', () => {
  const archive = speciesWeights({ ...BASE, category: 'archive' });
  const image = speciesWeights({ ...BASE, category: 'image' });
  const chat = speciesWeights({ ...BASE, category: 'chat' });
  const code = speciesWeights({ ...BASE, category: 'code' });
  const base = speciesWeights({ ...BASE });
  assert.ok(archive.archive > base.archive);
  assert.ok(image.waterfall > base.waterfall);
  assert.ok(chat.ghosted > base.ghosted && chat.timid > base.timid);
  assert.ok(code.broken > base.broken && code.pixel > base.pixel && code.undo > base.undo);
});

test('雨神之冠只在警报期间出现', () => {
  for (let seed = 0; seed < 2000; seed += 1) {
    assert.notEqual(rollSpecies({ ...BASE, seed }), 'rain-crown');
  }
  const alertWeights = speciesWeights({ ...BASE, alertActive: true });
  assert.ok(alertWeights['rain-crown'] > 0);
  let crown = 0;
  for (let seed = 0; seed < 3000; seed += 1) {
    if (rollSpecies({ ...BASE, alertActive: true, seed }) === 'rain-crown') crown += 1;
  }
  assert.ok(crown > 0, '警报期 3000 次未出现雨神之冠');
});

test('播种品种优先且不被天气重抽', () => {
  assert.equal(rollSpecies({ ...BASE, seed: 1, plantedSpecies: 'undo' }), 'undo');
  assert.equal(rollSpecies({ ...BASE, weatherCode: 63, seed: 2, plantedSpecies: 'pixel' }), 'pixel');
});

test('未知天气不伪造品种结果', () => {
  assert.equal(rollSpecies({ ...BASE, weatherCode: 68, seed: 1 }), null);
  assert.equal(rollSpecies({ ...BASE, weatherCode: 87, seed: 1 }), null);
  assert.equal(speciesWeights({ ...BASE, weatherCode: 79 }), null);
});

test('旧品种不参与新判定；目录包含全部 13 款新品种与 5 款旧品种', () => {
  for (let seed = 0; seed < 2000; seed += 1) {
    const s = rollSpecies({ ...BASE, seed });
    assert.ok(!['oyster', 'enoki', 'shy', 'bolete', 'lava'].includes(s));
  }
  assert.equal(Object.keys(SPECIES_CATALOG).length, 18);
  assert.equal(SPECIES_CATALOG.timid.nameZh, '社恐缩头菇');
  assert.equal(SPECIES_CATALOG.shy.nameZh, '胆小菇');
  assert.equal(SPECIES_CATALOG.shy.legacy, true);
});
