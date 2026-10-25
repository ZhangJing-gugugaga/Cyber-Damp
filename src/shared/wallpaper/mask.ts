/**
 * 壁纸擦雾掩码（R9 v0.2；Task 14）
 *
 * 擦雾掩码与护理掩码同一编码（src/shared/care-mask.ts，64×64，1=已擦净），
 * 独立于图标护理会话保存（WallpaperView.fogMask）。松手或确认时才提交，
 * 主进程限频合成，不逐帧设置壁纸。
 */
import { CARE_MASK_CELLS, decodeCareMask, encodeCareMask } from '../care-mask';

/** 合并一次擦拭（wipeCells：64×64 行主序索引，1=擦净）。 */
export function applyWipe(current: string | undefined, wipeCells: readonly number[]): string {
  const mask = current ? decodeCareMask(current) ?? new Uint8Array(CARE_MASK_CELLS) : new Uint8Array(CARE_MASK_CELLS);
  for (const cell of wipeCells) {
    if (cell >= 0 && cell < CARE_MASK_CELLS) mask[cell] = 1;
  }
  return encodeCareMask(mask);
}

/** 擦拭进度：已擦净格 / 总格数（0..1）。 */
export function wipeProgress(mask: string | undefined): number {
  if (!mask) return 0;
  const decoded = decodeCareMask(mask);
  if (!decoded) return 0;
  let cleared = 0;
  for (let i = 0; i < decoded.length; i += 1) cleared += decoded[i];
  return cleared / CARE_MASK_CELLS;
}

/** 指定格是否已擦净（合成时跳过雾层用）。 */
export function isCellWiped(mask: string | undefined, cell: number): boolean {
  if (!mask) return false;
  const decoded = decodeCareMask(mask);
  return decoded ? decoded[cell] === 1 : false;
}
