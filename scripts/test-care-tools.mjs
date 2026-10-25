/**
 * 护理工具规则与手感几何测试（Task 6/7）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARE_TOOLS, toolLayerRule } from '../dist/test/shared/care-tools.js';
import {
  createCareSession, applyToolStroke, strokeCells, judgeFineCare, setLayerProgress,
} from '../dist/test/shared/care-session.js';
import { decodeCareMask } from '../dist/test/shared/care-mask.js';

function clearedCount(maskBase64) {
  const mask = decodeCareMask(maskBase64);
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) count += mask[i];
  return count;
}

test('工具表：喷壶只软化不清除；补色滚轮不处理烟灰', () => {
  assert.equal(CARE_TOOLS.sprayer.layers.mold.softenOnly, true);
  assert.equal(CARE_TOOLS.sprayer.layers.mold.clear, 0);
  assert.equal(CARE_TOOLS.repairroller.layers.soot.clear, 0);
  assert.equal(CARE_TOOLS.repairroller.layers.scorch.requiresCleared, 'soot');
});

test('万能海绵对所有层 0.5 倍生效（参数表）', () => {
  for (const layer of ['droplets', 'film', 'mold', 'soot', 'scorch']) {
    assert.equal(toolLayerRule('sponge', layer).clear, 0.5, layer);
  }
});

test('不对口工具效率明显较低但不完全无效（软化类工具除外）', () => {
  assert.equal(toolLayerRule('cloth', 'soot').clear, 0.2);
  assert.equal(toolLayerRule('blotter', 'film').clear, 0.2);
  // 软化类工具不外溢
  assert.equal(toolLayerRule('sprayer', 'droplets').clear, 0);
});

test('清洁刷：软化与未软化霉斑都能清（效率差异由渲染层节奏表现）；软化掩码由喷壶写入', () => {
  const cells = [1000, 1001, 1002];
  // 未软化霉斑：清洁刷可直接清（领域层布尔），渲染层按 0.25 节奏慢擦
  let unsoftened = createCareSession('mold', 2);
  unsoftened = applyToolStroke(unsoftened, 'scrubbrush', cells, { mold: 4096 });
  assert.equal(clearedCount(unsoftened.layers[0].mask), 3);
  assert.ok(!unsoftened.layers[0].softened, '清洁刷不写软化掩码');
  // 喷壶软化后一遍清除，且软化掩码已写入
  let softened = createCareSession('mold', 2);
  softened = applyToolStroke(softened, 'sprayer', cells, { mold: 4096 });
  assert.ok(softened.layers[0].softened, '软化掩码应已写入');
  assert.equal(clearedCount(softened.layers[0].mask), 0, '喷壶不能清除霉斑');
  softened = applyToolStroke(softened, 'scrubbrush', cells, { mold: 4096 });
  assert.equal(clearedCount(softened.layers[0].mask), 3);
});

test('清除烟灰后焦痕仍然存在；补色滚轮只处理已露出的焦痕', () => {
  let session = createCareSession('char', 3);
  const cells = [500, 501, 502];
  // 烟灰未清：滚轮无效
  session = applyToolStroke(session, 'repairroller', cells, { soot: 4096, scorch: 4096 });
  assert.equal(clearedCount(session.layers[1].mask), 0);
  // 烟灰海绵点按清灰
  session = applyToolStroke(session, 'sootblock', cells, { soot: 4096, scorch: 4096 });
  assert.equal(clearedCount(session.layers[0].mask), 3);
  assert.equal(clearedCount(session.layers[1].mask), 0, '清除烟灰后焦痕仍存在');
  // 滚轮现在可以补色
  session = applyToolStroke(session, 'repairroller', cells, { soot: 4096, scorch: 4096 });
  assert.equal(clearedCount(session.layers[1].mask), 3);
});

test('快速拖动不产生轨迹缺口（插值补路径）', () => {
  const cells = strokeCells('cloth', { points: [{ x: 10, y: 10 }, { x: 200, y: 200 }] });
  assert.ok(cells.length > 30, `只覆盖 ${cells.length} 格，快速拖动会断`);
  // 路径中点附近必有格子
  const mid = 32 * 64 + 32;
  assert.ok(cells.includes(mid) || cells.includes(mid + 1) || cells.includes(mid - 1));
});

test('不同工具有不同笔触几何（半径/长条）', () => {
  const point = [{ x: 128, y: 128 }];
  const blotter = strokeCells('blotter', { points: point });
  const blower = strokeCells('blower', { points: point });
  assert.ok(blower.length > blotter.length * 3, '冷风覆盖应远大于吸水纸');
  const strip = strokeCells('squeegee', { points: [{ x: 20, y: 20 }, { x: 100, y: 20 }] });
  assert.ok(strip.length > 60, '刮水器长条覆盖应显著大于圆点');
});

test('工具记录进 toolsUsed 且去重；进度按实际损伤格推进', () => {
  let session = createCareSession('damp', 2);
  const counts = { droplets: 100, film: 200 };
  session = applyToolStroke(session, 'blotter', [0, 1, 2], counts);
  session = applyToolStroke(session, 'blotter', [0, 1, 2], counts);
  assert.deepEqual(session.toolsUsed, ['blotter']);
  assert.equal(clearedCount(session.layers[0].mask), 3);
  assert.ok(Math.abs(session.layers[0].progress - 0.03) < 1e-9);
});

test('非法格索引被忽略；空笔触原样返回', () => {
  let session = createCareSession('damp', 1);
  const before = session;
  session = applyToolStroke(session, 'cloth', [], { droplets: 10 });
  assert.equal(session, before);
  session = applyToolStroke(session, 'cloth', [-1, 999999], { droplets: 10 });
  assert.equal(clearedCount(session.layers[0].mask), 0);
});

test('海绵一层笔触即清除（效率 0.5 是渲染节奏参数，掩码为布尔）', () => {
  let session = createCareSession('char', 3);
  const cells = [700];
  session = applyToolStroke(session, 'sponge', cells, { soot: 10, scorch: 10 });
  assert.equal(clearedCount(session.layers[0].mask), 1, '海绵可以清烟灰');
  assert.equal(clearedCount(session.layers[1].mask), 1, '海绵也可以清焦痕（渲染层半速）');
});

test('松手校准进度后，精细护理判定可用（无快速处理 + 对口工具 + 全层完成）', () => {
  let session = createCareSession('char', 3);
  session = applyToolStroke(session, 'sootblock', [1, 2, 3], { soot: 3, scorch: 3 });
  session = setLayerProgress(session, 'soot', 1);
  session = setLayerProgress(session, 'scorch', 1);
  // 不对口工具（cloth 对焦化只有兜底效率）不算对口完成
  assert.equal(judgeFineCare({ ...session, toolsUsed: ['cloth'] }, { quickCare: false }), false);
  session = applyToolStroke(session, 'repairroller', [1, 2, 3], { soot: 3, scorch: 3 });
  assert.equal(judgeFineCare(session, { quickCare: false }), true);
  assert.equal(judgeFineCare(session, { quickCare: true }), false);
});
