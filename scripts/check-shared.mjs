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

/** 与 src/shared/constants.ts 逐字对齐的载荷公式复算 */
function ropePointLoad(sizeBytes) {
  return Math.log10(Math.max(0, sizeBytes) + 10) * 1.8;
}

test('ropePointLoad 实算锚点（Fg = log10(size+10)×1.8）', () => {
  const KB = 1024;
  const anchors = [
    [1 * KB, '5.43'],
    [1 * KB * KB, '10.84'],
    [1 * KB * KB * KB, '16.26'],
    [24 * KB * KB * KB, '18.74'],
  ];
  for (const [bytes, expected] of anchors) {
    assert.equal(ropePointLoad(bytes).toFixed(2), expected, `ropePointLoad(${bytes}) 应为 ${expected}`);
  }
});

test('24GB 与 1KB 载荷约 3.5 倍跨度（可形成可见深 V）', () => {
  const ratio = ropePointLoad(24 * 1024 ** 3) / ropePointLoad(1024);
  assert.ok(ratio > 3 && ratio < 4, `载荷跨度应约 3.5，实算 ${ratio.toFixed(2)}`);
});

test('源码含关键定义（载荷公式 / 绳上限 / 桌面网格 / 存档版本）', () => {
  const c = readFileSync(join(root, 'src/shared/constants.ts'), 'utf8');
  assert.match(c, /GB = 1024 \*\* 3/);
  assert.match(c, /Math\.log10\(Math\.max\(0, sizeBytes\) \+ 10\) \* 1\.8/);
  assert.match(c, /'rope-1': 5 \* GB/);
  assert.match(c, /'rope-2': 25 \* GB/);
  assert.match(c, /'rope-3': 100 \* GB/);
  assert.match(c, /DESKTOP_CELL_W = 100/);
  assert.match(c, /DESKTOP_CELL_H = 110/);
  const s = readFileSync(join(root, 'src/shared/save/save-schema.ts'), 'utf8');
  assert.match(s, /schemaVersion !== 1/);
});
