/**
 * 文件运行时状态（shared 叶子层类型）
 * 演化字段由 world/evolution.ts 状态机推进；stage 由 mtime 差派生
 */

/** 冷落度四阶段（命名与设计文档 NeglectStage 对齐） */
export type NeglectStage = 'fresh' | 'damp' | 'wet' | 'moldy';

/** 动作态 */
export type FileActionState = 'idle' | 'hung' | 'drying' | 'burnt';

/** MVP 菌种：平菇 N + 二进制金针菇 R（杂交形态搁置） */
export type MushroomSpecies = 'oyster' | 'enoki';

export interface FileRuntime {
  id: string;
  /** 湿度 0..1 */
  humidity: number;
  /** 霉变度 0..1 */
  mold: number;
  /** 焦化度 0..1 */
  char: number;
  /** 派生：由 mtime 差推导（fresh<3d / damp 3-14d / wet 14-30d / moldy >30d） */
  stage: NeglectStage;
  state: FileActionState;
  /** growth 0..1，1 可采摘 */
  mushroom: { species: MushroomSpecies; growth: number } | null;
}
