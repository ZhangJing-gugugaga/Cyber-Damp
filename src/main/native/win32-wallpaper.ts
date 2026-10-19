/** Read IDesktopWallpaper; never capture other windows or change wallpaper settings. */
import koffi from 'koffi';
import { nativeImage, screen } from 'electron';
import { stat } from 'node:fs/promises';
import type { DesktopWallpaper, WallpaperRect } from '../../shared/types/wallpaper';

const CLSID = Buffer.from('1031cfc20e46c14fb9d08a1c0c9cc4bd', 'hex');
const IID = Buffer.from('a9562bb9558b144e9a890199bbb6f93b', 'hex');
const positions = ['center', 'tile', 'stretch', 'fit', 'fill', 'span'] as const;
koffi.struct('CDWallpaperRect', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const prototypes = {
  release: koffi.proto('uint32 __stdcall CDWallpaperRelease(void *self)'),
  wallpaper: koffi.proto('long __stdcall CDGetWallpaper(void *self, str16 monitor, _Out_ void **path)'),
  monitor: koffi.proto('long __stdcall CDGetWallpaperMonitor(void *self, uint32 index, _Out_ void **id)'),
  count: koffi.proto('long __stdcall CDGetWallpaperCount(void *self, _Out_ uint32 *count)'),
  rect: koffi.proto('long __stdcall CDGetWallpaperRect(void *self, str16 id, _Out_ CDWallpaperRect *rect)'),
  color: koffi.proto('long __stdcall CDGetWallpaperColor(void *self, _Out_ uint32 *color)'),
  position: koffi.proto('long __stdcall CDGetWallpaperPosition(void *self, _Out_ uint32 *position)'),
};

function readSettings(): { file: string; color: number; position: number; monitor: WallpaperRect; virtualDesktop: WallpaperRect } | null {
  if (process.platform !== 'win32') return null;
  const ole = koffi.load('ole32.dll');
  const initialize = ole.func('long CoInitializeEx(void *reserved, uint32 flags)');
  const uninitialize = ole.func('void CoUninitialize()');
  const create = ole.func('long CoCreateInstance(void *clsid, void *outer, uint32 context, void *iid, _Out_ void **object)');
  const free = ole.func('void CoTaskMemFree(void *memory)');
  const initialized = initialize(null, 2);
  const output: unknown[] = [null];
  let object: unknown = null;
  try {
    // Explorer can publish this factory out of process (Interactive User AppID).
    const result = create(CLSID, null, 5, IID, output);
    if (result < 0 || !output[0]) throw new Error(`IDesktopWallpaper creation HRESULT ${result.toString(16)}`);
    object = output[0];
    const vtable = koffi.decode(object, 'void *');
    const call = (slot: number, proto: ReturnType<typeof koffi.proto>, ...args: unknown[]): number =>
      Number(koffi.call(koffi.decode(vtable, slot * koffi.sizeof('void *'), 'void *'), proto, object, ...args));
    const string = (slot: number, proto: ReturnType<typeof koffi.proto>, arg: unknown): string => {
      const value: unknown[] = [null];
      try {
        const result = call(slot, proto, arg, value);
        return result >= 0 && value[0] ? koffi.decode.string16(value[0]) : '';
      } finally { if (value[0]) free(value[0]); }
    };
    const count = [0];
    if (call(6, prototypes.count, count) < 0) throw new Error('Wallpaper monitor enumeration failed');
    const monitors: Array<WallpaperRect & { id: string }> = [];
    for (let i = 0; i < Math.min(32, count[0]); i++) {
      const id = string(5, prototypes.monitor, i);
      const r = { left: 0, top: 0, right: 0, bottom: 0 };
      if (id && call(7, prototypes.rect, id, r) === 0 && r.right > r.left && r.bottom > r.top)
        monitors.push({ id, left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top });
    }
    const monitor = monitors.find(m => m.left === 0 && m.top === 0);
    if (!monitor) throw new Error(`Wallpaper primary monitor absent (${count[0]} monitors, ${monitors.length} rectangles)`);
    const left = Math.min(...monitors.map(m => m.left)), top = Math.min(...monitors.map(m => m.top));
    const color = [0], position = [4];
    if (call(9, prototypes.color, color) < 0 || call(11, prototypes.position, position) < 0) throw new Error('Wallpaper layout query failed');
    return { file: string(4, prototypes.wallpaper, monitor.id), color: color[0], position: position[0], monitor,
      virtualDesktop: { left, top, width: Math.max(...monitors.map(m => m.left + m.width)) - left,
        height: Math.max(...monitors.map(m => m.top + m.height)) - top } };
  } finally {
    if (object) {
      const vtable = koffi.decode(object, 'void *');
      koffi.call(koffi.decode(vtable, 2 * koffi.sizeof('void *'), 'void *'), prototypes.release, object);
    }
    if (initialized >= 0) uninitialize();
  }
}

export async function readDesktopWallpaper(): Promise<DesktopWallpaper | null> {
  try {
    const settings = readSettings();
    if (!settings) return null;
    const display = screen.getPrimaryDisplay(), scale = display.scaleFactor;
    const work = display.workArea, bounds = display.bounds;
    let imageDataUrl: string | null = null, imageWidth = 0, imageHeight = 0;
    if (settings.file) {
      const info = await stat(settings.file);
      if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('Wallpaper image exceeds decode limit');
      const image = nativeImage.createFromPath(settings.file);
      if (image.isEmpty()) throw new Error('Wallpaper image cannot be decoded');
      ({ width: imageWidth, height: imageHeight } = image.getSize());
      imageDataUrl = image.toDataURL();
    }
    const c = settings.color;
    return { imageDataUrl, imageWidth, imageHeight,
      backgroundColor: '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map(n => n.toString(16).padStart(2, '0')).join(''),
      position: positions[settings.position] ?? 'fill', monitor: settings.monitor, virtualDesktop: settings.virtualDesktop,
      scaleFactor: scale, workArea: { left: settings.monitor.left + Math.round((work.x - bounds.x) * scale),
        top: settings.monitor.top + Math.round((work.y - bounds.y) * scale),
        width: Math.round(work.width * scale), height: Math.round(work.height * scale) } };
  } catch (error) {
    console.warn('[desktop] Wallpaper unavailable for hallucination:', error instanceof Error ? error.message : String(error));
    return null;
  }
}
