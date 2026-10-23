/**
 * 图标原值恢复登记（R1：写前落盘）
 *
 * 与 save-store 相同的 tmp+rename 原子写模式；条目在修改原生引用前
 * 先以 pending 落盘，成功后置 applied。崩溃后由启动核对结算
 * （引用已是我们 → 补记 applied；仍是原值 → 丢弃；都不是 → 用户已改，保留）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';

/** Electron ShortcutDetails 的可 JSON 子集（readShortcutLink 实际返回）。 */
export interface ShortcutSnapshot {
  target: string;
  cwd: string;
  args: string;
  description: string;
  icon: string;
  iconIndex: number;
  appUserModelId?: string;
  toastActivatorClsid?: string;
}

export interface FolderRestoreEntry {
  kind: 'dir';
  id: string;
  status: 'pending' | 'applied';
  realPath: string;
  desktopIniPath: string;
  desktopIniExisted: boolean;
  /** 原始字节（base64），恢复时逐字节还原 */
  desktopIniRawBase64: string | null;
  /** 原始文件属性（我们写入前捕获，可能含 hidden/system） */
  desktopIniAttributes: number | null;
  /** 我们写入的图标 ICO 绝对路径；恢复前核对当前引用归属 */
  appliedIconPath: string;
  eventId?: string;
  mutatedAt: number;
}

export interface LnkRestoreEntry {
  kind: 'lnk';
  id: string;
  status: 'pending' | 'applied';
  realPath: string;
  shortcut: ShortcutSnapshot;
  appliedIconPath: string;
  eventId?: string;
  mutatedAt: number;
}

export type IconRestoreEntry = FolderRestoreEntry | LnkRestoreEntry;

interface RestoreFile {
  version: 1;
  entries: IconRestoreEntry[];
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'icon-restores.json');
}

export function loadRestoreEntries(): IconRestoreEntry[] {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    const data = JSON.parse(raw) as RestoreFile;
    if (data?.version !== 1 || !Array.isArray(data.entries)) return [];
    return data.entries.filter((entry): entry is IconRestoreEntry =>
      (entry.kind === 'dir' || entry.kind === 'lnk') && typeof entry.realPath === 'string');
  } catch {
    return []; // 不存在或损坏都视为空：绝不凭空造恢复信息
  }
}

function persist(entries: IconRestoreEntry[]): void {
  const target = storePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload: RestoreFile = { version: 1, entries };
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

export function upsertEntry(entry: IconRestoreEntry): void {
  const entries = loadRestoreEntries();
  const index = entries.findIndex((e) => e.realPath.toLowerCase() === entry.realPath.toLowerCase());
  if (index >= 0) {
    // 同一对象再次应用新状态：保留最早捕获的原始快照，只更新我们的引用与状态
    const existing = entries[index];
    entries[index] = { ...existing, status: entry.status, appliedIconPath: entry.appliedIconPath, eventId: entry.eventId, mutatedAt: entry.mutatedAt };
  } else {
    entries.push(entry);
  }
  persist(entries);
}

export function settleEntry(realPath: string, status: 'applied'): void {
  const entries = loadRestoreEntries();
  const index = entries.findIndex((e) => e.realPath.toLowerCase() === realPath.toLowerCase());
  if (index < 0) return;
  entries[index] = { ...entries[index], status };
  persist(entries);
}

/** 已恢复或用户改值后移除条目；返回被移除的条目供报告。 */
export function removeEntry(realPath: string): IconRestoreEntry | null {
  const entries = loadRestoreEntries();
  const index = entries.findIndex((e) => e.realPath.toLowerCase() === realPath.toLowerCase());
  if (index < 0) return null;
  const [removed] = entries.splice(index, 1);
  persist(entries);
  return removed ?? null;
}

export function findEntry(realPath: string): IconRestoreEntry | null {
  const entries = loadRestoreEntries();
  return entries.find((e) => e.realPath.toLowerCase() === realPath.toLowerCase()) ?? null;
}
