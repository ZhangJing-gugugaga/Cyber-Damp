/**
 * 分层护理状态测试（Task 6；R6 护理 2.0）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCareSession, migrateLegacyCare, validateCareSession, isCareSessionStale,
  sessionTotalProgress, setLayerProgress, autoFinishLayer, allLayersComplete,
  layerProgressFromMask, judgeFineCare,
} from '../dist/test/shared/care-session.js';
import { layersForDamage, migrationLayer, AUTO_FINISH_THRESHOLD } from '../dist/test/shared/care-layers.js';
import { decodeCareMask, encodeCareMask, CARE_MASK_CELLS } from '../dist/test/shared/care-mask.js';

test('损伤分层：轻度只有上层，中/重度全部层', () => {
  assert.deepEqual(layersForDamage('damp', 1), ['droplets']);
  assert.deepEqual(layersForDamage('damp', 2), ['droplets', 'film']);
  assert.deepEqual(layersForDamage('mold', 3), ['mold']);
  assert.deepEqual(layersForDamage('char', 1), ['soot']);
  assert.deepEqual(layersForDamage('char', 3), ['soot', 'scorch']);
});

test('会话可以序列化和反序列化（JSON 往返 + 校验）', () => {
  const session = createCareSession('char', 3);
  const round = validateCareSession(JSON.parse(JSON.stringify(session)));
  assert.ok(round);
  assert.deepEqual(round, session);
});

test('掩码保存后不会缩水（编码往返）', () => {
  const mask = new Uint8Array(CARE_MASK_CELLS);
  for (let i = 1800; i < 1900; i += 1) mask[i] = 1;
  const encoded = encodeCareMask(mask);
  assert.ok(encoded.length <= 4096);
  const decoded = decodeCareMask(encoded);
  assert.ok(decoded);
  let count = 0;
  for (let i = 0; i < decoded.length; i += 1) count += decoded[i];
  assert.equal(count, 100);
  assert.equal(encodeCareMask(decoded), encoded);
});

test('非法输入被拒绝：NaN 进度、未知工具、错误掩码、超范围进度', () => {
  const session = createCareSession('mold', 2);
  const badProgress = JSON.parse(JSON.stringify(session));
  badProgress.layers[0].progress = 'NaN';
  assert.equal(validateCareSession(badProgress), null);
  const nanProgress = JSON.parse(JSON.stringify(session));
  nanProgress.layers[0].progress = NaN;
  assert.equal(validateCareSession(nanProgress), null);
  const badTool = JSON.parse(JSON.stringify(session));
  badTool.toolsUsed = ['magic-wand'];
  assert.equal(validateCareSession(badTool), null);
  const badMask = JSON.parse(JSON.stringify(session));
  badMask.layers[0].mask = 'not-base64!!';
  assert.equal(validateCareSession(badMask), null);
  const longMask = JSON.parse(JSON.stringify(session));
  longMask.layers[0].mask = 'A'.repeat(5000);
  assert.equal(validateCareSession(longMask), null);
  const outOfRange = JSON.parse(JSON.stringify(session));
  outOfRange.progress = 1.5;
  assert.equal(validateCareSession(outOfRange), null);
  const wrongFamilyLayer = JSON.parse(JSON.stringify(session));
  wrongFamilyLayer.layers[0].layer = 'soot';
  assert.equal(validateCareSession(wrongFamilyLayer), null);
});

test('旧存档掩码迁移到对应上层：受潮→水珠，霉变→霉斑，焦化→烟灰', () => {
  const damp = migrateLegacyCare('damp', 1, { careProgress: 0.3, careMask: encodeCareMask(new Uint8Array(CARE_MASK_CELLS).fill(1)) });
  assert.equal(damp.layers[0].layer, 'droplets');
  const mold = migrateLegacyCare('mold', 2, { careProgress: 0.5 });
  assert.equal(mold.layers[0].layer, 'mold');
  const char = migrateLegacyCare('char', 3, { careProgress: 0.8 });
  assert.equal(char.layers[0].layer, 'soot');
  assert.equal(migrationLayer('char'), 'soot');
  // 进度保留（上限 1）
  assert.equal(char.layers[0].progress, 0.8);
});

test('会话续接：同族保留掩码，跨族/跨级会话判 stale', () => {
  const s1 = createCareSession('damp', 1);
  const s2 = createCareSession('damp', 2, s1);
  assert.deepEqual(s2.layers.map((l) => l.layer), ['droplets', 'film']);
  assert.ok(!isCareSessionStale(s1, 'damp', 1));
  assert.ok(isCareSessionStale(s1, 'damp', 2));
  assert.ok(isCareSessionStale(s1, 'mold', 1));
});

test('总进度按面积加权；无计数等权', () => {
  let session = createCareSession('char', 3);
  session = setLayerProgress(session, 'soot', 1);
  assert.equal(sessionTotalProgress(session), 0.5);
  // soot 权重 300/400 = 0.75，scorch 为 0 → 总进度 0.75
  assert.equal(sessionTotalProgress(session, { soot: 300, scorch: 100 }), 0.75);
});

test('进度以实际损伤格为基础，不按整图标透明度估算', () => {
  const mask = new Uint8Array(CARE_MASK_CELLS);
  mask[0] = 1;
  mask[1] = 1;
  // 损伤格 4 格，清 2 格 = 0.5；与 4096 总格无关
  assert.equal(layerProgressFromMask(mask, 4), 0.5);
  assert.equal(layerProgressFromMask(mask, 0), 0);
});

test('自动收尾：90% 以上允许收尾，未达阈值不收', () => {
  let session = createCareSession('mold', 1);
  session = setLayerProgress(session, 'mold', AUTO_FINISH_THRESHOLD);
  const finished = autoFinishLayer(session, 'mold');
  assert.equal(finished.layers[0].progress, 1);
  assert.ok(allLayersComplete(finished));
  const low = setLayerProgress(createCareSession('mold', 1), 'mold', 0.89);
  assert.equal(autoFinishLayer(low, 'mold'), low); // 原样返回，不偷跑
});

test('精细护理判定：需对口工具且未用快速处理', () => {
  let session = createCareSession('mold', 1);
  session = setLayerProgress(session, 'mold', 1);
  // 喷壶是霉变族对口工具（软化+刷清=完整流程的一部分）
  assert.equal(judgeFineCare({ ...session, toolsUsed: ['sprayer'] }, { quickCare: false }), true);
  assert.equal(judgeFineCare({ ...session, toolsUsed: ['scrubbrush'] }, { quickCare: false }), true);
  assert.equal(judgeFineCare({ ...session, toolsUsed: ['scrubbrush'] }, { quickCare: true }), false);
  assert.equal(judgeFineCare({ ...session, toolsUsed: [] }, { quickCare: false }), false);
  // 不对口工具不算：cloth 对霉斑只有 0.2 兜底效率
  assert.equal(judgeFineCare({ ...session, toolsUsed: ['cloth'] }, { quickCare: false }), false);
  // 万能海绵也算对口（R6：保证不强制流程）
  assert.equal(judgeFineCare({ ...session, toolsUsed: ['sponge'] }, { quickCare: false }), true);
});
