import type { DesktopGeometry } from './types/desktop';
export interface ScreenRect { x: number; y: number; width: number; height: number }

/** Union preserves negative monitor origins; never rearranges Shell items. */
export function unionScreenRects(rects: readonly ScreenRect[]): ScreenRect {
  if (!rects.length) throw new Error('没有可用显示区域');
  for (const r of rects) if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) throw new Error('无效显示区域');
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.max(...rects.map(r => r.y + r.height)) - y };
}

/** Physical Shell pixels -> the one canvas' CSS pixels, including mixed-DPI monitors. */
export function projectShellGeometry(icon: ScreenRect, label: ScreenRect, logicalSize: number,
  displayScale: number, viewport: ScreenRect, canvasScale: number): DesktopGeometry {
  if (![logicalSize, displayScale, canvasScale].every(v => Number.isFinite(v) && v > 0)) throw new Error('无效桌面缩放');
  const size = logicalSize * displayScale;
  if (size > icon.width + 1 || size > icon.height + 1) throw new Error('Shell image exceeds icon rectangle');
  return { x: (icon.x + (icon.width - size) / 2 - viewport.x) / canvasScale,
    y: (icon.y + icon.height - size - viewport.y) / canvasScale,
    size: size / canvasScale, labelX: (label.x - viewport.x) / canvasScale,
    labelY: (label.y - viewport.y) / canvasScale, labelWidth: label.width / canvasScale,
    labelHeight: label.height / canvasScale, labelScale: displayScale / canvasScale };
}
