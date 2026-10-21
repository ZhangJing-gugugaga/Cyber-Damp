import { app, screen, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { queryShellLayout } from './shell-layout';
import { extractShellIconImage } from '../native/win32-icons';
import { desktopUsageId } from './desktop-usage';
import { extToCategory } from '../../shared/constants';
import type { DesktopEntry } from '../../shared/types/desktop';
import { overlayScreenRect } from '../native/win32-desktop';
import { projectShellGeometry, unionScreenRects } from '../../shared/desktop-viewport';

/** Shell's actual view is authoritative, including virtual and hidden-item policy. */
export async function scanNativeDesktop(win?: BrowserWindow, canvasScale = screen.getPrimaryDisplay().scaleFactor): Promise<DesktopEntry[]> {
  const { view, rects } = await queryShellLayout();
  const work = win ? overlayScreenRect(win) : unionScreenRects(screen.getAllDisplays().map(display => screen.dipToScreenRect(null, display.workArea)));
  if (!work) throw new Error('无法读取桌面画布的物理坐标');
  return Promise.all(view.items.map(async (item, index): Promise<DesktopEntry> => {
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
    let icon = extractShellIconImage(artworkPath, true, artworkIndex);
    if (!icon && artworkPath !== realPath) icon = extractShellIconImage(realPath);
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
}
