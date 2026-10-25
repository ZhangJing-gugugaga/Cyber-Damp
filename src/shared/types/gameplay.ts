/**
 * v0.2 玩法共享契约（草案 v1.15-draft，2026-10-25；员工 2 起草，员工 1 审阅）
 * 文档：docs/contracts/gameplay-v2.md。规格：docs/PRODUCT.md R4/R5/R6/R9。
 *
 * 本文件只定义类型与常量，不含规则实现：
 * - 领域规则（品种判定、日额度、分层护理、蔓延、警报、壁纸像素）由员工 1 在 src/world 与 src/shared 实现；
 * - 原生接线（IPC、调度、图标合成、Win32 壁纸）由员工 2 在 src/main 与 src/preload 实现。
 * preload 尚未暴露 NativeV2Api / WallpaperApi 的通道；浏览器模拟环境与后续接线按本类型对齐。
 * 存档 v4 字段先以 *V4Fields 扩展接口给出，迁移任务完成时并入 save.ts 与 save-schema.ts。
 */
import type { DamageFamily, DamageStage, MushroomStage, NativeEventStatus, NativeWeatherSnapshot } from './native';

// ---------- 品种 ----------

/** 13 款新品种（与美术资产 01–13 一一对应；ID 与旧品种不重名） */
export const NEW_SPECIES_IDS = [
  'bubble',     // 01 返潮泡泡菇
  'moss',       // 02 青苔披肩菇
  'bell',       // 03 水滴风铃菇
  'lantern',    // 04 雾灯菇
  'archive',    // 05 压缩包菇
  'waterfall',  // 06 截图瀑布菇
  'ghosted',    // 07 已读不回菇
  'sleepless',  // 08 晚安失眠菇
  'timid',      // 09 社恐缩头菇（不得使用 'shy'：旧存档 'shy' 为胆小菇）
  'broken',     // 10 断线菇
  'pixel',      // 11 像素噪点菇
  'undo',       // 12 撤销菇
  'rain-crown', // 13 雨神之冠（仅回南天警报期间）
] as const;
export type NewSpeciesId = typeof NEW_SPECIES_IDS[number];

/** 旧存档品种：ID 原样保留，不改名、不删除；收藏页归入"早期品种"，新事件不再产生 */
export const LEGACY_SPECIES_IDS = ['oyster', 'enoki', 'shy', 'bolete', 'lava'] as const;
export type LegacySpeciesId = typeof LEGACY_SPECIES_IDS[number];

export type SpeciesId = NewSpeciesId | LegacySpeciesId;
export type SpeciesRarity = 'common' | 'uncommon' | 'rare';

export function isNewSpeciesId(value: unknown): value is NewSpeciesId {
  return typeof value === 'string' && (NEW_SPECIES_IDS as readonly string[]).includes(value);
}
export function isSpeciesId(value: unknown): value is SpeciesId {
  return isNewSpeciesId(value) || (typeof value === 'string' && (LEGACY_SPECIES_IDS as readonly string[]).includes(value));
}

// ---------- 对象类别（只看 .lnk 目标元数据与文件夹属性，不读文件正文） ----------

export const OBJECT_CATEGORIES = ['folder', 'archive', 'image', 'chat', 'code', 'game', 'browser', 'other'] as const;
export type ObjectCategory = typeof OBJECT_CATEGORIES[number];

// ---------- 自然事件节奏（R4.2 v0.2） ----------

export const DAILY_SLOT_LIMIT = 3;
export const ALERT_DAILY_SLOT_LIMIT = 5;
/** 每个槽位最多尝试的不同候选数（沿用 DAILY_MAX_ATTEMPTS 语义） */
export const SLOT_MAX_ATTEMPTS = 3;

/** 槽位来源：自然推进 / 相邻蔓延 / 玩家播种；三者共用同一日额度 */
export type DailySlotSource = 'natural' | 'spread' | 'planted';

export interface DailySlot {
  objectId: string;
  source: DailySlotSource;
  /** 推进前后损伤（用于结算与回放核对） */
  family: DamageFamily;
  fromStage: DamageStage;
  toStage: DamageStage;
  mushroom: MushroomStage;
  /** 本次长出/指定的品种（幼菇出现时确定，之后不随天气重抽） */
  species?: SpeciesId;
  /** source=spread 时的传染源对象 */
  fromObjectId?: string;
  status: 'pending' | 'success' | 'skipped';
  skipReason?: string;
}

