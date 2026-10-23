/**
 * 桌面图标引用刷新（koffi，最小补充）
 *
 * R1 红线：只对被修改的对象发 SHCNE_UPDATEITEM/UPDATEDIR，
 * 不重建全局图标缓存、不杀 Explorer。
 */
import koffi from 'koffi';

interface ShellNotify {
  SHChangeNotify(wEventId: number, uFlags: number, dwItem1: unknown, dwItem2: unknown): void;
  SetFileAttributesW(lpFileName: string, dwFileAttributes: number): boolean;
  GetFileAttributesW(lpFileName: string): number;
}

let api: ShellNotify | null = null;
let apiFailed = false;

const SHCNE_UPDATEDIR = 0x00001000;
const SHCNE_UPDATEITEM = 0x00002000;
const SHCNF_PATHW = 0x0005;
export const FILE_ATTRIBUTE_HIDDEN = 0x2;
export const FILE_ATTRIBUTE_SYSTEM = 0x4;
export const INVALID_FILE_ATTRIBUTES = -1;

function shell32(): ShellNotify | null {
  if (api) return api;
  if (apiFailed || process.platform !== 'win32') return null;
  try {
    const shell = koffi.load('shell32.dll');
    const kernel = koffi.load('kernel32.dll');
    api = {
      SHChangeNotify: shell.func('void SHChangeNotify(int32 wEventId, uint32 uFlags, str16 dwItem1, str16 dwItem2)'),
      SetFileAttributesW: kernel.func('bool SetFileAttributesW(str16 lpFileName, uint32 dwFileAttributes)'),
      GetFileAttributesW: kernel.func('int32 GetFileAttributesW(str16 lpFileName)'),
    };
  } catch (err) {
    apiFailed = true;
    api = null;
    console.warn('[icon-mutate] shell32/kernel32 FFI 不可用，仅写文件不主动刷新:', err);
  }
  return api;
}

function notify(wEventId: number, path: string): void {
  const native = shell32();
  if (!native) return;
  try {
    native.SHChangeNotify(wEventId, SHCNF_PATHW, path, null);
  } catch (err) {
    console.warn('[icon-mutate] SHChangeNotify 失败（Explorer 会按自身节奏感知）:', err);
  }
}

/** 通知 Explorer 单个对象（文件夹或 .lnk）的显示已变化。 */
export function notifyItemChanged(realPath: string): void {
  notify(SHCNE_UPDATEITEM, realPath);
}

/** 通知目录内容变化（用于桌面根感知 desktop.ini 变化）。 */
export function notifyDirChanged(dirPath: string): void {
  notify(SHCNE_UPDATEDIR, dirPath);
}

export function getFileAttributes(filePath: string): number | null {
  const native = shell32();
  if (!native) return null;
  try {
    const attrs = native.GetFileAttributesW(filePath);
    return attrs === INVALID_FILE_ATTRIBUTES ? null : attrs;
  } catch {
    return null;
  }
}

export function setFileAttributes(filePath: string, attrs: number): boolean {
  const native = shell32();
  if (!native) return false;
  try {
    return native.SetFileAttributesW(filePath, attrs);
  } catch {
    return false;
  }
}
