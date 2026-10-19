/**
 * 真实桌面扫描（main 进程）
 * - 读取系统真实 Desktop（app.getPath('desktop')，兼容 OneDrive 重定向）；
 * - 每个条目读取真实 name/ext/size/mtime，并调用 Electron 原生 app.getFileIcon 取图标；
 * - 追加系统桌面特殊项「回收站」，图标走 Shell PIDL 原生提取；
 * - 不缓存、不伪造：任何字段都来自文件系统。
 */
import { app, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { desktopUsageId, loadDesktopUsage } from './desktop-usage';
import { folderSizeBytes } from './folder-size';
import { extToCategory } from '../../shared/constants';
import type { DesktopEntry } from '../../shared/types/desktop';
import { extractShellIconImage } from '../native/win32-icons';

export const RECYCLE_BIN_PATH = 'shell:RecycleBinFolder';
export const RECYCLE_BIN_CLSID = '::{645FF040-5081-101B-9F08-00AA002F954E}';

const SKIP_NAMES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
const ICON_SIZE = 64;
const ICON_CONCURRENCY = 6;

function desktopRoot(): string {
  try {
    return app.getPath('desktop');
  } catch {
    return path.join(os.homedir(), 'Desktop');
  }
}

function splitExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function hashPath(fullPath: string): string {
  return desktopUsageId(fullPath);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 裁掉原生图标四周的透明留白并缩放到目标尺寸。
 * 这是「蘑菇根部贴图标上边框」的关键：Windows 32x32 图标通常带透明边，
 * 若直接拉伸到 64px，留白会变成 16px 视觉空隙。
 */
function trimToSquare(image: NativeImage, target: number): NativeImage {
  if (image.isEmpty()) return image;
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) return image;
  const bitmap = image.toBitmap(); // BGRA
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = bitmap[(y * width + x) * 4 + 3];
      if (a <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return image;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  // 以可见内容的最长边为准裁一个正方形（留 2px 呼吸边），避免图标变形
  const side = Math.min(Math.min(width, height), Math.max(w, h) + 2);
  let sx = Math.round(minX - (side - w) / 2);
  let sy = Math.round(minY - (side - h) / 2);
  sx = Math.max(0, Math.min(width - side, sx));
  sy = Math.max(0, Math.min(height - side, sy));
  const cropped = image.crop({ x: sx, y: sy, width: side, height: side });
  return cropped.resize({ width: target, height: target, quality: 'best' });
}

function iconDataUrl(image: NativeImage): string {
  return trimToSquare(image, ICON_SIZE).toDataURL();
}

function trimDataUrlIcon(dataUrl: string): string {
  if (!dataUrl) return '';
  try {
    const image = nativeImage.createFromDataURL(dataUrl);
    return image.isEmpty() ? dataUrl : iconDataUrl(image);
  } catch {
    return dataUrl;
  }
}

async function nativeIcon(fullPath: string, fallback: string): Promise<string> {
  // SHParseDisplayName retains Shell shortcut/folder semantics. Electron's
  // extension-based lookup can return a blank .lnk page or a drive for folders.
  const shellIcon = extractShellIconImage(fullPath);
  if (shellIcon) return iconDataUrl(shellIcon);
  try {
    const image = await app.getFileIcon(fullPath, { size: 'large' });
    if (image.isEmpty()) return fallback;
    return iconDataUrl(image);
  } catch (err) {
    console.warn(`[desktop] 读取图标失败 ${fullPath}:`, err);
    return fallback;
  }
}

async function fallbackIcon(): Promise<string> {
  try {
    const image = await app.getFileIcon(desktopRoot(), { size: 'large' });
    if (image.isEmpty()) return '';
    return iconDataUrl(image);
  } catch {
    return '';
  }
}

function recycleEntry(icon: string, now: number): DesktopEntry {
  return {
    id: 'recycle-bin',
    name: '回收站',
    ext: '',
    category: 'archive',
    sizeBytes: 0,
    mtime: now,
    realPath: RECYCLE_BIN_PATH,
    kind: 'recycle',
    iconDataUrl: icon,
  };
}

interface Candidate {
  name: string;
  fullPath: string;
  isDir: boolean;
}

/** Both locations contribute icons to the Windows desktop. */
export function desktopRoots(): string[] {
  const roots = [desktopRoot()];
  if (process.platform === 'win32') roots.push(path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'));
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

export function isDesktopPath(fullPath: string): boolean {
  return desktopRoots().some((root) => {
    const rel = path.relative(root, path.resolve(fullPath));
    return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
  });
}

/** 扫描真实桌面；回收站固定排第一格 */
export async function scanDesktop(): Promise<DesktopEntry[]> {
  const usage = await loadDesktopUsage();
  const now = Date.now();
  const fallback = await fallbackIcon();
  const recycleRaw = extractShellIconImage(RECYCLE_BIN_CLSID);
  const recycleIcon = recycleRaw ? iconDataUrl(recycleRaw) : trimDataUrlIcon(fallback);

  const candidates: Candidate[] = [];
  const names = new Set<string>();
  for (const root of desktopRoots()) {
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    for (const d of dirents) {
      const lower = d.name.toLowerCase();
      if (SKIP_NAMES.has(lower)) continue;
      // Windows 桌面不显示以 $ 开头的系统卷目录
      if (d.name.startsWith('$')) continue;
      if (!d.isFile() && !d.isDirectory()) continue;
      if (names.has(lower)) continue;
      names.add(lower);
      candidates.push({
        name: d.name,
        fullPath: path.join(root, d.name),
        isDir: d.isDirectory(),
      });
    }
  } catch (err) {
    console.warn(`[desktop] 无法读取桌面目录 ${root}:`, err);
  }
  }

  // Windows 资源管理器默认：文件夹优先，再按名称排序（中文按本地排序）
  candidates.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  // Share a startup budget across folders. A huge/inaccessible tree must not
  // prevent the real desktop from appearing; partial sizes stay lower bounds.
  const folderDeadline = Date.now() + 3500;
  const entries = await mapLimit(candidates, ICON_CONCURRENCY, async (c): Promise<DesktopEntry | null> => {
    try {
      const stat = await fs.stat(c.fullPath);
      const folderSize = c.isDir ? await folderSizeBytes(c.fullPath, { deadlineMs: folderDeadline }) : null;
      if (folderSize && !folderSize.complete) {
        console.warn(`[desktop] 文件夹大小仅计已访问内容 ${c.fullPath}: ${folderSize.sizeBytes} bytes, ${folderSize.files} files, ${folderSize.skippedEntries} skipped, limit=${folderSize.limit ?? 'access'}`);
      }
      const ext = c.isDir ? '' : splitExt(c.name);
      return {
        id: `d-${hashPath(c.fullPath)}`,
        name: c.name,
        ext,
        category: c.isDir ? 'doc-code' : extToCategory(ext),
        sizeBytes: folderSize?.sizeBytes ?? stat.size,
        mtime: stat.mtimeMs,
        lastOpenedAt: usage[hashPath(c.fullPath)],
        realPath: c.fullPath,
        kind: c.isDir ? 'dir' : 'file',
        iconDataUrl: await nativeIcon(c.fullPath, fallback),
      };
    } catch (err) {
      console.warn(`[desktop] 读取条目失败 ${c.fullPath}:`, err);
      return null;
    }
  });

  return [recycleEntry(recycleIcon, now), ...entries.filter((e): e is DesktopEntry => e !== null)];
}

export function desktopDir(): string {
  return desktopRoot();
}