/**
 * v4 每日账本：每个本地日期仍只有一条记录（一个事件身份），内含至多 limit 个槽位。
 * status 语义沿用 v3：success = 本日计划已结算（≥1 槽位成功或候选用尽后至少一次成功）；
 * empty = 无可推进；retryable = 全部尝试失败仍占用同一身份。
 */
export interface DailyEventRecordV4 {
  date: string;
  id: string;
  status: NativeEventStatus;
  seed: number;
  /** 建立记录时固定的额度（3 或警报期 5）；之后天气刷新不改变 */
  limit: number;
  alert: boolean;
  candidateOrder: string[];
  /** 已尝试对象（总数 ≤ limit × SLOT_MAX_ATTEMPTS） */
  attempts: string[];
  slots: DailySlot[];
  snapshot?: NativeWeatherSnapshot;
}

// ---------- 护理 2.0：分层与工具（R6 v0.2） ----------

export type CareLayerId = 'droplets' | 'film' | 'mold' | 'soot' | 'scorch';

/** 每族护理层，自上而下；轻度只有第一层，中/重度全部层 */
export const CARE_LAYERS_BY_FAMILY: Readonly<Record<DamageFamily, readonly CareLayerId[]>> = {
  damp: ['droplets', 'film'],
  mold: ['mold'],
  char: ['soot', 'scorch'],
};

/** 工具 ID 与 repair-tools-v1 / care-assets-v1 资产文件名一致 */
export type CareToolId =
  | 'sponge' | 'cloth' | 'scissors'
  | 'sprayer' | 'scrubbrush'
  | 'blotter' | 'squeegee' | 'blower'
  | 'sootblock' | 'dustbrush' | 'repairroller';

export type CareGesture = 'drag' | 'tap' | 'strip' | 'hold' | 'roll' | 'cut';

export interface CareLayerState {
  layer: CareLayerId;
  /** care-mask 编码（64×64，1=已清除），与 src/shared/care-mask.ts 同一编解码 */
  mask: string;
  /** 仅 mold：喷壶软化掩码（1=已软化）；软化不等于清除 */
  softened?: string;
  /** 该层清除比例 0..1（按实际损伤像素计） */
  progress: number;
}

/** 单对象护理会话（松手/关窗/退出保存，重开继续） */
export interface CareSessionState {
  version: 2;
  /** 会话针对的损伤；与对象当前损伤不一致时会话作废（防旧回执覆盖新状态） */
  family: DamageFamily;
  stage: DamageStage;
  layers: CareLayerState[];
  /** 本会话实际用过的工具（去重），领域层据此判定精细护理 */
  toolsUsed: CareToolId[];
  /** 0..1 总进度（各层按面积加权） */
  progress: number;
}

// ---------- 采摘、孢子与播种 ----------

export type SporeInventory = Partial<Record<NewSpeciesId, number>>;

export interface PlantedSpore {
  objectId: string;
  species: NewSpeciesId;
  plantedAt: number;
  /** 被日账本消费时记录事件 ID */
  eventId?: string;
  status: 'pending' | 'completed' | 'cancelled';
  cancelReason?: string;
}

// ---------- 回南天警报（R5 v0.2） ----------

export interface AlertState {
  active: boolean;
  startedAt?: number;
  endsAt?: number;
  reason?: 'humidity' | 'precipitation-streak';
  /** 连续降水的有效天气检查次数（按不同 observedAt 计，刷新同一快照不累加） */
  precipitationStreak: number;
  lastObservedAt?: string;
}

// ---------- 今日菌讯 ----------

export interface DailyForecast {
  date: string;
  /** 生成依据的快照时间；默认天气必须标 defaulted */
  observedAt: string;
  defaulted: boolean;
  alertActive: boolean;
  favoredSpecies: NewSpeciesId[];
  recommendedTools: CareToolId[];
  headline: string;
  lines: string[];
}

// ---------- 壁纸（R9） ----------

export type WallpaperSkipReason =
  | 'slideshow' | 'spotlight' | 'solid-color' | 'live-wallpaper-app'
  | 'user-changed' | 'unreadable' | 'unsupported-format';

