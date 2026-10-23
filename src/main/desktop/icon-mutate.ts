/**
 * 原生图标引用变更与恢复（R1：仅桌面文件夹与普通 .lnk）
 *
 * - 文件夹：desktop.ini [.ShellClassInfo] IconResource 外科级编辑，
 *   保留其余内容；写前捕获原始字节与属性，恢复时逐字节还原。
 * - .lnk：shell.readShortcutLink 捕获全部原始字段，writeShortcutLink('update')
 *   仅改 icon 引用；目标/参数/工作目录/说明等永不动。
 * - 恢复的是用户原值，不是系统默认；恢复前核对当前引用归属，
 *   用户已自行更改则保留用户值并报告。
 * - 刷新仅对被修改对象发 SHChangeNotify，不重建图标缓存。
 */
import { app, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_SYSTEM,
  getFileAttributes, notifyDirChanged, notifyItemChanged, setFileAttributes,
} from './win32-icon-notify';
import { decodeIni, encodeIni, parseIconResource, setIconReferenceInIni } from './desktop-ini';
import {
  loadRestoreEntries, settleEntry, upsertEntry, removeEntry,
  type FolderRestoreEntry, type IconRestoreEntry, type LnkRestoreEntry, type ShortcutSnapshot,
} from './icon-restore-store';

export type IconMutationKind = 'dir' | 'lnk';

export interface IconMutationRequest {
  id: string;
  realPath: string;
  kind: IconMutationKind;
  /** 本程序生成的多尺寸 ICO 绝对路径 */
  iconPath: string;
  eventId?: string;
}

export type IconMutationResult =
  | { id: string; ok: true }
  | { id: string; ok: false; reason: string; retryable: boolean };

export interface IconRestoreReport {
  id: string;
  realPath: string;
  kind: IconMutationKind;
  outcome: 'restored' | 'kept-user-value' | 'missing' | 'failed';
  detail?: string;
}

// ---------- 变更与恢复操作 ----------

function isDirectory(realPath: string): boolean {
  try { return fs.statSync(realPath).isDirectory(); } catch { return false; }
}

function snapshotShortcut(realPath: string): ShortcutSnapshot | null {
  try {
    const link = shell.readShortcutLink(realPath);
    return {
      target: link.target ?? '', cwd: link.cwd ?? '', args: link.args ?? '',
      description: link.description ?? '', icon: link.icon ?? '', iconIndex: link.iconIndex ?? 0,
      appUserModelId: link.appUserModelId, toastActivatorClsid: link.toastActivatorClsid,
    };
  } catch {
    return null; // 链接损坏：按 R1 跳过而不阻塞其他对象
  }
}

function currentLnkIcon(realPath: string): string | null {
  return snapshotShortcut(realPath)?.icon ?? null;
}

function currentFolderIconReference(desktopIniPath: string): string | null {
  try {
    const decoded = decodeIni(fs.readFileSync(desktopIniPath));
    return decoded ? parseIconResource(decoded.text).source : null;
  } catch {
    return null; // 读不到按"无引用"处理，不伪造
  }
}

/** 当前引用是否指向我们的 ICO（写后结算与恢复前核对都用它）。 */
export function referenceIsOurs(realPath: string, kind: IconMutationKind, iconPath: string): boolean {
  if (kind === 'lnk') {
    const icon = currentLnkIcon(realPath);
    return icon !== null && icon.toLowerCase() === iconPath.toLowerCase();
  }
  const icon = currentFolderIconReference(path.join(realPath, 'desktop.ini'));
  return icon !== null && icon.toLowerCase() === iconPath.toLowerCase();
}

/** 应用图标引用。写前先以 pending 落盘恢复信息（R1），成功后置 applied。 */
export function applyIconMutation(request: IconMutationRequest): IconMutationResult {
  const { id, realPath, kind, iconPath, eventId } = request;
  if (!fs.existsSync(realPath)) return { id, ok: false, reason: '对象不存在', retryable: false };
  const now = Date.now();
  try {
    if (kind === 'dir') {
      if (!isDirectory(realPath)) return { id, ok: false, reason: '不是文件夹', retryable: false };
      const desktopIniPath = path.join(realPath, 'desktop.ini');
      const existed = fs.existsSync(desktopIniPath);
      const raw = existed ? fs.readFileSync(desktopIniPath) : null;
      const attributes = existed ? getFileAttributes(desktopIniPath) : null;
      const decoded = raw ? decodeIni(raw) : null;
      if (raw && !decoded) return { id, ok: false, reason: 'desktop.ini 编码无法安全解析，已跳过', retryable: false };
      const next = setIconReferenceInIni(decoded?.text ?? '', iconPath);
      const entry: FolderRestoreEntry = {
        kind: 'dir', id, status: 'pending', realPath, desktopIniPath,
        desktopIniExisted: existed, desktopIniRawBase64: raw ? raw.toString('base64') : null,
        desktopIniAttributes: attributes, appliedIconPath: iconPath, eventId, mutatedAt: now,
      };
      upsertEntry(entry); // 已有更早快照时由 store 保留原始快照，仅更新我们的引用
      fs.writeFileSync(desktopIniPath, encodeIni(decoded ?? { encoding: 'utf16le', hadBom: true, text: '' }, next.text));
      setFileAttributes(desktopIniPath, FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM);
      settleEntry(realPath, 'applied');
      notifyItemChanged(realPath);
      notifyDirChanged(path.dirname(realPath));
      return { id, ok: true };
    }
    // .lnk：仅 update icon 字段
    const original = snapshotShortcut(realPath);
    if (!original) return { id, ok: false, reason: '快捷方式元数据不可读（可能已损坏），已跳过', retryable: false };
    const entry: LnkRestoreEntry = {
      kind: 'lnk', id, status: 'pending', realPath, shortcut: original, appliedIconPath: iconPath, eventId, mutatedAt: now,
    };
    upsertEntry(entry);
    // update 语义仅覆写显式给出的字段；整对象传入保证类型完整，实际只有 icon 变化
    shell.writeShortcutLink(realPath, 'update', { ...original, icon: iconPath, iconIndex: 0 });
    settleEntry(realPath, 'applied');
    notifyItemChanged(realPath);
    return { id, ok: true };
  } catch (error) {
    return { id, ok: false, reason: error instanceof Error ? error.message : String(error), retryable: true };
  }
}

