/** Local system-selected wallpaper only; no arbitrary file path is accepted over IPC. */
export interface WallpaperRect { left: number; top: number; width: number; height: number }
export interface DesktopWallpaper {
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  backgroundColor: string;
  position: 'center' | 'tile' | 'stretch' | 'fit' | 'fill' | 'span';
  monitor: WallpaperRect;
  virtualDesktop: WallpaperRect;
  workArea: WallpaperRect;
  scaleFactor: number;
}
