/**
 * 状态图标合成（阶段2占位材质 → 阶段3接入已认可资产管线）
 *
 * R7 约束：对每个真实原图分别合成，不贴通用成品；原图轮廓/透明留白/标志
 * 必须可辨认；输入不含桌面背景/文字/选中框/快捷方式箭头（箭头由 Explorer 绘制）。
 * 本实现用"原图 + 半透明族色叠加 + 菇斑"的占位合成保证端到端闭环可测；
 * 阶段 3 用 care-assets-v1/repair-tools-v1 认可材质替换 blend 管线，接口不变。
 */
import { nativeImage } from 'electron';
import type { DamageState } from '../../shared/types/native';

const STATE_SIZE = 256;

/** 族色与不透明度（ABGR 由像素循环写入；占位材质，阶段3替换） */
const FAMILY_TINT: Record<string, { r: number; g: number; b: number; alpha: [number, number, number] }> = {
  damp: { r: 52, g: 118, b: 214, alpha: [0.28, 0.48, 0.68] },   // 水渍默认蓝
  mold: { r: 108, g: 128, b: 62, alpha: [0.30, 0.52, 0.74] },
  char: { r: 46, g: 38, b: 32, alpha: [0.32, 0.55, 0.76] },
};

export async function composeStateIconPng(sourcePng: Buffer, damage: DamageState | null): Promise<Buffer> {
  const source = nativeImage.createFromBuffer(sourcePng);
  if (source.isEmpty()) throw new Error('原图标 PNG 无法解码，无法合成状态图标');
  const resized = source.resize({ width: STATE_SIZE, height: STATE_SIZE, quality: 'best' });
  if (!damage) return resized.toPNG();

  const size = resized.getSize();
  const bitmap = resized.toBitmap(); // BGRA
  const out = Buffer.from(bitmap);
  const tint = FAMILY_TINT[damage.family];
  const alphaScale = tint.alpha[Math.min(damage.stage, 3) - 1] ?? 0.3;
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a === 0) continue; // 透明留白不污染（原图轮廓可辨认）
    const k = (a / 255) * alphaScale;
    out[i] = Math.round(out[i] * (1 - k) + tint.b * k);
    out[i + 1] = Math.round(out[i + 1] * (1 - k) + tint.g * k);
    out[i + 2] = Math.round(out[i + 2] * (1 - k) + tint.r * k);
  }
  const composed = nativeImage.createFromBitmap(out, { width: size.width, height: size.height });
  return addMushroom(composed, damage).toPNG();
}

/** 成熟/幼菇以可见菇斑加入图标外观（R7：玩家看得出可采摘）。 */
function addMushroom(image: Electron.NativeImage, damage: DamageState): Electron.NativeImage {
  if (damage.mushroom === 'none') return image;
  const size = image.getSize();
  const bitmap = Buffer.from(image.toBitmap());
  const cx = Math.round(size.width * 0.5);
  const cy = Math.round(size.height * 0.78);
  const radius = Math.round(Math.min(size.width, size.height) * (damage.mushroom === 'mature' ? 0.20 : 0.13));
  const cap = { r: 122, g: 168, b: 84 };   // 菇盖
  const stem = { r: 226, g: 218, b: 196 }; // 菌柄
  for (let y = Math.max(0, cy - radius * 2); y < Math.min(size.height, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius * 2); x < Math.min(size.width, cx + radius * 2); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const i = (y * size.width + x) * 4;
      if (dy < 0) {
        // 半圆菇盖
        if (dx * dx + dy * dy <= radius * radius) {
          blendPixel(bitmap, i, cap, 0.96);
        }
      } else {
        // 菌柄（略窄）
        const halfStem = Math.max(1, Math.round(radius * 0.35));
        if (Math.abs(dx) <= halfStem && dy <= radius * 0.9) {
          blendPixel(bitmap, i, stem, 0.95);
        }
      }
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size.width, height: size.height });
}

function blendPixel(bgra: Buffer, i: number, color: { r: number; g: number; b: number }, alpha: number): void {
  const a = bgra[i + 3] / 255;
  const k = alpha * Math.max(a, 0.85);
  bgra[i] = Math.round(bgra[i] * (1 - k) + color.b * k);
  bgra[i + 1] = Math.round(bgra[i + 1] * (1 - k) + color.g * k);
  bgra[i + 2] = Math.round(bgra[i + 2] * (1 - k) + color.r * k);
  bgra[i + 3] = Math.round(Math.min(255, (bgra[i + 3] + alpha * 255 * (1 - a / 255))));
}
