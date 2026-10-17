/** 数值钳制 0..1（app 装配层共用）；NaN 归 0，防止污染存档与物理 */
export const clamp01 = (v: number): number => (!Number.isFinite(v) ? 0 : v < 0 ? 0 : v > 1 ? 1 : v);
