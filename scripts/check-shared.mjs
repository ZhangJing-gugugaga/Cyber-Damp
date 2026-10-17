/**
 * shared 层锚点机械验证（node:test）
 * 防幻觉：复算公式实算值 + 断言源码关键定义存在
 * 运行：npm run test:constants
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 与 src/shared/constants.ts 逐字对齐的公式复算（kb=sizeBytes/1024 二进制口径） */
function sizeToMass(sizeBytes) {
  const kb = Math.max(sizeBytes / 1024, 1);
  return 0.4 + Math.log10(kb) * 0.8;
}

test('sizeToMass 实算锚点与文档两位小数一致', () => {
  const KB = 1024;
  const anchors = [
    [1 * KB, '0.40'],
    [10 * KB, '1.20'],
    [1 * KB * KB, '2.81'],
    [1 * KB * KB * KB, '5.22'],   // 实算 5.2165；十进制粗算值禁用（二进制 KB 口径）
    [20 * KB * KB * KB, '6.26'],  // 6.2573 → 6.26
    [24 * KB * KB * KB, '6.32'],  // 6.3207 → 6.32
  ];
  for (const [bytes, expected] of anchors) {
    assert.equal(sizeToMass(bytes).toFixed(2), expected, `sizeToMass(${bytes}) 应为 ${expected}`);
  }
});

test('5GB vs 25GB 质量几乎无差（证明崩断必须按字节判）', () => {
  const diff = Math.abs(sizeToMass(5 * 1024 ** 3) - sizeToMass(25 * 1024 ** 3));
  assert.ok(diff < 0.6, `5GB/25GB 质量差应 <0.6，实算 ${diff.toFixed(3)}`);
});

test('源码含关键定义', () => {
  const c = readFileSync(join(root, 'src/shared/constants.ts'), 'utf8');
  assert.match(c, /GB = 1024 \*\* 3/);
  assert.match(c, /0\.4 \+ Math\.log10\(kb\) \* 0\.8/);
  assert.match(c, /'rope-1': 5 \* GB/);
  assert.match(c, /'rope-2': 25 \* GB/);
  assert.match(c, /'rope-3': 100 \* GB/);
  const s = readFileSync(join(root, 'src/shared/save/save-schema.ts'), 'utf8');
  assert.match(s, /schemaVersion !== 1/);
});
