/**
 * 原生 Shell 图标提取（独立线程可用，koffi FFI）
 * 用于回收站等 Shell 命名空间项：SHParseDisplayNameW → SHGetFileInfoW(SHGFI_PIDL)
 * → HICON → GetDIBits → BGRA ；不依赖 Electron API。
 * 优先从 Shell 的 256px 图标列表提取原画，旧提供者回退至 SHGFI_ICON。
 */
import koffi, { type TypeObject } from 'koffi';
import { largeShellIcon } from './win32-icon-list';

const SHGFI_ICON = 0x000000100;
const SHGFI_PIDL = 0x000000008;
const SHGFI_LARGEICON = 0x000000000;
const SHGFI_SYSICONINDEX = 0x000004000;
const DIB_RGB_COLORS = 0;

interface ShellStructs {
  SHFILEINFOW: TypeObject;
  ICONINFO: TypeObject;
  BITMAP: TypeObject;
  BITMAPINFOHEADER: TypeObject;
  BITMAPINFO: TypeObject;
}

let types: ShellStructs | undefined;

function ensureTypes() {
  if (types) return types;
  types = {
    SHFILEINFOW: koffi.struct('SHFILEINFOW', {
      hIcon: 'void *',
      iIcon: 'int',
      dwAttributes: 'uint32',
      szDisplayName: 'uint16[260]',
      szTypeName: 'uint16[80]',
    }),
    ICONINFO: koffi.struct('ICONINFO', {
      fIcon: 'int',
      xHotspot: 'uint32',
      yHotspot: 'uint32',
      hbmMask: 'void *',
      hbmColor: 'void *',
    }),
    BITMAP: koffi.struct('BITMAP', {
      bmType: 'long',
      bmWidth: 'long',
      bmHeight: 'long',
      bmWidthBytes: 'long',
      bmPlanes: 'uint16',
      bmBitsPixel: 'uint16',
      bmBits: 'void *',
    }),
    BITMAPINFOHEADER: koffi.struct('BITMAPINFOHEADER', {
      biSize: 'uint32',
      biWidth: 'long',
      biHeight: 'long',
      biPlanes: 'uint16',
      biBitCount: 'uint16',
      biCompression: 'uint32',
      biSizeImage: 'uint32',
      biXPelsPerMeter: 'long',
      biYPelsPerMeter: 'long',
      biClrUsed: 'uint32',
      biClrImportant: 'uint32',
    }),
    BITMAPINFO: koffi.struct('BITMAPINFO', {
      bmiHeader: 'BITMAPINFOHEADER',
      bmiColors: 'uint32[1]',
    }),
  };
  return types;
}

interface IconApi {
  SHDefExtractIconW(name: string, index: number, flags: number, large: unknown[], small: unknown, size: number): number;
  SHParseDisplayName(name: unknown, pbc: unknown, out: unknown[], sfgaoIn: number, outAttrs: number[]): number;
  SHGetFileInfoW(pidl: unknown, attrs: number, sfi: unknown, size: number, flags: number): number;
  GetIconInfo(icon: unknown, out: unknown): boolean;
  GetObjectW(obj: unknown, size: number, out: unknown): number;
  CreateCompatibleDC(hdc: unknown): unknown;
  DeleteDC(dc: unknown): boolean;
  GetDIBits(dc: unknown, bmp: unknown, start: number, lines: number, bits: Buffer, bmi: unknown, usage: number): number;
  DeleteObject(obj: unknown): boolean;
  DestroyIcon(icon: unknown): boolean;
  CoTaskMemFree(ptr: unknown): void;
}

let iconApi: IconApi | null = null;
let iconApiFailed = false;

function loadIconApi(): IconApi | null {
  if (iconApi) return iconApi;
  if (iconApiFailed || process.platform !== 'win32') return null;
  try {
    ensureTypes();
    const shell32 = koffi.load('shell32.dll');
    const user32 = koffi.load('user32.dll');
    const gdi32 = koffi.load('gdi32.dll');
    const ole32 = koffi.load('ole32.dll');
    iconApi = {
      SHDefExtractIconW: shell32.func('long SHDefExtractIconW(str16 name, int index, uint32 flags, _Out_ void **large, void *small, uint32 size)'),
      SHParseDisplayName: shell32.func(
        'long SHParseDisplayName(str16 pszName, void *pbc, _Out_ void **ppidl, uint32 sfgaoIn, _Out_ uint32 *psfgaoOut)',
      ),
      SHGetFileInfoW: shell32.func(
        'intptr_t SHGetFileInfoW(void *pszPath, uint32 dwFileAttributes, _Inout_ SHFILEINFOW *psfi, uint32 cbFileInfo, uint32 uFlags)',
      ),
      GetIconInfo: user32.func('bool GetIconInfo(void *hIcon, _Out_ ICONINFO *piconinfo)'),
      GetObjectW: gdi32.func('int GetObjectW(void *h, int c, _Out_ BITMAP *pv)'),
      CreateCompatibleDC: gdi32.func('void *CreateCompatibleDC(void *hdc)'),
      DeleteDC: gdi32.func('bool DeleteDC(void *hdc)'),
      GetDIBits: gdi32.func(
        'int GetDIBits(void *hdc, void *hbm, uint32 start, uint32 cLines, _Out_ uint8_t *lpvBits, _Inout_ BITMAPINFO *lpbmi, uint32 usage)',
      ),
      DeleteObject: gdi32.func('bool DeleteObject(void *ho)'),
      DestroyIcon: user32.func('bool DestroyIcon(void *hIcon)'),
      CoTaskMemFree: ole32.func('void CoTaskMemFree(void *pv)'),
    };
  } catch (err) {
    iconApiFailed = true;
    iconApi = null;
    console.warn('[desktop] 原生图标提取不可用:', err);
  }
  return iconApi;
}

