/**
 * 文件运行时状态（shared 叶子层类型）
 * 演化字段由 world/evolution.ts 状态机推进；stage 由 mtime 差派生
 */

/** 冷落度四阶段（命名与设计文档 NeglectStage 对齐） */
export type NeglectStage = 'fresh' | 'damp' | 'wet' | 'moldy';

/** 动作态 */
export type FileActionState = 'idle' | 'hung' | 'drying' | 'burnt';

/** Ordinary species retain their existing selection; hybrids need physical conditions. */
export type MushroomSpecies = 'oyster' | 'enoki' | 'shy' | 'bolete' | 'lava';

export interface MushroomState {
  species: MushroomSpecies;
  growth: number;
  /** Bolete cooking progress 0..1; three seconds of hot air cooks it. */
  cooking?: number;
  /** Cut bolete oxidation age, clamped to 0..0.5 seconds. */
  cutAgeSeconds?: number;
  /** Mature lava countdown 0..12 seconds; absent until maturity. */
  lavaSeconds?: number;
}

export interface FileRuntime {
  dryCare?: boolean;
  refreshedAt?: number;
  id: string;
  /** 湿度 0..1 */
  humidity: number;
  /** 霉变度 0..1 */
  mold: number;
  /** 焦化度 0..1 */
  char: number;
  /** Sustained hot-air exposure, reset on release; intentionally not saved. */
  heatSeconds?: number;
  /** 0..1 parchment desiccation shared by shape, texture and click sound. */
  dryness?: number;
  /** 派生：由 mtime 差推导（fresh<3d / damp 3-14d / wet 14-30d / moldy >30d） */
  stage: NeglectStage;
  state: FileActionState;
  /** growth 0..1，1 可采摘 */
  mushroom: MushroomState | null;
}
