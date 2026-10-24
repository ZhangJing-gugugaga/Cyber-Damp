/**
 * 状态图标合成（Goal v9 修复轮：接入认可材质与资产）
 *
 * 三层：原图（任意真实图标像素）→ 认可材质损伤层（shared/material/effects，
 * 与护理台污染层同一实现、同一款式派生）→ 认可蘑菇资产（独立图层，
 * bud/mature）。只改损伤层 RGB；透明留白/非满方格轮廓保持原图。
 */
import { nativeImage } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { applyDamageMaterial, damageVariant } from '../../shared/material/effects';
import type { DamageState } from '../../shared/types/native';

const STATE_SIZE = 256;

const SPECIES_SHAPE: Record<string, string> = {
  oyster: 'round', enoki: 'cluster', shy: 'fan', bolete: 'round', lava: 'fan',
};

function mushroomAsset(species: string | undefined, stage: 'none' | 'young' | 'mature'): string | null {
  if (stage === 'none') return null;
  const shape = SPECIES_SHAPE[species ?? 'oyster'] ?? 'round';
  const file = `${shape}-${stage === 'mature' ? 'mature' : 'bud'}.png`;
  const assetPath = path.join(__dirname, '..', '..', 'renderer', 'assets', 'care', file);
  return fs.existsSync(assetPath) ? assetPath : null;
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

export async function composeStateIconPng(sourcePng: Buffer, damage: DamageState | null, objectId = '', species = 'oyster'): Promise<Buffer> {
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

  // 蘑菇独立图层：认可资产按品种/阶段贴底（清洗不掉菇、采摘只去菇）
  if (damage.mushroom === 'none') return styled.toPNG();
  const shape = SPECIES_SHAPE[species] ?? 'round';
  const shapeAsset = path.join(__dirname, '..', '..', 'renderer', 'assets', 'care',
    `${shape}-${damage.mushroom === 'mature' ? 'mature' : 'bud'}.png`);
  if (!fs.existsSync(shapeAsset)) return styled.toPNG();
  const mushroom = nativeImage.createFromPath(shapeAsset);
  if (mushroom.isEmpty()) return styled.toPNG();

  return withRgba(styled, (rgba, width, height) => {
    const m = mushroom.resize({ width: Math.round(width * 0.52), height: Math.round(height * 0.52), quality: 'best' });
    const mSize = m.getSize();
    const mBgra = m.toBitmap();
    const baseX = Math.round((width - mSize.width) / 2);
    const baseY = Math.round(height - mSize.height * 0.86);
    for (let y = 0; y < mSize.height; y += 1) {
      for (let x = 0; x < mSize.width; x += 1) {
        const mi = (y * mSize.width + x) * 4;
        const alpha = mBgra[mi + 3] / 255;
        if (alpha <= 0.02) continue;
        const px = baseX + x;
        const py = baseY + y;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const pi = (py * width + px) * 4;
        const mr = mBgra[mi + 2], mg = mBgra[mi + 1], mb = mBgra[mi]; // BGRA -> RGB
        rgba[pi] = Math.round(rgba[pi] * (1 - alpha) + mr * alpha);
        rgba[pi + 1] = Math.round(rgba[pi + 1] * (1 - alpha) + mg * alpha);
        rgba[pi + 2] = Math.round(rgba[pi + 2] * (1 - alpha) + mb * alpha);
        rgba[pi + 3] = Math.max(rgba[pi + 3], Math.round(alpha * 255));
      }
    }
  }).toPNG();
}
