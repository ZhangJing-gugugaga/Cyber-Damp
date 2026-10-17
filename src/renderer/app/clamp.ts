/** 数值钳制 0..1（app 装配层共用） */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
