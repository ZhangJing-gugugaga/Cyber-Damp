/**
 * 存档校验与版本迁移（shared 叶子层，手写无 zod）
 * 契约：docs/contracts/save-schema.json（schemaVersion: 1）
 * AC-24/27：读路径任何结构不满足返回 null；写路径同样必须过此校验（防 NaN 落盘后静默清档）
 */
import type { SaveData } from '../types/save';
import type { FileActionState } from '../types/file-runtime';

const ACTION_STATES: ReadonlySet<FileActionState> = new Set(['idle', 'hung', 'drying', 'burnt']);
const ROPE_TIERS = new Set(['rope-1', 'rope-2', 'rope-3']);
const MUSHROOM_SPECIES = new Set(['oyster', 'enoki', 'shy', 'bolete', 'lava']);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isUnit(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
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

  if (d.schemaVersion !== 1 && d.schemaVersion !== 2 && d.schemaVersion !== 3) return null;
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

  // v3 原生事件段（可选；存在则逐字段校验，脏数据整体拒绝）
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
          if (!tt || !isStr(tt.id) || !isStr(tt.family) || !['damp', 'mold', 'char'].includes(tt.family as string)) return null;
          if (!isFiniteNumber(tt.stage) || (tt.stage as number) < 0 || (tt.stage as number) > 3) return null;
          if (!isStr(tt.mushroom) || !['none', 'young', 'mature'].includes(tt.mushroom as string)) return null;
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
      const r = record as Record<string, unknown>;
      if (!r || !isStr(r.date) || !isStr(r.id) || !isStr(r.status)) return null;
      if (!['pending', 'retryable', 'success', 'empty', 'init_occupied'].includes(r.status as string)) return null;
      if (!isFiniteNumber(r.seed) || !Array.isArray(r.candidateOrder) || !Array.isArray(r.attempts)) return null;
    }
    for (const obj of Object.values(n.objects)) {
      const o = obj as Record<string, unknown>;
      if (!o || !isStr(o.id) || !isStr(o.realPath) || !isStr(o.displayName) || !isFiniteNumber(o.originalMtime)) return null;
      if (o.kind !== 'dir' && o.kind !== 'lnk') return null;
      if (o.damage !== null && o.damage !== undefined) {
        const dmg = o.damage as Record<string, unknown>;
        if (!dmg || !isStr(dmg.family) || !['damp', 'mold', 'char'].includes(dmg.family as string)) return null;
        if (!isFiniteNumber(dmg.stage) || (dmg.stage as number) < 0 || (dmg.stage as number) > 3) return null;
        if (!isStr(dmg.mushroom) || !['none', 'young', 'mature'].includes(dmg.mushroom as string)) return null;
      }
      for (const key of ['lastAdvanceAt', 'lastCareCompletedAt', 'moldImmuneUntil'] as const) {
        if (o[key] !== undefined && !isFiniteNumber(o[key])) return null;
      }
      if (o.careProgress !== undefined && !isUnit(o.careProgress)) return null;
      if (o.mushroomSpecies !== undefined && !isStr(o.mushroomSpecies)) return null;
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
  }

  return raw as SaveData;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 版本迁移入口。v1/v2 → v3：补原生事件段；已有旧版进度的用户标记为
 * legacy-initialized（R4.1：不重新发首批、不重发新手奖励），native 字段缺失视为未初始化新安装。
 */
export function migrateSave(raw: unknown): SaveData | null {
  const validated = validateSave(raw);
  if (!validated) return null;
  if (validated.schemaVersion >= 3) return validated;
  const upgraded: SaveData = {
    ...validated,
    schemaVersion: 3,
    // 旧用户已有游戏进度：视为已初始化，避免把老玩家当新安装重发首批
    native: { init: { status: 'legacy-initialized' }, dailyEvents: {}, objects: {}, lastSnapshot: null },
  };
  return validateSave(upgraded) ?? null;
}
