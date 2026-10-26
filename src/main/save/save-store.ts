/**
 * 存档原子读写（main 进程）
 * 契约纪律 2：tmp+rename 原子落盘 userData/save.json；读失败返回 null 走新开局
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { migrateSave, validateSave } from '../../shared/save/save-schema';
import type { SaveData } from '../../shared/types/save';

function savePath(): string {
  return path.join(app.getPath('userData'), 'save.json');
}

/**
 * 读存档：不存在/损坏/版本不符均返回 null（渲染层走新开局，禁止抛错）。
 * 读时经 migrateSave 补齐 v1/v2→v3 与 v4 字段（纯增量、幂等，文件版本号保持 3）；
 * 若迁移本身失败而原档仍合法，退回原档，绝不因迁移问题把有效存档当成新开局。
 */
export function loadSave(): SaveData | null {
  try {
    const raw = JSON.parse(fs.readFileSync(savePath(), 'utf8'));
    const migrated = migrateSave(raw);
    if (migrated) return migrated;
    const valid = validateSave(raw);
    if (valid) console.warn('[save] 迁移失败，按原存档继续（未写回）');
    return valid;
  } catch {
    return null;
  }
}

/** 写存档：先过 schema 校验（脏数据拒绝落盘），再写 .tmp 后 rename（原子替换，防写入中断损坏） */
export function writeSave(data: SaveData): { ok: boolean } {
  const valid = validateSave(data);
  if (!valid) {
    console.error('[save] 写入被拒绝：存档结构非法（NaN/未知字段），已保留上一份存档');
    return { ok: false };
  }
  const target = savePath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(valid), 'utf8');
    fs.renameSync(tmp, target);
    return { ok: true };
  } catch (err) {
    console.error('[save] 写入失败:', err);
    return { ok: false };
  }
}
