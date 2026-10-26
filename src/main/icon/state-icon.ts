/**
 * 状态图标合成（Goal v9 修复轮：接入认可材质与资产；v0.2 接入 13 款新品种与 A/B 合成）
 *
 * 三层：原图（任意真实图标像素）→ 认可材质损伤层（shared/material/effects，
 * 与护理台污染层同一实现、同一款式派生）→ 蘑菇资产（独立图层，bud/mature）。
 * 只改损伤层 RGB；透明留白/非满方格轮廓保持原图。
 *
 * 菇资产来源：
 * - 13 款新品种：assets/care/species/<id>/{bud|mature}-256.png（species-manifest.json，员工 1 素材管线）；
 *   新资产是 256 全幅透明菌群，按 A/B 版本与原图叠合（与 scripts/build-species-assets.cjs 对照图同一比例）：
 *   A = 原图缩到 0.60 置于底部中央，菌群全幅从外围长出；B = 原图保持 0.86，菌群压在边缘。
 * - 旧品种（oyster/enoki/shy/bolete/lava）：沿用 v0.1 round/cluster/fan 资产与原布局，旧存档外观不变。
 */
import { nativeImage } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { applyDamageMaterial, damageVariant } from '../../shared/material/effects';
import type { DamageState } from '../../shared/types/native';
import { isNewSpeciesId } from '../../shared/types/gameplay';

const STATE_SIZE = 256;

export type OverlayVariant = 'A' | 'B';

/** A/B 原图缩放比例（与员工 1 对照图 build-species-assets.cjs 一致） */
const VARIANT_BASE_SCALE: Record<OverlayVariant, number> = { A: 0.60, B: 0.86 };

const LEGACY_SPECIES_SHAPE: Record<string, string> = {
  oyster: 'round', enoki: 'cluster', shy: 'fan', bolete: 'round', lava: 'fan',
};

function assetsRoot(): string {
  return path.join(__dirname, '..', '..', 'renderer', 'assets', 'care');
}

/** 新品种资产路径（不存在返回 null，由调用方退回无菇外观并记录）。 */
export function speciesAssetPath(species: string, stage: 'young' | 'mature'): string | null {
  if (!isNewSpeciesId(species)) return null;
  const file = path.join(assetsRoot(), 'species', species, `${stage === 'mature' ? 'mature' : 'bud'}-256.png`);
  return fs.existsSync(file) ? file : null;
}

function legacyAssetPath(species: string, stage: 'young' | 'mature'): string | null {
  const shape = LEGACY_SPECIES_SHAPE[species] ?? 'round';
  const file = path.join(assetsRoot(), `${shape}-${stage === 'mature' ? 'mature' : 'bud'}.png`);
  return fs.existsSync(file) ? file : null;
}

/** RGBA <-> BGRA 包装：nativeImage.toBitmap 在 Windows 为 BGRA */
function withRgba(image: Electron.NativeImage, fn: (rgba: Uint8ClampedArray, width: number, height: number) => void): Electron.NativeImage {
  const size = image.getSize();
  const bgra = Buffer.from(image.toBitmap());
  for (let i = 0; i < bgra.length; i += 4) {
    const b = bgra[i];
    bgra[i] = bgra[i + 2];
    bgra[i + 2] = b;
  }
  const rgba = new Uint8ClampedArray(bgra.buffer, bgra.byteOffset, bgra.byteLength);
  fn(rgba, size.width, size.height);
  const out = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    out[i] = out[i + 2];
    out[i + 2] = r;
  }
  return nativeImage.createFromBitmap(out, { width: size.width, height: size.height });
}

/** 把 BGRA 图层按 alpha 叠到 RGBA 画布 (offsetX, offsetY) 处（source-over）。 */
function blendBgraOver(rgba: Uint8ClampedArray, width: number, height: number,
  layer: Buffer, lw: number, lh: number, offsetX: number, offsetY: number): void {
  for (let y = 0; y < lh; y += 1) {
    const py = offsetY + y;
    if (py < 0 || py >= height) continue;
    for (let x = 0; x < lw; x += 1) {
      const px = offsetX + x;
      if (px < 0 || px >= width) continue;
      const li = (y * lw + x) * 4;
      const alpha = layer[li + 3] / 255;
      if (alpha <= 0.004) continue;
      const pi = (py * width + px) * 4;
      const dstA = rgba[pi + 3] / 255;
      const outA = alpha + dstA * (1 - alpha);
      const mix = (src: number, dst: number) => (src * alpha + dst * dstA * (1 - alpha)) / (outA || 1);
      rgba[pi] = Math.round(mix(layer[li + 2], rgba[pi]));
      rgba[pi + 1] = Math.round(mix(layer[li + 1], rgba[pi + 1]));
      rgba[pi + 2] = Math.round(mix(layer[li], rgba[pi + 2]));
      rgba[pi + 3] = Math.round(outA * 255);
    }
  }
}

