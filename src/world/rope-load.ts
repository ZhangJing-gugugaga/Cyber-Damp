/**
 * 绳负载判定（world 纯领域层）
 * 80% ~ 99% → 物理预警（抖动 + 挂钩裂纹）；≥100% → 断开右端约束。
 * 按字节累计判定（sizeBytes 为真实文件字节数）。
 */
import { ROPE_BYTE_LIMITS } from '../shared/constants';

export type RopeLoadState = 'safe' | 'warn' | 'break';

export function ropeByteLimit(tier: string): number {
  return ROPE_BYTE_LIMITS[tier as keyof typeof ROPE_BYTE_LIMITS] ?? ROPE_BYTE_LIMITS['rope-1'];
}

export function ropeLoadRatio(totalBytes: number, tier: string): number {
  const limit = ropeByteLimit(tier);
  return limit > 0 ? totalBytes / limit : 0;
}

export function ropeLoadState(totalBytes: number, tier: string): RopeLoadState {
  const ratio = ropeLoadRatio(totalBytes, tier);
  if (ratio >= 1) return 'break';
  if (ratio >= 0.8) return 'warn';
  return 'safe';
}
