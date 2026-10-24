import { app, nativeImage, screen, shell } from 'electron';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { queryShellLayout } from './shell-layout';
import { queryShellIcons } from './shell-icons';
import { desktopUsageId } from './desktop-usage';
import { extToCategory } from '../../shared/constants';
import type { DesktopEntry } from '../../shared/types/desktop';
import { projectShellGeometry, unionScreenRects } from '../../shared/desktop-viewport';

/** Shell's actual view is authoritative, including virtual and hidden-item policy. */
export async function scanNativeDesktop(canvasScale = screen.getPrimaryDisplay().scaleFactor): Promise<DesktopEntry[]> {
  const started = performance.now();
  const { view, rects } = await queryShellLayout();
  const layoutMs = performance.now() - started;
  const work = unionScreenRects(screen.getAllDisplays().map(display => screen.dipToScreenRect(null, display.workArea)));
  if (!work) throw new Error('无法读取桌面画布的物理坐标');
  const requests = view.items.map(item => {
    const realPath = item.parsingName;
    const virtual = realPath.startsWith('::');
    let artworkPath = realPath;
    let artworkIndex: number | undefined;
    if (!virtual && path.extname(realPath).toLowerCase() === '.lnk') {
      try {
        // Shortcut metadata only. Never execute or read the target document.
        const shortcut = shell.readShortcutLink(realPath);
        if (shortcut.icon) { artworkPath = shortcut.icon; artworkIndex = shortcut.iconIndex ?? 0; }
        else if (!shortcut.icon && shortcut.target) artworkPath = shortcut.target;
      } catch { /* Keep Shell's shortcut artwork if metadata is unavailable. */ }
    }
    return { path: artworkPath, resourceIndex: artworkIndex,
      fallbackPath: artworkPath !== realPath ? realPath : undefined };
  });
  const artwork = await queryShellIcons(requests);
  const entries = await Promise.all(view.items.map(async (item, index): Promise<DesktopEntry> => {
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
    const info = virtual ? null : await stat(realPath);
    const recycle = realPath.toLowerCase().includes('645ff040-5081-101b-9f08-00aa002f954e');
    const raw = artwork[index];
    let icon = raw ? nativeImage.createFromBitmap(Buffer.from(raw.pixels), { width: raw.width, height: raw.height }) : null;
    if (!icon && !virtual) icon = await app.getFileIcon(realPath, { size: 'large' });
    if (!icon || icon.isEmpty()) throw new Error(`无法读取图标：${item.displayName}`);
    const name = virtual ? item.displayName : path.basename(realPath);
    const ext = info?.isDirectory() || virtual ? '' : path.extname(name).slice(1).toLowerCase();
    return {
      id: recycle ? 'recycle-bin' : `d-${desktopUsageId(realPath)}`, name, displayName: item.displayName,
      fileIdentity: info && info.ino !== 0 ? `${info.dev}:${info.ino}` : undefined,
      ext, category: extToCategory(ext), sizeBytes: info?.size ?? 0, mtime: info?.mtimeMs ?? Date.now(),
      realPath, kind: recycle ? 'recycle' : virtual ? 'shell' : info?.isDirectory() ? 'dir' : 'file',
      iconDataUrl: icon.toDataURL(),
      geometry,
    };
  }));
  console.info('[startup:scan]', JSON.stringify({ items: entries.length, layoutMs: Math.round(layoutMs), artworkMs: Math.round(performance.now() - started - layoutMs) }));
  return entries;
}
