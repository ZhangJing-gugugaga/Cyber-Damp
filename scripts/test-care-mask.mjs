/**
 * 擦拭掩码编解码回归（Goal 阶段一：64×64 全部 4096 格往返与边界）
 * 缺陷背景（≤0.1.25）：编码只写前 512 格（顶部 8 行），中下部进度往返丢失。
 * 运行：并入 npm test（scripts/test-all.mjs）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARE_MASK_CELLS, decodeCareMask, encodeCareMask,
} from '../dist/test/shared/care-mask.js';

function cells(indices) {
  const mask = new Uint8Array(CARE_MASK_CELLS);
  for (const i of indices) mask[i] = 1;
  return mask;
}

test('掩码：全 4096 格往返一致（全 0 / 全 1 / 稀疏点）', () => {
  const allZero = new Uint8Array(CARE_MASK_CELLS);
  assert.deepEqual(decodeCareMask(encodeCareMask(allZero)), allZero);
  const allOne = new Uint8Array(CARE_MASK_CELLS).fill(1);
  assert.deepEqual(decodeCareMask(encodeCareMask(allOne)), allOne);
  // 旧缺陷点位：第 512 格起（第 9 行）曾整体丢失
  const sparse = cells([0, 1, 511, 512, 513, 2048, 4094, 4095]);
  assert.deepEqual(decodeCareMask(encodeCareMask(sparse)), sparse);
});

test('掩码：每个字节位与行列边界逐格往返', () => {
  // 逐字节置位（覆盖 MSB→LSB 的 8 种位序）与四角/中下区域代表格
  for (let byte = 0; byte < CARE_MASK_CELLS / 8; byte += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = new Uint8Array(CARE_MASK_CELLS);
      mask[byte * 8 + bit] = 1;
      const round = decodeCareMask(encodeCareMask(mask));
      for (let i = 0; i < CARE_MASK_CELLS; i += 1) {
        assert.equal(round[i], mask[i], `格 ${i}（字节${byte} 位${bit}）往返不一致`);
      }
    }
  }
});

test('掩码：棋盘与随机图案往返（含中下区域整行）', () => {
  const checker = new Uint8Array(CARE_MASK_CELLS);
  for (let i = 0; i < CARE_MASK_CELLS; i += 1) checker[i] = (i + Math.floor(i / 64)) % 2;
  assert.deepEqual(decodeCareMask(encodeCareMask(checker)), checker);

  // 只擦底部 8 行（第 56–63 行）——旧格式完全丢失的区域
  const bottom = new Uint8Array(CARE_MASK_CELLS);
  for (let gy = 56; gy < 64; gy += 1) for (let gx = 0; gx < 64; gx += 1) bottom[gy * 64 + gx] = 1;
  const round = decodeCareMask(encodeCareMask(bottom));
  let bottomCount = 0;
  for (let gy = 56; gy < 64; gy += 1) for (let gx = 0; gx < 64; gx += 1) bottomCount += round[gy * 64 + gx];
  assert.equal(bottomCount, 64 * 8, '底部 8 行必须完整保留');
});

test('掩码：旧格式（64 字节 = 顶部 8 行）按原状解码，不补造丢失记录', () => {
  // 手工构造旧编码：第 64 字节（第 512 格所在字节）全 1，其余 0
  let binary = '';
  for (let i = 0; i < 64; i += 1) binary += String.fromCharCode(i === 63 ? 0xff : 0x00);
  const legacy = btoa(binary);
  const decoded = decodeCareMask(legacy);
  assert.ok(decoded, '旧格式必须可解码');
  assert.equal(decoded.length, CARE_MASK_CELLS);
  for (let i = 0; i < CARE_MASK_CELLS; i += 1) {
    const expected = i >= 504 && i < 512 ? 1 : 0;
    assert.equal(decoded[i], expected, `格 ${i}`);
  }
});

test('掩码：非法输入明确拒绝', () => {
  assert.equal(decodeCareMask(''), null);
  assert.equal(decodeCareMask('abc'), null); // 长度既非 512 也非 64 字节
  assert.equal(decodeCareMask('!!!'), null); // 非 base64
  assert.equal(decodeCareMask('A'.repeat(1024)), null); // 长度不符
});
