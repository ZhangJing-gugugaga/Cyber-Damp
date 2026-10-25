/**
 * 存档数据模型（shared 叶子层类型）
 * 存档契约：docs/contracts/save-format.md（schemaVersion: 1/2兼容，当前v3）
 * 主进程持有原生事件与护理状态；旧files/ropes字段仅供迁移兼容。
 */
import type { FileActionState, MushroomState } from './file-runtime';
import type { DailyEventRecord, DamageFamily, DamageStage, InitPlan, MushroomStage, NativeWeatherSnapshot } from './native';
import type { SpeciesId } from './gameplay';
import type {
  AlertState, CareSessionState, DailyEventRecordV4, NewSpeciesId, ObjectCategory,
  PlantedSpore, SporeInventory,
} from './gameplay';

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
  schemaVersion: 1 | 2 | 3 | 4;
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
  /** 本轮护理进度 0..1（松手/关窗/退出时保存，重开继续；R6） */
  careProgress?: number;
  /** 擦拭掩码 64×64 位图（base64，行优先 1bit/格）：重开还原同一批擦除洞，不按百分比随机 */
  careMask?: string;
  /** 菇品种（mushroom ≠ none 时存在；采摘进收藏，R6；v4 起必须是 SpeciesId） */
  mushroomSpecies?: SpeciesId;
  /** v4：对象类别（扫描时 classifyObject 判定，不读文件正文） */
  objectCategory?: ObjectCategory;
  /** v4：分层护理会话（存在时优先于 careProgress/careMask） */
  careSession?: CareSessionState;
  /** v4：精细护理光泽外观到期 */
  glossUntil?: number;
}

export interface NativeCollectionEntry {
  species: string;
  firstSeenAt: number;
  /** 来源对象的显示名称（改名后以最新为准） */
  sourceName: string;
}

export interface NativeSaveSection {
  /** 'legacy-initialized'：旧版升级用户，不重发首批/奖励（R4.1） */
  init: (InitPlan & { status: 'active' | 'completed' }) | { status: 'legacy-initialized' } | null;
  /** 每个本地自然日至多一条记录（R4.2 额度）；v3 记录无槽位，v4 记录含 limit/alert/slots */
  dailyEvents: Record<string, DailyEventRecord | DailyEventRecordV4>;
  objects: Record<string, NativeObjectSave>;
  /** 最近一次有效天气快照（按城市坐标缓存另存 weather-cache.json） */
  lastSnapshot: NativeWeatherSnapshot | null;
  /** 用户所选城市（R3：用户选择，不推断；新城市连同有效天气一起成功后才保存） */
  location?: { cityId: string; label: string; latitude: number; longitude: number } | null;
  /** 用户暂停（R4.3：不生成不积欠） */
  paused?: boolean;
  /** 收藏（品种、首次获得、来源对象显示名；重启一致，R6） */
  collection?: Record<string, NativeCollectionEntry>;
  /** 首局引导已完成（完成练习或跳过均只发一次 24 菇币，R6） */
  onboarded?: boolean;
  /** "恢复桌面并暂停"（R8）：原生外观已还原、事件停发；显式"继续游戏"才恢复回显与节奏 */
  restored?: boolean;
  /** v4：孢子库存（按新品种记录；旧品种不掉孢子） */
  spores?: SporeInventory;
  /** v4：播种登记（objectId → 最近一次播种） */
  planted?: Record<string, PlantedSpore>;
  /** v4：回南天警报状态（R5.3） */
  alert?: AlertState;
  /** v4：精细护理累计次数（统计用） */
  fineCareCount?: number;
  /** v4：菇合成版本（A：原图缩放菇在外；B：原图原尺寸菇压边缘） */
  overlayVariant?: 'A' | 'B';
}

/** v4 孢子品种键集合的类型收窄辅助 */
export type SporeSpecies = NewSpeciesId;
