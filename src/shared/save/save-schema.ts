/**
 * 存档校验与版本迁移（shared 叶子层，手写无 zod）
 * 契约：docs/contracts/save-format.md（v1/v2 兼容，v3→v4 迁移见 gameplay-v2 契约）
 * AC-24/27：读路径任何结构不满足返回 null；写路径同样必须过此校验（防 NaN 落盘后静默清档）
 * v4：分层护理会话、孢子、播种、警报、日账本槽位（R4.2/R5/R6 v0.2）。
 */
import type { SaveData } from '../types/save';
import type { FileActionState } from '../types/file-runtime';
import { isSpeciesId, isNewSpeciesId, OBJECT_CATEGORIES } from '../types/gameplay';
import { validateCareSession, migrateLegacyCare } from '../care-session';

const ACTION_STATES: ReadonlySet<FileActionState> = new Set(['idle', 'hung', 'drying', 'burnt']);
const ROPE_TIERS = new Set(['rope-1', 'rope-2', 'rope-3']);
/** 旧模式（files 段）蘑菇品种；原生段品种用 isSpeciesId（含 13 新品种） */
const MUSHROOM_SPECIES = new Set(['oyster', 'enoki', 'shy', 'bolete', 'lava']);
const DAILY_SOURCES = new Set(['natural', 'spread', 'planted']);
const DAILY_SLOT_STATUS = new Set(['pending', 'success', 'skipped']);
const PLANT_STATUS = new Set(['pending', 'completed', 'cancelled']);
const ALERT_REASONS = new Set(['humidity', 'precipitation-streak']);
const DAMAGE_FAMILIES = new Set(['damp', 'mold', 'char']);
const MUSHROOM_STAGES = new Set(['none', 'young', 'mature']);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isUnit(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

function isNonNegativeInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 0;
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * 校验存档数据。任何结构不满足返回 null（调用方走新开局）。
 */
export function validateSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;

  if (d.schemaVersion !== 1 && d.schemaVersion !== 2 && d.schemaVersion !== 3 && d.schemaVersion !== 4) return null;
  if (!isFiniteNumber(d.savedAt)) return null;

  const player = d.player as Record<string, unknown> | undefined;
  if (!player || !isFiniteNumber(player.coins) || player.coins < 0) return null;
  if (!Array.isArray(player.owned) || !player.owned.every(isStr)) return null;
  const equipped = player.equipped as Record<string, unknown> | undefined;
  if (!equipped || !isStr(equipped.rope) || !isStr(equipped.clip)) return null;

  const weather = d.weather as Record<string, unknown> | undefined;
  if (!weather || !isStr(weather.city) || !isStr(weather.migratedOn)) return null;

  if (!Array.isArray(d.files) || !Array.isArray(d.ropes)) return null;
  for (const f of d.files as unknown[]) {
    const fr = f as Record<string, unknown>;
    if (!fr || !isStr(fr.id)) return null;
    if (fr.sourceMtime !== undefined && !isFiniteNumber(fr.sourceMtime)) return null;
    if (fr.refreshedAt !== undefined && !isFiniteNumber(fr.refreshedAt)) return null;
    if (fr.fileIdentity !== undefined && !isStr(fr.fileIdentity)) return null;
    if (fr.dryCare !== undefined && typeof fr.dryCare !== 'boolean') return null;
    if (!isUnit(fr.humidity) || !isUnit(fr.mold) || !isUnit(fr.char)) return null;
    if (fr.dryness !== undefined && !isUnit(fr.dryness)) return null;
    if (!isStr(fr.state) || !ACTION_STATES.has(fr.state as FileActionState)) return null;
    // Optional special-mushroom fields preserve legacy v1 saves.
    if (fr.mushroom !== null) {
      const m = fr.mushroom as Record<string, unknown> | undefined;
      if (!m || !isStr(m.species) || !MUSHROOM_SPECIES.has(m.species) || !isUnit(m.growth)) return null;
      if (m.cooking !== undefined && !isUnit(m.cooking)) return null;
      if (m.cutAgeSeconds !== undefined && (!isFiniteNumber(m.cutAgeSeconds) || m.cutAgeSeconds < 0 || m.cutAgeSeconds > 0.5)) return null;
      if (m.lavaSeconds !== undefined && (!isFiniteNumber(m.lavaSeconds) || m.lavaSeconds < 0 || m.lavaSeconds > 12)) return null;
    }
  }

  // 绳索条目：坐标必须有限（NaN 会污染 Verlet 解算），tier 必须在已知绳型内
  for (const r of d.ropes as unknown[]) {
    const rr = r as Record<string, unknown>;
    if (!rr || !isStr(rr.id)) return null;
    if (!isFiniteNumber(rr.ax) || !isFiniteNumber(rr.ay) || !isFiniteNumber(rr.bx) || !isFiniteNumber(rr.by)) return null;
    if (!isStr(rr.tier) || !ROPE_TIERS.has(rr.tier)) return null;
    if (!Array.isArray(rr.fileIds) || !rr.fileIds.every(isStr)) return null;
  }

  const stats = d.stats as Record<string, unknown> | undefined;
  if (!stats || !isFiniteNumber(stats.harvested) || !isFiniteNumber(stats.earned) || !isFiniteNumber(stats.playedMs)) {
    return null;
  }

  // v3/v4 原生事件段（可选；存在则逐字段校验，脏数据整体拒绝）
  if (d.native !== undefined) {
    const n = d.native as Record<string, unknown>;
    if (!n || typeof n !== 'object' || !isPlainRecord(n.dailyEvents) || !isPlainRecord(n.objects)) return null;
    if (n.init !== null && n.init !== undefined) {
      const init = n.init as Record<string, unknown>;
      if (typeof init.status !== 'string') return null;
      if (init.status === 'legacy-initialized') {
        // 合法：旧版升级标记
      } else if (init.status === 'active' || init.status === 'completed') {
        if (!isFiniteNumber(init.k) || !isFiniteNumber(init.n) || !isFiniteNumber(init.seed)
          || !isFiniteNumber(init.generatedAt) || !Array.isArray(init.targets)) return null;
        for (const t of init.targets as unknown[]) {
          const tt = t as Record<string, unknown>;
          if (!tt || !isStr(tt.id) || !isStr(tt.family) || !DAMAGE_FAMILIES.has(tt.family as string)) return null;
          if (!isFiniteNumber(tt.stage) || (tt.stage as number) < 0 || (tt.stage as number) > 3) return null;
          if (!isStr(tt.mushroom) || !MUSHROOM_STAGES.has(tt.mushroom as string)) return null;
          if (!isStr(tt.status) || !['pending', 'done', 'skipped'].includes(tt.status as string)) return null;
          if (tt.attempts !== undefined && (!isFiniteNumber(tt.attempts) || (tt.attempts as number) < 0)) return null;
        }
        const snapshot = init.snapshot as Record<string, unknown> | undefined;
        if (!snapshot || !isFiniteNumber(snapshot.weatherCode) || !isFiniteNumber(snapshot.humidityPct)
          || !isFiniteNumber(snapshot.temperatureC) || !isStr(snapshot.observedAt) || !isFiniteNumber(snapshot.fetchedAt)) return null;
      } else {
        return null;
      }
    }
    for (const record of Object.values(n.dailyEvents)) {
      if (!validateDailyRecord(record)) return null;
    }
    for (const obj of Object.values(n.objects)) {
      if (!validateNativeObject(obj)) return null;
    }
    if (n.collection !== undefined) {
      if (!isPlainRecord(n.collection)) return null;
      for (const entry of Object.values(n.collection)) {
        const e = entry as Record<string, unknown>;
        if (!e || !isStr(e.species) || !isStr(e.sourceName) || !isFiniteNumber(e.firstSeenAt)) return null;
      }
    }
    if (n.onboarded !== undefined && typeof n.onboarded !== 'boolean') return null;
    if (n.restored !== undefined && typeof n.restored !== 'boolean') return null;
    if (n.lastSnapshot !== null && n.lastSnapshot !== undefined) {
      const s = n.lastSnapshot as Record<string, unknown>;
      if (!s || !isFiniteNumber(s.weatherCode) || !isFiniteNumber(s.humidityPct)
        || !isFiniteNumber(s.temperatureC) || !isStr(s.observedAt) || !isFiniteNumber(s.fetchedAt)) return null;
    }
    if (n.paused !== undefined && typeof n.paused !== 'boolean') return null;
    if (n.location !== undefined && n.location !== null) {
      const loc = n.location as Record<string, unknown>;
      if (!loc || !isStr(loc.cityId) || !isStr(loc.label) || loc.label.length > 100
        || !isFiniteNumber(loc.latitude) || loc.latitude < -90 || loc.latitude > 90
        || !isFiniteNumber(loc.longitude) || loc.longitude < -180 || loc.longitude > 180) return null;
    }
    // ---------- v4 扩展段 ----------
    if (n.spores !== undefined) {
      if (!isPlainRecord(n.spores)) return null;
      for (const [species, count] of Object.entries(n.spores)) {
        // 孢子库存只收 13 款新品种（旧品种不掉孢子）
        if (!isNewSpeciesId(species)) return null;
        if (!isNonNegativeInt(count)) return null;
      }
    }
    if (n.planted !== undefined) {
      if (!isPlainRecord(n.planted)) return null;
      for (const plant of Object.values(n.planted)) {
        if (!validatePlantedSpore(plant)) return null;
      }
    }
    if (n.alert !== undefined && n.alert !== null) {
      if (!validateAlertState(n.alert)) return null;
    }
    if (n.fineCareCount !== undefined && !isNonNegativeInt(n.fineCareCount)) return null;
    if (n.overlayVariant !== undefined && n.overlayVariant !== 'A' && n.overlayVariant !== 'B') return null;
  }

  return raw as SaveData;
}

