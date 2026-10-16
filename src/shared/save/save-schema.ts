/**
 * 存档校验与版本迁移（shared 叶子层，手写无 zod）
 * 契约：docs/contracts/save-schema.json（schemaVersion: 1）
 */
import type { SaveData } from '../types/save';

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
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
  if (!Array.isArray(player.owned)) return null;
  const equipped = player.equipped as Record<string, unknown> | undefined;
  if (!equipped || typeof equipped.rope !== 'string' || typeof equipped.clip !== 'string') return null;

  const weather = d.weather as Record<string, unknown> | undefined;
  if (!weather || typeof weather.city !== 'string' || typeof weather.migratedOn !== 'string') return null;

  if (!Array.isArray(d.files) || !Array.isArray(d.ropes)) return null;
  for (const f of d.files as unknown[]) {
    const fr = f as Record<string, unknown>;
    if (!fr || typeof fr.id !== 'string') return null;
    if (!isFiniteNumber(fr.humidity) || !isFiniteNumber(fr.mold) || !isFiniteNumber(fr.char)) return null;
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