/**
 * 恢复登记中的全部或指定对象（R1：恢复用户原值，不是系统默认）。
 * 迟到的引用已非我们 → 保留用户值；对象已删除/移动 → missing，不复活。
 */
export function restoreIconReferences(filter?: { ids?: string[] }): IconRestoreReport[] {
  const entries = loadRestoreEntries()
    .filter((entry) => !filter?.ids || filter.ids.includes(entry.id));
  const reports: IconRestoreReport[] = [];
  for (const entry of entries) {
    reports.push(restoreOne(entry));
  }
  return reports;
}

function restoreOne(entry: IconRestoreEntry): IconRestoreReport {
  const base = { id: entry.id, realPath: entry.realPath, kind: entry.kind };
  if (!fs.existsSync(entry.realPath)) {
    removeEntry(entry.realPath);
    return { ...base, outcome: 'missing', detail: '对象已不存在，不复活、不覆盖新同名对象' };
  }
  if (!referenceIsOurs(entry.realPath, entry.kind, entry.appliedIconPath)) {
    removeEntry(entry.realPath);
    return { ...base, outcome: 'kept-user-value', detail: '当前图标引用已被用户更改，保留用户值' };
  }
  try {
    if (entry.kind === 'dir') {
      if (entry.desktopIniExisted && entry.desktopIniRawBase64) {
        // hidden/system 属性下直接覆写会 EPERM：先清属性，写回后还原原始属性
        setFileAttributes(entry.desktopIniPath, 0x80 /* FILE_ATTRIBUTE_NORMAL */);
        fs.writeFileSync(entry.desktopIniPath, Buffer.from(entry.desktopIniRawBase64, 'base64'));
        setFileAttributes(entry.desktopIniPath, entry.desktopIniAttributes !== null ? entry.desktopIniAttributes : 0x80);
      } else {
        if (fs.existsSync(entry.desktopIniPath)) {
          setFileAttributes(entry.desktopIniPath, 0x80);
          fs.rmSync(entry.desktopIniPath);
        }
      }
      notifyItemChanged(entry.realPath);
      notifyDirChanged(path.dirname(entry.realPath));
    } else {
      const current = snapshotShortcut(entry.realPath);
      if (!current) {
        return { ...base, outcome: 'failed', detail: '快捷方式当前不可读，保留登记待下次尝试' };
      }
      // replace 语义：以完整原始快照整体还原（含"无自定义图标"的空引用；
      // update 对空 icon 不生效）。快照含全部受管字段，目标/参数等不丢。
      shell.writeShortcutLink(entry.realPath, 'replace', { ...current, ...entry.shortcut });
      notifyItemChanged(entry.realPath);
    }
    removeEntry(entry.realPath);
    return { ...base, outcome: 'restored' };
  } catch (error) {
    return { ...base, outcome: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 启动核对（R4：先核对未结算写入）：pending 条目检查原生引用是否已落地。
 * 已是我们 → 补记 applied；仍等于原始值 → 写入未发生，丢弃登记；
 * 两者都不是 → 用户已改，丢弃登记并保留用户值。
 */
export function reconcilePendingEntries(): { settled: number; dropped: number; userChanged: string[] } {
  const entries = loadRestoreEntries();
  let settled = 0;
  let dropped = 0;
  const userChanged: string[] = [];
  for (const entry of entries) {
    if (entry.status !== 'pending') continue;
    if (referenceIsOurs(entry.realPath, entry.kind, entry.appliedIconPath)) {
      settleEntry(entry.realPath, 'applied');
      settled += 1;
      continue;
    }
    removeEntry(entry.realPath);
    dropped += 1;
    if (currentReferenceDiffersFromOriginal(entry)) userChanged.push(entry.realPath);
  }
  return { settled, dropped, userChanged };
}

/** pending 条目：当前引用既非我们的 ICO，也与登记的原始值不同 → 用户已更改。 */
function currentReferenceDiffersFromOriginal(entry: IconRestoreEntry): boolean {
  if (entry.kind === 'lnk') {
    const current = snapshotShortcut(entry.realPath);
    return current ? current.icon.toLowerCase() !== entry.shortcut.icon.toLowerCase() : false;
  }
  let originalSource: string | null = null;
  if (entry.desktopIniExisted && entry.desktopIniRawBase64) {
    try {
      const decoded = decodeIni(Buffer.from(entry.desktopIniRawBase64, 'base64'));
      if (decoded) originalSource = parseIconResource(decoded.text).source;
    } catch { /* 原始快照读不出时按保守处理 */ }
  }
  const current = currentFolderIconReference(entry.desktopIniPath);
  return (current?.toLowerCase() ?? '') !== (originalSource?.toLowerCase() ?? '');
}

/** 完全退出/卸载前的全量恢复入口（R8）。 */
export function restoreAllIconReferences(): IconRestoreReport[] {
  return restoreIconReferences();
}

export function iconCacheDir(): string {
  return path.join(app.getPath('userData'), 'icon-cache');
}