function validateDailyRecord(record: unknown): boolean {
  const r = record as Record<string, unknown>;
  if (!r || !isStr(r.date) || !isStr(r.id) || !isStr(r.status)) return false;
  if (!['pending', 'retryable', 'success', 'empty', 'init_occupied'].includes(r.status as string)) return false;
  if (!isFiniteNumber(r.seed) || !Array.isArray(r.candidateOrder) || !Array.isArray(r.attempts)) return false;
  if (!r.candidateOrder.every(isStr) || !r.attempts.every(isStr)) return false;
  // v4 记录：额度、警报与槽位
  if (r.limit !== undefined && !isNonNegativeInt(r.limit)) return false;
  if (r.alert !== undefined && typeof r.alert !== 'boolean') return false;
  if (r.slots !== undefined) {
    if (!Array.isArray(r.slots)) return false;
    for (const slot of r.slots as unknown[]) {
      const s = slot as Record<string, unknown>;
      if (!s || !isStr(s.objectId) || !isStr(s.source) || !DAILY_SOURCES.has(s.source as string)) return false;
      if (!isStr(s.family) || !DAMAGE_FAMILIES.has(s.family as string)) return false;
      if (!isFiniteNumber(s.fromStage) || (s.fromStage as number) < 0 || (s.fromStage as number) > 3) return false;
      if (!isFiniteNumber(s.toStage) || (s.toStage as number) < 0 || (s.toStage as number) > 3) return false;
      if (!isStr(s.mushroom) || !MUSHROOM_STAGES.has(s.mushroom as string)) return false;
      if (s.species !== undefined && (typeof s.species !== 'string' || !isSpeciesId(s.species))) return false;
      if (s.fromObjectId !== undefined && !isStr(s.fromObjectId)) return false;
      if (!isStr(s.status) || !DAILY_SLOT_STATUS.has(s.status as string)) return false;
      if (s.skipReason !== undefined && !isStr(s.skipReason)) return false;
    }
  }
  if (r.snapshot !== undefined && r.snapshot !== null) {
    const s = r.snapshot as Record<string, unknown>;
    if (!s || !isFiniteNumber(s.weatherCode) || !isFiniteNumber(s.humidityPct)
      || !isFiniteNumber(s.temperatureC) || !isStr(s.observedAt) || !isFiniteNumber(s.fetchedAt)) return false;
  }
  return true;
}

