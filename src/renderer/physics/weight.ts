/**
 * 指数化质量（物理实现硬约束，SPEC §6 / AC-37）
 * sizeToMass 线性对数映射仅 5.3 倍跨度，直接驱动绳索无法表达
 * 「10KB 纹丝不动 vs 24GB 夸张深 V」（需约 28 倍视觉跨度）。
 * 刚体实际质量 = sizeToMass^p，经 Body.setMass 设置。
 * 实算锚点：10KB→1.20²=1.44 / 24GB→6.32²=39.94（跨度 27.7 倍）
 */
import { sizeToMass } from '../../shared/constants';

/** 指数 p：默认 2，可调范围 1.8-2.4（架构师调参包络锁定） */
export const MASS_EXPONENT = 2;

export function massEff(sizeBytes: number): number {
  return sizeToMass(sizeBytes) ** MASS_EXPONENT;
}
