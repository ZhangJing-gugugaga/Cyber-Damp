/**
 * 城市选项（0.1.28 回归：直辖市"市辖区"与"省直辖县级行政区划"不能拿去地理编码）
 * 运行：并入 npm test。数据用真实 china-division 依赖。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cityChoicesFor, isPlaceholderCity, provinceQuery } from '../dist/test/shared/city-options.js';

const require = createRequire(import.meta.url);
const provinces = require('china-division/dist/provinces.json');
const cities = require('china-division/dist/cities.json');
const areas = require('china-division/dist/areas.json');
const byName = (name) => provinces.find((p) => p.name === name);

test('全国任何省份的选项都不含占位名', () => {
  for (const province of provinces) {
    const choices = cityChoicesFor(province, cities, areas);
    assert.ok(choices.length > 0, province.name);
    for (const c of choices) assert.equal(isPlaceholderCity(c.label), false, `${province.name}/${c.label}`);
    assert.equal(new Set(choices.map((c) => c.code)).size, choices.length, `${province.name} 选项代码唯一`);
  }
});

test('四个直辖市合并为一项，按省名查询（重庆的"市辖区"+"县"只出现一次）', () => {
  for (const [name, query] of [['北京市', '北京'], ['天津市', '天津'], ['上海市', '上海'], ['重庆市', '重庆']]) {
    const choices = cityChoicesFor(byName(name), cities, areas);
    assert.deepEqual(choices.map((c) => [c.label, c.query]), [[name, query]]);
  }
});

test('直辖县级行政区划展开为县级市', () => {
  const hubei = cityChoicesFor(byName('湖北省'), cities, areas).map((c) => c.label);
  for (const n of ['武汉市', '仙桃市', '潜江市', '天门市', '神农架林区']) assert.ok(hubei.includes(n), n);
  const hainan = cityChoicesFor(byName('海南省'), cities, areas).map((c) => c.label);
  assert.ok(hainan.includes('五指山市') && hainan.includes('海口市'));
  const henan = cityChoicesFor(byName('河南省'), cities, areas).map((c) => c.label);
  assert.ok(henan.includes('济源市'));
});

test('普通省份保持原地级市名称与查询词', () => {
  const hunan = cityChoicesFor(byName('湖南省'), cities, areas);
  const changsha = hunan.find((c) => c.label === '长沙市');
  assert.deepEqual(changsha && [changsha.label, changsha.query], ['长沙市', '长沙市']);
  assert.equal(provinceQuery('新疆维吾尔自治区'), '新疆');
});