function validateNativeObject(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  if (!o || !isStr(o.id) || !isStr(o.realPath) || !isStr(o.displayName) || !isFiniteNumber(o.originalMtime)) return false;
  if (o.kind !== 'dir' && o.kind !== 'lnk') return false;
  if (o.damage !== null && o.damage !== undefined) {
    const dmg = o.damage as Record<string, unknown>;
    if (!dmg || !isStr(dmg.family) || !DAMAGE_FAMILIES.has(dmg.family as string)) return false;
    if (!isFiniteNumber(dmg.stage) || (dmg.stage as number) < 0 || (dmg.stage as number) > 3) return false;
    if (!isStr(dmg.mushroom) || !MUSHROOM_STAGES.has(dmg.mushroom as string)) return false;
  }
  for (const key of ['lastAdvanceAt', 'lastCareCompletedAt', 'moldImmuneUntil'] as const) {
    if (o[key] !== undefined && !isFiniteNumber(o[key])) return false;
  }
  if (o.careProgress !== undefined && !isUnit(o.careProgress)) return false;
  if (o.careMask !== undefined && (!isStr(o.careMask) || o.careMask.length > 4096)) return false;
  if (o.mushroomSpecies !== undefined && (typeof o.mushroomSpecies !== 'string' || !isSpeciesId(o.mushroomSpecies))) return false;
  // v4 对象字段
  if (o.objectCategory !== undefined && (typeof o.objectCategory !== 'string' || !OBJECT_CATEGORIES.includes(o.objectCategory as never))) return false;
  if (o.glossUntil !== undefined && !isFiniteNumber(o.glossUntil)) return false;
  if (o.careSession !== undefined && o.careSession !== null && validateCareSession(o.careSession) === null) return false;
  return true;
}

