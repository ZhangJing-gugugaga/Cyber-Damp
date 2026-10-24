/**
 * 存档数据模型（shared 叶子层类型）
 * 机器可读契约：docs/contracts/save-schema.json（schemaVersion: 1）
 * 只存逻辑态，不存物理刚体；mtime/x/y/name/ext/size 由真实桌面扫描重建，不入存档
 */
import type { FileActionState, MushroomState } from './file-runtime';
import type { DailyEventRecord, DamageFamily, DamageStage, InitPlan, MushroomStage, NativeWeatherSnapshot } from './native';

export interface PlayerState {
  coins: number;
  /** 已拥有道具 id 列表 */
  owned: string[];
  equipped: { rope: string; clip: string };
}

export interface FileRuntimeSave {
  sourceMtime?: number;
  fileIdentity?: string;
  dryCare?: boolean;
  refreshedAt?: number;
  id: string;
  humidity: number;
  mold: number;
  char: number;
  dryness?: number;
  state: FileActionState;
  mushroom: MushroomState | null;
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
  schemaVersion: 1 | 2 | 3;
  savedAt: number;
  player: PlayerState;
  weather: { city: string; migratedOn: string };
  files: FileRuntimeSave[];
  ropes: RopeSave[];
  stats: { harvested: number; earned: number; playedMs: number };
  /** v3：原生自然事件与对象状态（Goal v9 R4/R5）；v1/v2 迁移时标记为旧版已初始化 */
  native?: NativeSaveSection;
}

export interface NativeObjectSave {
  id: string;
  realPath: string;
  kind: 'dir' | 'lnk';
  displayName: string;
  originalMtime: number;
  damage: { family: DamageFamily; stage: DamageStage; mushroom: MushroomStage } | null;
  lastAdvanceAt?: number;
  lastCareCompletedAt?: number;
  moldImmuneUntil?: number;
}

export interface NativeSaveSection {
  /** 'legacy-initialized'：旧版升级用户，不重发首批/奖励（R4.1） */
  init: (InitPlan & { status: 'active' | 'completed' }) | { status: 'legacy-initialized' } | null;
  /** 每个本地自然日至多一条记录（R4.2 额度） */
  dailyEvents: Record<string, DailyEventRecord>;
  objects: Record<string, NativeObjectSave>;
  /** 最近一次有效天气快照（按城市坐标缓存另存 weather-cache.json） */
  lastSnapshot: NativeWeatherSnapshot | null;
  /** 用户所选城市（R3：用户选择，不推断；新城市连同有效天气一起成功后才保存） */
  location?: { cityId: string; label: string; latitude: number; longitude: number } | null;
  /** 用户暂停（R4.3：不生成不积欠） */
  paused?: boolean;
}
