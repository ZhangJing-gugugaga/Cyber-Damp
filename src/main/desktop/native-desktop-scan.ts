import { app, nativeImage, screen, shell } from 'electron';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { queryShellLayout } from './shell-layout';
import { queryShellIcons } from './shell-icons';
import { desktopUsageId } from './desktop-usage';
import { extToCategory } from '../../shared/constants';
import { classifyObject } from '../../shared/object-category';
import type { DesktopEntry } from '../../shared/types/desktop';
import { projectShellGeometry, unionScreenRects } from '../../shared/desktop-viewport';

/** Shell's actual view is authoritative, including virtual and hidden-item policy. */
export async function scanNativeDesktop(canvasScale = screen.getPrimaryDisplay().scaleFactor): Promise<DesktopEntry[]> {
  const started = performance.now();
  const { view, rects } = await queryShellLayout();
  const layoutMs = performance.now() - started;
  const work = unionScreenRects(screen.getAllDisplays().map(display => screen.dipToScreenRect(null, display.workArea)));
  if (!work) throw new Error('无法读取桌面画布的物理坐标');
  // .lnk 目标路径（元数据）：同时供图标提取与 v0.2 对象类别判定
  const shortcutTargets: Array<string | undefined> = [];
  const requests = view.items.map((item, itemIndex) => {
    const realPath = item.parsingName;
    const virtual = realPath.startsWith('::');
    let artworkPath = realPath;
    let artworkIndex: number | undefined;
    if (!virtual && path.extname(realPath).toLowerCase() === '.lnk') {
      try {
        // Shortcut metadata only. Never execute or read the target document.
        const shortcut = shell.readShortcutLink(realPath);
        shortcutTargets[itemIndex] = shortcut.target || undefined;
        if (shortcut.icon) { artworkPath = shortcut.icon; artworkIndex = shortcut.iconIndex ?? 0; }
        else if (!shortcut.icon && shortcut.target) artworkPath = shortcut.target;
      } catch { /* Keep Shell's shortcut artwork if metadata is unavailable. */ }
    }
    return { path: artworkPath, resourceIndex: artworkIndex,
      fallbackPath: artworkPath !== realPath ? realPath : undefined };
  });
  const artwork = await queryShellIcons(requests);
  const entries = (await Promise.all(view.items.map(async (item, index): Promise<DesktopEntry | null> => {
    const rect = rects.items[index];
    const dip = screen.screenToDipRect(null, rect.icon);
    const display = screen.getDisplayNearestPoint({ x: dip.x, y: dip.y });
    // GetViewModeAndIconSize is logical Shell size; the rectangle is physical.
    // Keep transparent margins. Horizontal centering and the label boundary
    // define the image box; verify native pixel alignment in UAT.
    const size = view.iconSize;
    const geometry = projectShellGeometry(rect.icon, rect.label, size, display.scaleFactor, work, canvasScale);
    const realPath = item.parsingName;
    const virtual = realPath.startsWith('::');
    // Shell 视图可能残留已删除对象的幽灵条目（外部 rm 不产生 Shell 通知）：
    // stat 失败按"对象不存在"跳过，不让单个幽灵拖死整次启动扫描。
    let info: Awaited<ReturnType<typeof stat>> | null = null;
    if (!virtual) {
      try { info = await stat(realPath); } catch { info = null; }
    }
    if (!virtual && !info) {
      console.warn('[startup:scan] 跳过不可访问的对象（可能已被删除）:', item.displayName, realPath);
      return null;
    }
    const recycle = realPath.toLowerCase().includes('645ff040-5081-101b-9f08-00aa002f954e');
    const raw = artwork[index];
    let icon = raw ? nativeImage.createFromBitmap(Buffer.from(raw.pixels), { width: raw.width, height: raw.height }) : null;
    if (!icon && !virtual) {
      // 个别对象（如失效网络目标的快捷方式）的提取可能长时间不返回：
      // 限时回退，仍读不到就跳过该对象，不拖死整次桌面扫描（R1 单个失败
      // 不阻塞其余可处理对象）。
      icon = await Promise.race([
        app.getFileIcon(realPath, { size: 'large' }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
    }
    if (!icon || icon.isEmpty()) {
      console.warn('[startup:scan] 跳过图标不可读的对象:', item.displayName, realPath);
      return null;
    }
    const name = virtual ? item.displayName : path.basename(realPath);
    const ext = info?.isDirectory() || virtual ? '' : path.extname(name).slice(1).toLowerCase();
    const objectCategory = info?.isDirectory()
      ? classifyObject({ kind: 'dir' })
      : ext === 'lnk' ? classifyObject({ kind: 'lnk', targetPath: shortcutTargets[index] }) : undefined;
    return {
      objectCategory,
      id: recycle ? 'recycle-bin' : `d-${desktopUsageId(realPath)}`, name, displayName: item.displayName,
      fileIdentity: info && info.ino !== 0 ? `${info.dev}:${info.ino}` : undefined,
      ext, category: extToCategory(ext), sizeBytes: info?.size ?? 0, mtime: info?.mtimeMs ?? Date.now(),
      realPath, kind: recycle ? 'recycle' : virtual ? 'shell' : info?.isDirectory() ? 'dir' : 'file',
      iconDataUrl: icon.toDataURL(),
      geometry,
    };
  }))).filter((entry) => entry !== null);
  console.info('[startup:scan]', JSON.stringify({ items: entries.length, layoutMs: Math.round(layoutMs), artworkMs: Math.round(performance.now() - started - layoutMs) }));
  return entries;
}
