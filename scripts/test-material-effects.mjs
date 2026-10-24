/**
 * 认可材质合成机械验证（移植自 material-effects-lab/effects.js）
 * 关键断言：只改 RGB 不碰 alpha；stage=0 不调用即无污染；蓝底检测；款式稳定。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDamageMaterial, damageVariant } from '../dist/test/shared/material/effects.js';

function makeIcon() {
  // 256×256，左半 40×40 不透明方块（模拟非满方格图标），部分蓝/部分暖
  const data = new Uint8ClampedArray(new ArrayBuffer(256 * 256 * 4));
  for (let y = 60; y < 200; y += 1) {
    for (let x = 60; x < 140; x += 1) {
      const i = (y * 256 + x) * 4;
      data[i] = 40; data[i + 1] = 90; data[i + 2] = 200; data[i + 3] = 255; // 蓝
    }
  }
  for (let y = 60; y < 200; y += 1) {
    for (let x = 140; x < 200; x += 1) {
      const i = (y * 256 + x) * 4;
      data[i] = 210; data[i + 1] = 150; data[i + 2] = 60; data[i + 3] = 255; // 暖
    }
  }
  return data;
}

test('透明留白不被污染（只改 RGB、alpha 不变）', () => {
  const data = makeIcon();
  const beforeAlpha = new Uint8Array(256 * 256);
  for (let i = 0; i < 256 * 256; i += 1) beforeAlpha[i] = data[i * 4 + 3];
  const result = applyDamageMaterial({ data, width: 256, height: 256, stage: 2, type: 0 });
  for (let i = 0; i < 256 * 256; i += 1) assert.equal(data[i * 4 + 3], beforeAlpha[i], `alpha 变了 @${i}`);
  assert.ok(result.changed > 0, '不透明区应有明显变色');
});

test('蓝底水渍走暗沉路线（RGB 变暗而非变亮蓝）', () => {
  const data = makeIcon();
  const result = applyDamageMaterial({ data, width: 256, height: 256, stage: 2, type: 6 });
  assert.equal(result.blue, true);
  // 采样原蓝区中心：暗沉路线应降低亮度
  const i = (130 * 256 + 100) * 4;
  const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  assert.ok(lum < 90, `暗沉水渍亮度 ${lum} 应低于 90`);
});

test('霉变款式覆盖 0-5，焦化覆盖 9-11，全款式不抛错', () => {
  for (const type of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const data = makeIcon();
    const r = applyDamageMaterial({ data, width: 256, height: 256, stage: 3, type });
    assert.ok(r.changed >= 0);
  }
});

test('damageVariant 按对象 ID 稳定且族内有效', () => {
  assert.equal(damageVariant('d-123', 'mold'), damageVariant('d-123', 'mold'));
  for (let i = 0; i < 30; i += 1) {
    const v = damageVariant(`obj-${i}`, 'mold');
    assert.ok(v >= 0 && v <= 5, `mold variant ${v}`);
    const d = damageVariant(`obj-${i}`, 'damp');
    assert.ok(d >= 6 && d <= 8, `damp variant ${d}`);
    const c = damageVariant(`obj-${i}`, 'char');
    assert.ok(c >= 9 && c <= 11, `char variant ${c}`);
  }
});
