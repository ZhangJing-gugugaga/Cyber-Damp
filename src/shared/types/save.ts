/**
 * 存档数据模型（shared 叶子层类型）
 * 机器可读契约：docs/contracts/save-schema.json（schemaVersion: 1）
 * 只存逻辑态，不存物理刚体；mtime/x/y/name/ext/size 由真实桌面扫描重建，不入存档
 */
import type { FileActionState, MushroomSpecies } from './file-runtime';

export interface PlayerState {
  coins: number;
  /** 已拥有道具 id 列表 */
  owned: string[];
  equipped: { rope: string; clip: string };
}

export interface FileRuntimeSave {
  id: string;
  humidity: number;
  mold: number;
  char: number;
  state: FileActionState;
  mushroom: { species: MushroomSpecies; growth: number } | null;
}

export interface RopeSave {
  id: string;
  /** 两端锚点坐标（工作区左上为原点） */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** 绳型 id：rope-1 麻绳 / rope-2 红塑料绳 / rope-3 不锈钢杆 */
  tier: string;
  fileIds: string[];
}

export interface SaveData {
  schemaVersion: 1;
  savedAt: number;
  player: PlayerState;
  weather: { city: string; migratedOn: string };
  files: FileRuntimeSave[];
  ropes: RopeSave[];
  stats: { harvested: number; earned: number; playedMs: number };
}
