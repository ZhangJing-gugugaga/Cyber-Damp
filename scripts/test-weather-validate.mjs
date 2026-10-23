/**
 * 天气快照校验机械验证（R3 字段防线；A09/A10 的规则前置）
 * 运行：并入 npm test（scripts/test-all.mjs）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCurrentWeather } from '../dist/test/shared/weather-validate.js';
import { KNOWN_WEATHER_CODES } from '../dist/test/shared/types/weather.js';

const NOW = 1_700_000_000_000;

test('有效 current 快照通过并携带 codeKnown', () => {
  const result = validateCurrentWeather({ temperature_2m: 21.5, relative_humidity_2m: 88, weather_code: 61, time: '2026-10-24T12:00' }, NOW);
  assert.ok(result);
  assert.equal(result.snapshot.temperatureC, 21.5);
  assert.equal(result.snapshot.humidityPct, 88);
  assert.equal(result.snapshot.weatherCode, 61);
  assert.equal(result.snapshot.fetchedAt, NOW);
  assert.equal(result.snapshot.source, 'open-meteo');
  assert.equal(result.codeKnown, true);
});

test('R3/R5 认可天气码集合：逐个覆盖', () => {
  const expected = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99];
  assert.deepEqual([...KNOWN_WEATHER_CODES].sort((a, b) => a - b), expected);
  for (const code of expected) {
    const result = validateCurrentWeather({ temperature_2m: 20, relative_humidity_2m: 50, weather_code: code, time: 't' }, NOW);
    assert.ok(result?.codeKnown, `码 ${code} 必须被认可`);
  }
});

test('未知/未说明码：可解析但 codeKnown=false（不驱动自然事件）', () => {
  for (const code of [68, 69, 79, 87, 88, 89, 90, 100, -1]) {
    const result = validateCurrentWeather({ temperature_2m: 20, relative_humidity_2m: 50, weather_code: code, time: 't' }, NOW);
    assert.ok(result);
    assert.equal(result.codeKnown, false, `码 ${code} 不应被认可`);
  }
});

test('缺失或越界字段一律拒绝', () => {
  const base = { temperature_2m: 20, relative_humidity_2m: 50, weather_code: 1, time: 't' };
  assert.equal(validateCurrentWeather(null, NOW), null);
  assert.equal(validateCurrentWeather({}, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, temperature_2m: Number.NaN }, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, temperature_2m: '20' }, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, relative_humidity_2m: -1 }, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, relative_humidity_2m: 101 }, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, weather_code: 1.5 }, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, weather_code: '1' }, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, time: '' }, NOW), null);
  assert.equal(validateCurrentWeather({ ...base, time: undefined }, NOW), null);
});