/** 纯像素合成输入（员工 1 实现，主进程与护理台共用） */
export interface WallpaperEffectInput {
  width: number;
  height: number;
  humidityPct: number;
  weatherCode: number;
  alertActive: boolean;
  /** 墙角霉斑 0–3，仅警报期增长 */
  cornerMoldStage: 0 | 1 | 2 | 3;
  /** 擦雾掩码（care-mask 编码，1=已擦净） */
  fogMask?: string;
  seed: number;
}

export interface WallpaperView {
  enabled: boolean;
  status: 'off' | 'active' | 'skipped' | 'error';
  skipReason?: WallpaperSkipReason;
  message?: string;
  fogLevel: number;
  cornerMoldStage: 0 | 1 | 2 | 3;
  fogMask?: string;
  wipeProgress: number;
  /** 原壁纸缩略图（≤480px 宽 PNG data URL），供墙面页合成预览 */
  thumbnailDataUrl?: string;
  lastAppliedAt?: number;
}

// ---------- 存档 v4 扩展字段（迁移任务并入 save.ts） ----------

export interface NativeObjectSaveV4Fields {
  objectCategory?: ObjectCategory;
  careSession?: CareSessionState;
  /** 精细护理光泽外观到期 */
  glossUntil?: number;
}

export interface NativeSaveSectionV4Fields {
  spores?: SporeInventory;
  planted?: Record<string, PlantedSpore>;
  alert?: AlertState;
  fineCareCount?: number;
  /** 菇合成版本（A：原图缩放菇在外；B：原图原尺寸菇压边缘） */
  overlayVariant?: 'A' | 'B';
}

// ---------- IPC 载荷与结果（草案；见 docs/contracts/gameplay-v2.md） ----------

export interface CareProgressV2Payload {
  objectId: string;
  /** 渲染层认为的当前损伤；与存档不符则拒绝（旧回执） */
  family: DamageFamily;
  stage: DamageStage;
  session: CareSessionState;
}

export interface CareCompleteV2Result {
  ok: boolean;
  message?: string;
  fine?: boolean;
  bonusCoins?: number;
  immunityUntil?: number;
  glossUntil?: number;
}

export interface HarvestV2Payload {
  objectId: string;
  /** 剪切质量 0..1（渲染层按切线与菌柄的距离计算，主进程夹取到范围内） */
  cutQuality: number;
}

export interface HarvestV2Result {
  ok: boolean;
  message?: string;
  coins?: number;
  species?: SpeciesId;
  spore?: NewSpeciesId;
}

export interface PlantSporePayload {
  objectId: string;
  species: NewSpeciesId;
}

export interface NativeStatusV4Fields {
  forecast: DailyForecast | null;
  alert: AlertState;
  spores: SporeInventory;
  planted: PlantedSpore[];
  dailyLimit: number;
  dailyUsed: number;
  overlayVariant: 'A' | 'B';
}

export interface NativeObjectViewV4Fields {
  objectCategory: ObjectCategory;
  careSession?: CareSessionState;
  plantedSpecies?: NewSpeciesId;
  glossUntil?: number;
  /** 相邻对象 ID（由真实桌面坐标计算，只读，不移动图标） */
  neighbors: string[];
}

type Outcome = { ok: boolean; message?: string };

/** 新增 native 方法（并入 window.damp.native） */
export interface NativeV2Api {
  careProgressV2(payload: CareProgressV2Payload): Promise<Outcome>;
  careCompleteV2(objectId: string): Promise<CareCompleteV2Result>;
  harvestV2(payload: HarvestV2Payload): Promise<HarvestV2Result>;
  plantSpore(payload: PlantSporePayload): Promise<Outcome>;
  cancelPlant(objectId: string): Promise<Outcome>;
  setOverlayVariant(variant: 'A' | 'B'): Promise<Outcome>;
}

/** 新增 window.damp.wallpaper 组 */
export interface WallpaperApi {
  status(): Promise<WallpaperView>;
  setEnabled(on: boolean): Promise<Outcome & { view?: WallpaperView }>;
  /** 松手或确认时提交擦雾掩码；主进程限频合成并设置壁纸 */
  wipe(payload: { fogMask: string; progress: number }): Promise<Outcome & { view?: WallpaperView }>;
}