function validatePlantedSpore(plant: unknown): boolean {
  const p = plant as Record<string, unknown>;
  if (!p || !isStr(p.objectId) || !isStr(p.species) || !isSpeciesId(p.species)) return false;
  if (!isFiniteNumber(p.plantedAt)) return false;
  if (p.eventId !== undefined && !isStr(p.eventId)) return false;
  if (!isStr(p.status) || !PLANT_STATUS.has(p.status as string)) return false;
  if (p.cancelReason !== undefined && !isStr(p.cancelReason)) return false;
  return true;
}

function validateAlertState(alert: unknown): boolean {
  const a = alert as Record<string, unknown>;
  if (!a || typeof a.active !== 'boolean') return false;
  if (a.startedAt !== undefined && !isFiniteNumber(a.startedAt)) return false;
  if (a.endsAt !== undefined && !isFiniteNumber(a.endsAt)) return false;
  if (a.reason !== undefined && (typeof a.reason !== 'string' || !ALERT_REASONS.has(a.reason as string))) return false;
  if (!isNonNegativeInt(a.precipitationStreak)) return false;
  if (a.lastObservedAt !== undefined && !isStr(a.lastObservedAt)) return false;
  return true;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 版本迁移入口：
 * - v1/v2 → v3：补原生事件段；已有旧版进度的用户标记为 legacy-initialized
 *   （R4.1：不重新发首批、不重发新手奖励），native 字段缺失视为未初始化新安装。
 * - v3 → v4 字段迁移（gameplay-v2 契约），**纯增量、可回退**（员工 2 审查 #1）：
 *   旧日记录补 limit/alert/slots 表示已结算；旧单层 careMask/careProgress 迁为
 *   对应族上层的 careSession，但**旧字段保留并同步镜像** —— 主进程 native-handlers
 *   仍读 careProgress/careMask，旧版程序 validateSave 也只认 1/2/3，因此文件版本号
 *   保持 3；等员工 2 的 v4 读写路径就绪后再显式提升版本（见交接文档）。
 */
export function migrateSave(raw: unknown): SaveData | null {
  const validated = validateSave(raw);
  if (!validated) return null;
  if (validated.schemaVersion === 4) return validated;
  let upgraded: SaveData;
  if (validated.schemaVersion < 3) {
    // 旧版本号但已有 native 段（0.1.2x 写盘未提升版本号的真实存档）：原样保留对象注册表、
    // 日账本与收藏，只提升版本号。此前一律覆盖为空 native，会清空真实玩家的全部对象与账本。
    // 没有 native 段的旧存档：视为已初始化，避免把老玩家当新安装重发首批（主进程另按用户裁决处理）。
    upgraded = {
      ...validated,
      schemaVersion: 3,
      native: validated.native ?? { init: { status: 'legacy-initialized' }, dailyEvents: {}, objects: {}, lastSnapshot: null },
    };
  } else {
    upgraded = validated;
  }
  upgraded = upgradeFieldsToV4(upgraded);
  return validateSave(upgraded) ?? null;
}

/**
 * 字段级 v4 迁移（不提升 schemaVersion）。
 * 幂等：已有 careSession 的对象不重建（避免覆盖 v2 写入的会话进度）。
 */
function upgradeFieldsToV4(save: SaveData): SaveData {
  const native = save.native;
  if (!native) return save;
  const objects: NonNullable<SaveData['native']>['objects'] = {};
  for (const [id, obj] of Object.entries(native.objects)) {
    // 只有"正在护理"的对象（有损伤）才建分层会话：完成护理后 stage=0 的对象仍残留
    // careProgress:0，若为其建 stage=0 会话会使整份存档校验失败（0.1.27 实机存档复现）。
    const hasLegacyCare = (obj.careMask !== undefined || obj.careProgress !== undefined)
      && obj.damage !== null && obj.damage.stage > 0;
    if (obj.careSession !== undefined || !hasLegacyCare) {
      objects[id] = obj;
      continue;
    }
    const session = migrateLegacyCare(obj.damage!.family, obj.damage!.stage, {
      careProgress: obj.careProgress,
      careMask: obj.careMask,
    });
    objects[id] = {
      ...obj,
      careSession: session,
      // 旧字段保留：整体进度沿用旧值（多层均值会把 0.42 变成 0.21 = 进度缩水）；
      // 掩码取迁移后的上层（v0.1 单层掩码即上层擦拭记录）。
      careProgress: obj.careProgress ?? session.progress,
      careMask: obj.careMask ?? session.layers[0]?.mask,
    };
  }
  const dailyEvents: NonNullable<SaveData['native']>['dailyEvents'] = {};
  for (const [date, record] of Object.entries(native.dailyEvents)) {
    // v4 记录原样保留：slots/limit/alert 是当日额度与回放证据，
    // 重启读档绝不能重写（员工2审查：每次读档补字段会抹掉当天账本）。
    if ('slots' in record) {
      dailyEvents[date] = record;
      continue;
    }
    dailyEvents[date] = {
      ...record,
      // 仅 v3 旧记录补字段：视为已结算，不重算、不补发
      limit: 1,
      alert: false,
      slots: [],
    } as typeof record;
  }
  return {
    ...save,
    native: {
      ...native,
      objects,
      dailyEvents,
      spores: native.spores ?? {},
      planted: native.planted ?? {},
      alert: native.alert ?? { active: false, precipitationStreak: 0 },
    },
  };
}
