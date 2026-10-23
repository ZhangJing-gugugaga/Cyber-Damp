/**
 * 原生自然事件共享类型（R4/R5 权威定义；Goal v9 阶段2）
 * 语义：受潮/霉变/焦化都是图标画面的风格化表达，不代表真实文件损坏。
 */

export type DamageFamily = 'damp' | 'mold' | 'char';
/** 0=干净，1=轻度，2=中度，3=重度（其他损伤的满级；霉变重度后进入菇阶段） */
export type DamageStage = 0 | 1 | 2 | 3;
export type MushroomStage = 'none' | 'young' | 'mature';

export interface DamageState {
  family: DamageFamily;
  stage: DamageStage;
  mushroom: MushroomStage;
}

/** 桌面对象的游戏侧稳定状态（与图标恢复登记按 realPath 关联） */
export interface NativeObjectState {
  /** 稳定对象 ID（d-<usageId>） */
  id: string;
  realPath: string;
  kind: 'dir' | 'lnk';
  displayName: string;
  /** 原始 mtime（变更图标前捕获；近似"最久未动"，不声称"最久未打开"） */
  originalMtime: number;
  damage: DamageState | null;
  /** 最近一次成功自然推进（epoch ms） */
  lastAdvanceAt?: number;
  /** 最近一次完整护理完成（epoch ms，任何主要损伤） */
  lastCareCompletedAt?: number;
  /** 霉变免疫到期（epoch ms）：t < 该值时霉变硬排除 */
  moldImmuneUntil?: number;
}

/** 首批（INIT）固定计划：全生命周期不变，每对象至多成功一次 */
export interface InitTargetPlan {
  id: string;
  family: DamageFamily;
  stage: DamageStage;
  mushroom: MushroomStage;
  /** 成功 / 跳过（附原因） */
  status: 'pending' | 'done' | 'skipped';
  skipReason?: string;
}

export interface InitPlan {
  k: number;
  n: number;
  seed: number;
  targets: InitTargetPlan[];
  /** 事务建立时固定的天气快照（不随刷新重抽） */
  snapshot: NativeWeatherSnapshot;
  generatedAt: number;
  completedAt?: number;
}

export type NativeEventStatus = 'pending' | 'retryable' | 'success' | 'empty' | 'init_occupied';

export interface DailyEventRecord {
  /** 系统本地自然日 YYYY-MM-DD（仅用于去重与额度） */
  date: string;
  /** 唯一事件身份（同日仅一条记录） */
  id: string;
  status: NativeEventStatus;
  seed: number;
  /** 计划的候选顺序（同轮最多尝试 3 个不同对象） */
  candidateOrder: string[];
  /** 已尝试的对象 ID */
  attempts: string[];
  snapshot?: NativeWeatherSnapshot;
}

export interface NativeWeatherSnapshot {
  temperatureC: number;
  humidityPct: number;
  weatherCode: number;
  observedAt: string;
  fetchedAt: number;
}

/** R5 认可的 WMO 码集合（Open-Meteo 官方文档显式列出者） */
export const KNOWN_WMO_CODES: ReadonlySet<number> = new Set([
  0, 1, 2, 3, 45, 48,
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86,
  95, 96, 97, 99,
]);

/** 降水/雷暴类 WMO 分组（R5 权重表第一行） */
export const PRECIPITATION_CODES: ReadonlySet<number> = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99,
]);

export const HUMIDITY_THRESHOLD = 70;
/** "十天"免疫 = 连续 240 小时（作者默认换算，交付说明与验收记录须标注） */
export const MOLD_IMMUNITY_MS = 240 * 60 * 60 * 1000;

/** 第 2 节参数表常量 */
export const INIT_K_CHOICES = [5, 6, 7, 8, 9, 10] as const;
export const INIT_INTENSITY_WEIGHTS = { light: 50, mid: 35, heavy: 15 } as const;
export const INIT_HEAVY_CAP = 2;
export const INIT_HEAVY_MOLD_MUSHROOM_WEIGHTS = { none: 50, young: 25, mature: 25 } as const;
export const DAILY_WEIGHT_CAP_DAYS = 30;
export const DAILY_WEIGHT_NO_BASELINE = 31;
export const DAILY_MAX_ATTEMPTS = 3;