/**
 * 提取 Shell 命名空间项的图标 PNG。
 * @param shellName 例如回收站 '::{645FF040-5081-101B-9F08-00AA002F954E}'
 */
export interface ShellIconPixels { pixels: Buffer; width: number; height: number }

export function extractShellIconPixels(shellName: string, jumbo = true, resourceIndex?: number): ShellIconPixels | null {
  const api = loadIconApi();
  if (!api) return null;
  const t = ensureTypes();
  const sizeSfi = koffi.sizeof(t.SHFILEINFOW);
  const sizeBitmap = koffi.sizeof(t.BITMAP);
  const sizeHeader = koffi.sizeof(t.BITMAPINFOHEADER);

  let pidl: unknown = null;
  let hIcon: unknown = null;
  let hbmMask: unknown = null;
  let hbmColor: unknown = null;
  let dc: unknown = null;

  try {
    if (resourceIndex !== undefined) {
      const large: unknown[] = [null];
      const result = api.SHDefExtractIconW(shellName, resourceIndex, 0, large, null, jumbo ? 256 : 64);
      hIcon = large[0];
      if (result !== 0 || !hIcon) return null;
    } else {
    const outPidl: unknown[] = [null];
    const outAttrs = [0];
    const hr = api.SHParseDisplayName(shellName, null, outPidl, 0, outAttrs);
    pidl = outPidl[0];
    if (!pidl || (typeof hr === 'number' && hr < 0)) return null;

    const sfi: Record<string, unknown> = {
      hIcon: null,
      iIcon: 0,
      dwAttributes: 0,
      szDisplayName: new Array(260).fill(0),
      szTypeName: new Array(80).fill(0),
    };
    const res = api.SHGetFileInfoW(pidl, 0, sfi, sizeSfi, SHGFI_ICON | SHGFI_PIDL | SHGFI_LARGEICON | SHGFI_SYSICONINDEX);
    if (!res || !sfi.hIcon) return null;
    hIcon = sfi.hIcon;
    const largeIcon = largeShellIcon(Number(sfi.iIcon), jumbo);
    if (largeIcon) {
      api.DestroyIcon(hIcon);
      hIcon = largeIcon;
    }
    }

    const info: Record<string, unknown> = {
      fIcon: 0,
      xHotspot: 0,
      yHotspot: 0,
      hbmMask: null,
      hbmColor: null,
    };
    if (!api.GetIconInfo(hIcon, info)) return null;
    hbmMask = info.hbmMask;
    hbmColor = info.hbmColor;
    if (!hbmColor) return null;

    const bmp: Record<string, unknown> = {};
    if (!api.GetObjectW(hbmColor, sizeBitmap, bmp)) return null;
    const width = Number(bmp.bmWidth);
    const height = Math.abs(Number(bmp.bmHeight));
    if (!width || !height || width > 1024 || height > 1024) return null;

    const bmi: Record<string, unknown> = {
      bmiHeader: {
        biSize: sizeHeader,
        biWidth: width,
        biHeight: -height,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: 0,
        biSizeImage: width * height * 4,
        biXPelsPerMeter: 0,
        biYPelsPerMeter: 0,
        biClrUsed: 0,
        biClrImportant: 0,
      },
      bmiColors: [0],
    };
    const pixels = Buffer.alloc(width * height * 4);
    dc = api.CreateCompatibleDC(null);
    if (!dc) return null;
    const lines = api.GetDIBits(dc, hbmColor, 0, height, pixels, bmi, DIB_RGB_COLORS);
    if (!lines) return null;

    // 部分旧图标 alpha 全 0：用 RGB 非零重建 alpha（避免整张透明）
    let hasAlpha = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0) {
        hasAlpha = true;
        break;
      }
    }
    if (!hasAlpha) {
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i + 3] = pixels[i] | pixels[i + 1] | pixels[i + 2] ? 255 : 0;
      }
    }

    // Legacy providers put a small icon in the corner of a JUMBO canvas.
    // Ask Shell for its regular artwork instead of cropping genuine margins.
    if (jumbo && width >= 256) {
      let right = -1, bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 16) continue;
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (right < width * .4 && bottom < height * .4) {
        return extractShellIconPixels(shellName, false, resourceIndex);
      }
    }
    return { pixels, width, height };
  } catch (err) {
    console.warn('[desktop] 提取 Shell 图标失败:', err);
    return null;
  } finally {
    try {
      if (dc) api.DeleteDC(dc);
      if (hbmColor) api.DeleteObject(hbmColor);
      if (hbmMask) api.DeleteObject(hbmMask);
      if (hIcon) api.DestroyIcon(hIcon);
      if (pidl) api.CoTaskMemFree(pidl);
    } catch {
      /* 清理失败不影响主流程 */
    }
  }
}

