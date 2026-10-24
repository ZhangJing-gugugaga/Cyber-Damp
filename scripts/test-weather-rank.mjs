/**
 * 城市搜索合并重排机械验证（长沙类短名被同名乡镇淹没的回归防线）。
 * 运行：并入 npm test（scripts/test-all.mjs）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCityResults, rankCities, suggestSuffixedQuery } from '../dist/test/shared/weather-rank.js';

const town = (id, name, admin1, population, featureCode = 'PPL') => ({
  id, name, admin1, country: '中国', latitude: 30, longitude: 110, population, featureCode,
});

test('行政级别优先于人口：地级市压过人口更多的一般地点', () => {
  const ranked = rankCities([
    town('a', 'X镇', '某省', 5_000_000, 'PPL'),
    town('b', 'X市', '某省', 3_000_000, 'PPLA'),
  ]);
  assert.equal(ranked[0].id, 'b');
});

test('同级别按人口降序', () => {
  const ranked = rankCities([
    town('small', '长沙', '重庆市', 47_170, 'PPLA4'),
    town('big', '长沙市', '湖南', 3_093_980, 'PPLA'),
  ]);
  assert.equal(ranked[0].id, 'big');
});

test('按 id 去重后重排并截取上限', () => {
  const merged = mergeCityResults([
    [town('dup', '杭州', '浙江', 10_000_000, 'PPLA')],
    [town('dup', '杭州市', '浙江', 10_000_000, 'PPLA'), town('t', '杭州湾镇', '浙江', 800, 'PPL')],
  ], 10);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'dup');
});

test('短名查询补"市"后缀，行政区划后缀不再补', () => {
  assert.equal(suggestSuffixedQuery('长沙'), '长沙市');
  assert.equal(suggestSuffixedQuery('长沙市'), null);
  assert.equal(suggestSuffixedQuery('敦煌'), '敦煌市');
  assert.equal(suggestSuffixedQuery('沙县'), null);
  assert.equal(suggestSuffixedQuery('  '), null);
});

test('全部结果截取到 cap', () => {
  const many = Array.from({ length: 15 }, (_, i) => town(`id${i}`, '某地', '某省', i, 'PPL'));
  assert.equal(mergeCityResults([many], 10).length, 10);
});
