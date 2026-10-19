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

  if (d.schemaVersion !== 1) return null;
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

  return raw as SaveData;
}

/**
 * 版本迁移入口。当前仅 v1：直接校验。
 * 未来 schemaVersion 2 在此升级（v1 → v2 字段补齐），失败仍返回 null。
 */
export function migrateSave(raw: unknown): SaveData | null {
  return validateSave(raw);
}