/** 新品种：原图按版本缩放置于底部中央的透明 256 画布，再叠全幅菌群。 */
function composeNewSpecies(styled: Electron.NativeImage, assetPath: string, variant: OverlayVariant): Electron.NativeImage | null {
  const cluster = nativeImage.createFromPath(assetPath);
  if (cluster.isEmpty()) return null;
  const scale = VARIANT_BASE_SCALE[variant];
  const baseSize = Math.round(STATE_SIZE * scale);
  const base = styled.resize({ width: baseSize, height: baseSize, quality: 'best' });
  const baseX = Math.round((STATE_SIZE - baseSize) / 2);
  const baseY = STATE_SIZE - baseSize - Math.round(STATE_SIZE * 0.02);
  const canvas = nativeImage.createFromBitmap(Buffer.alloc(STATE_SIZE * STATE_SIZE * 4), { width: STATE_SIZE, height: STATE_SIZE });
  const clusterFull = cluster.resize({ width: STATE_SIZE, height: STATE_SIZE, quality: 'best' });
  return withRgba(canvas, (rgba, width, height) => {
    blendBgraOver(rgba, width, height, Buffer.from(base.toBitmap()), baseSize, baseSize, baseX, baseY);
    blendBgraOver(rgba, width, height, Buffer.from(clusterFull.toBitmap()), STATE_SIZE, STATE_SIZE, 0, 0);
  });
}

/** 旧品种：沿用 v0.1 布局（原图原尺寸，菇 0.52 贴底部中央）。 */
function composeLegacy(styled: Electron.NativeImage, assetPath: string): Electron.NativeImage | null {
  const mushroom = nativeImage.createFromPath(assetPath);
  if (mushroom.isEmpty()) return null;
  return withRgba(styled, (rgba, width, height) => {
    const m = mushroom.resize({ width: Math.round(width * 0.52), height: Math.round(height * 0.52), quality: 'best' });
    const mSize = m.getSize();
    const baseX = Math.round((width - mSize.width) / 2);
    const baseY = Math.round(height - mSize.height * 0.86);
    blendBgraOver(rgba, width, height, Buffer.from(m.toBitmap()), mSize.width, mSize.height, baseX, baseY);
  });
}

export async function composeStateIconPng(
  sourcePng: Buffer,
  damage: DamageState | null,
  objectId = '',
  species = 'oyster',
  variant: OverlayVariant = 'A',
): Promise<Buffer> {
  const source = nativeImage.createFromBuffer(sourcePng);
  if (source.isEmpty()) throw new Error('原图标 PNG 无法解码，无法合成状态图标');
  const resized = source.resize({ width: STATE_SIZE, height: STATE_SIZE, quality: 'best' });
  if (!damage) return resized.toPNG();

  // 损伤层：认可材质（stage=0 干净 → 不套任何染色）
  const styled = damage.stage > 0
    ? withRgba(resized, (rgba, width, height) => {
      const type = damageVariant(objectId, damage.family);
      applyDamageMaterial({ data: rgba, width, height, stage: damage.stage as 1 | 2 | 3, type });
    })
    : resized;

  // 蘑菇独立图层：清洗不掉菇、采摘只去菇
  if (damage.mushroom === 'none') return styled.toPNG();
  const stage = damage.mushroom === 'mature' ? 'mature' : 'young';
  const newAsset = speciesAssetPath(species, stage);
  if (newAsset) {
    const composed = composeNewSpecies(styled, newAsset, variant);
    if (composed) return composed.toPNG();
  }
  const legacy = isNewSpeciesId(species) ? null : legacyAssetPath(species, stage);
  if (legacy) {
    const composed = composeLegacy(styled, legacy);
    if (composed) return composed.toPNG();
  }
  console.warn('[state-icon] 菇资产缺失，按无菇外观合成:', species, stage);
  return styled.toPNG();
}
