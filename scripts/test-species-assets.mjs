/**
 * 品种素材测试（Task 3）：13 款 × 全尺寸 + manifest + 透明通道 + 剪影。
 * 运行：并入 npm test。素材由 scripts/build-species-assets.cjs 生成。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECIES_DIR = path.join(ROOT, 'src/renderer/public/assets/care/species');

const IDS = ['bubble', 'moss', 'bell', 'lantern', 'archive', 'waterfall', 'ghosted',
  'sleepless', 'timid', 'broken', 'pixel', 'undo', 'rain-crown'];
const FILES = ['mature-256.png', 'mature-48.png', 'mature-32.png', 'bud-256.png', 'bud-48.png', 'bud-32.png', 'silhouette.png'];

function pngInfo(buffer) {
  // PNG 签名 + IHDR：宽高 + 颜色类型（6 = RGBA 含透明通道）
  assert.ok(buffer.length > 8);
  assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG 签名');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  return { width, height, colorType };
}

test('每个品种都有完整 manifest 与全部素材文件', () => {
  for (const id of IDS) {
    const dir = path.join(SPECIES_DIR, id);
    const manifestPath = path.join(dir, 'manifest.json');
    assert.ok(existsSync(manifestPath), `${id}/manifest.json 缺失`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.id, id);
    assert.ok(manifest.artIndex >= 1 && manifest.artIndex <= 13);
    assert.ok(manifest.nameZh);
    for (const file of FILES) {
      const p = path.join(dir, file);
      assert.ok(existsSync(p), `${id}/${file} 缺失`);
    }
  }
});

test('PNG 尺寸正确且全部带透明通道（RGBA）', () => {
  for (const id of IDS) {
    for (const [file, size] of [['mature-256.png', 256], ['mature-48.png', 48], ['mature-32.png', 32], ['bud-256.png', 256], ['bud-48.png', 48], ['bud-32.png', 32]]) {
      const info = pngInfo(readFileSync(path.join(SPECIES_DIR, id, file)));
      assert.equal(info.width, size, `${id}/${file} 宽度`);
      assert.equal(info.height, size, `${id}/${file} 高度`);
      assert.equal(info.colorType, 6, `${id}/${file} 必须是 RGBA`);
    }
  }
});

test('32px 单独渲染（不是 256 图的缩放别名）；剪影与成熟图不同', () => {
  for (const id of IDS) {
    const m32 = readFileSync(path.join(SPECIES_DIR, id, 'mature-32.png'));
    const m48 = readFileSync(path.join(SPECIES_DIR, id, 'mature-48.png'));
    const m256 = readFileSync(path.join(SPECIES_DIR, id, 'mature-256.png'));
    assert.notDeepEqual(m32.subarray(0, 64), m256.subarray(0, 64), `${id} 32px 应是独立渲染`);
    assert.notDeepEqual(m48.subarray(0, 64), m256.subarray(0, 64));
    const sil = readFileSync(path.join(SPECIES_DIR, id, 'silhouette.png'));
    assert.ok(sil.length !== m256.length || !sil.equals(m256), `${id} 剪影不应等于成熟图`);
    const bud = readFileSync(path.join(SPECIES_DIR, id, 'bud-256.png'));
    assert.ok(!bud.equals(m256), `${id} 幼菇与成熟图应有区别（临时版也做了缩小+去饱和）`);
  }
});

test('总 manifest 覆盖 13 款且幼菇标记 temporary；源 SVG 在库内', () => {
  const manifest = JSON.parse(readFileSync(path.join(SPECIES_DIR, 'species-manifest.json'), 'utf8'));
  assert.equal(manifest.species.length, 13);
  assert.equal(manifest.temporaryBud, true);
  assert.ok(manifest.note.includes('临时'));
  for (const entry of manifest.species) {
    assert.ok(existsSync(path.join(SPECIES_DIR, entry.sourceSvg)), `${entry.id} 源 SVG 缺失`);
    assert.ok(entry.temporary.bud.includes('临时'));
  }
  // ID 集合与契约一致（timid 而非 shy）
  assert.deepEqual(manifest.species.map((s) => s.id).sort(), [...IDS].sort());
});

test('A/B 对照图存在且覆盖说明完整（Demo 交付物）', () => {
  const preview = path.join(ROOT, 'previews/species-assets-2026-10-26');
  const sheet = pngInfo(readFileSync(path.join(preview, 'composite-sheet.png')));
  assert.ok(sheet.width > 1500 && sheet.height > 1500, '对照图尺寸合理');
  const readme = readFileSync(path.join(preview, 'README.md'), 'utf8');
  assert.ok(readme.includes('版本 A') && readme.includes('版本 B'));
  assert.ok(readme.includes('临时'), '幼菇临时状态必须写明');
  assert.ok(readme.includes('Windows'), '标注待 Windows 实机选定');
});
