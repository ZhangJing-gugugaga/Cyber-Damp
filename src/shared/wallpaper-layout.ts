import type { DesktopWallpaper, WallpaperRect } from './types/wallpaper';

/** Match Windows wallpaper placement in physical desktop pixels before DIP conversion. */
export function wallpaperLayout(w: DesktopWallpaper): WallpaperRect & { tile: boolean } {
  const area = w.position === 'span' ? w.virtualDesktop : w.monitor;
  let width = w.imageWidth, height = w.imageHeight;
  if (width <= 0 || height <= 0) return { ...area, tile: false };
  if (w.position === 'stretch') { width = area.width; height = area.height; }
  else if (w.position === 'fill' || w.position === 'fit' || w.position === 'span') {
    const scale = (w.position === 'fit' ? Math.min : Math.max)(area.width / width, area.height / height);
    width *= scale; height *= scale;
  }
  return {
    left: w.position === 'tile' ? area.left : area.left + (area.width - width) / 2,
    top: w.position === 'tile' ? area.top : area.top + (area.height - height) / 2,
    width, height, tile: w.position === 'tile',
  };
}
