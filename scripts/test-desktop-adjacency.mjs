/**
 * 真实桌面坐标 → 蔓延邻接（员工 2 接线；R5.2）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacencyFromDesktop, estimateGridPitch } from '../dist/test/shared/desktop-adjacency.js';

function grid(cols, rows, pitchX, pitchY = pitchX) {
  const points = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) points.push({ id: `d-${r}-${c}`, x: 20 + c * pitchX, y: 10 + r * pitchY });
  }
  return points;
}

test('格距按最近邻中位数估计，随 DPI/图标大小变化', () => {
  assert.equal(estimateGridPitch(grid(4, 3, 76)), 76);
  assert.equal(estimateGridPitch(grid(4, 3, 114)), 114);
  assert.equal(estimateGridPitch([]), null);
  assert.equal(estimateGridPitch([{ id: 'a', x: 0, y: 0 }]), null);
});

test('同列竖排图标（Windows 默认布局）：上下相邻，隔一格不相邻', () => {
  const column = grid(1, 6, 0, 90).map((p) => ({ ...p, x: 20 }));
  const adjacency = adjacencyFromDesktop(column);
  assert.deepEqual(adjacency.get('d-2-0'), ['d-1-0', 'd-3-0']);
  assert.ok(!adjacency.get('d-0-0').includes('d-2-0'));
});

test('网格含对角邻居；不同 DPI 下结构一致', () => {
  for (const pitch of [76, 96, 120]) {
    const adjacency = adjacencyFromDesktop(grid(4, 3, pitch));
    assert.equal(adjacency.get('d-1-1').length, 8, `pitch=${pitch}`);
    assert.equal(adjacency.get('d-0-0').length, 3, `pitch=${pitch}`);
  }
});

test('缺坐标/非有限坐标的对象不参与蔓延；不足两点返回空邻接', () => {
  const adjacency = adjacencyFromDesktop([
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 80, y: 0 }, { id: 'c' }, { id: 'd', x: Number.NaN, y: 0 },
  ]);
  assert.deepEqual(adjacency.get('a'), ['b']);
  assert.equal(adjacency.has('c'), false);
  assert.equal(adjacency.has('d'), false);
  assert.deepEqual([...adjacencyFromDesktop([{ id: 'solo', x: 1, y: 1 }]).entries()], [['solo', []]]);
});

test('远处孤立图标不与网格相连', () => {
  const points = [...grid(3, 3, 80), { id: 'far', x: 1500, y: 900 }];
  const adjacency = adjacencyFromDesktop(points);
  assert.deepEqual(adjacency.get('far'), []);
});
