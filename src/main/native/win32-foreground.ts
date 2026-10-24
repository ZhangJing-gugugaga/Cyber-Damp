/**
 * 前台窗口监控（R2 全屏自动隐藏的最小补充）
 *
 * 用官方 SetWinEventHook 的前台/位置变化通知触发检查（WINEVENT_OUTOFCONTEXT，
 * 经注册线程的消息循环投递）；不截获、不转发任何输入。
 * 判定：前台非 Shell 窗口是否覆盖胶囊所在显示器的可见区域。
 */
import koffi from 'koffi';
import { screen } from 'electron';

interface ForegroundApi {
  SetWinEventHook(eventMin: number, eventMax: number, hmodWinEventProc: unknown, pfnWinEventProc: unknown, idProcess: number, idThread: number, dwFlags: number): unknown;
  UnhookWinEvent(hWinEventHook: unknown): boolean;
  GetForegroundWindow(): unknown;
  GetWindowRect(hwnd: unknown, out: Record<string, number>): boolean;
  IsWindowVisible(hwnd: unknown): boolean;
  GetClassNameW(hwnd: unknown, buffer: Buffer, count: number): number;
}

const EVENT_SYSTEM_FOREGROUND = 0x0003;
const EVENT_OBJECT_LOCATIONCHANGE = 0x800b;
const EVENT_OBJECT_DESTROY = 0x8001;
const WINEVENT_OUTOFCONTEXT = 0;
const WINEVENT_SKIPOWNPROCESS = 2;

let api: ForegroundApi | null = null;
let apiFailed = false;

let foregroundHook: unknown = null;
let locationHook: unknown = null;
let destroyHook: unknown = null;
let callback: bigint | null = null;

function ensureApi(): ForegroundApi | null {
  if (api) return api;
  if (apiFailed || process.platform !== 'win32') return null;
  try {
    const user32 = koffi.load('user32.dll');
    api = {
      SetWinEventHook: user32.func('void *SetWinEventHook(uint32 eventMin, uint32 eventMax, void *hmodWinEventProc, WinEventProc *pfnWinEventProc, uint32 idProcess, uint32 idThread, uint32 dwFlags)'),
      UnhookWinEvent: user32.func('bool UnhookWinEvent(void *hWinEventHook)'),
      GetForegroundWindow: user32.func('void *GetForegroundWindow()'),
      GetWindowRect: user32.func('bool GetWindowRect(void *hWnd, _Out_ RECT *lpRect)'),
      IsWindowVisible: user32.func('bool IsWindowVisible(void *hWnd)'),
      GetClassNameW: user32.func('int GetClassNameW(void *hWnd, void *lpClassName, int nMaxCount)'),
    };
  } catch (err) {
    apiFailed = true;
    api = null;
    console.warn('[foreground] SetWinEventHook FFI 不可用，胶囊自动隐藏不可用:', err);
  }
  return api;
}

// RECT 与 WinEventProto 必须分开 try：win32-desktop 若先加载会已注册 RECT，
// 重复注册抛错被吞掉后 proto 也随之漏登记，ensureApi 的 func 声明就会报
// "Unknown or invalid type name 'WinEventProc'"（0.1.25 生产路径钩子未生效的根因）。
try {
  if (process.platform === 'win32') {
    koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
  }
} catch { /* 重复注册（与 win32-desktop 共享 RECT）忽略 */ }
try {
  if (process.platform === 'win32') {
    // 回调类型须在 user32.func 声明引用它之前登记（同 win32-desktop 的 EnumWindowsProc 惯例）
    koffi.proto('void __stdcall WinEventProc(void *hHook, uint32 event, void *hwnd, int32 idObject, int32 idChild, uint32 idThread, uint32 dwmsEventTime)');
  }
} catch { /* 重复注册忽略 */ }


function windowClassName(hwnd: unknown): string {
  const native = ensureApi();
  if (!native) return '';
  try {
    const buffer = Buffer.alloc(256);
    const length = native.GetClassNameW(hwnd, buffer, 128);
    return length > 0 ? buffer.toString('utf16le', 0, length * 2) : '';
  } catch {
    return '';
  }
}

function isShellWindow(className: string): boolean {
  return className === 'Progman' || className === 'WorkerW'
    || className === 'Shell_TrayWnd' || className.startsWith('Shell_SecondaryTrayWnd');
}

/** 前台窗口是否覆盖给定 DIP 矩形所在显示器（物理坐标比较，统一 DPI）。 */
export function foregroundCoversRect(dipRect: { x: number; y: number; width: number; height: number }): boolean {
  const native = ensureApi();
  if (!native) return false;
  try {
    const hwnd = native.GetForegroundWindow();
    if (!hwnd) return false;
    const className = windowClassName(hwnd);
    if (!className || isShellWindow(className)) return false;
    if (!native.IsWindowVisible(hwnd)) return false;
    const rect: Record<string, number> = { left: 0, top: 0, right: 0, bottom: 0 };
    if (!native.GetWindowRect(hwnd, rect)) return false;
    // 判定"全屏级覆盖"：前台窗口物理面积 ≥ 目标显示器工作区面积
    const display = screen.getDisplayNearestPoint({ x: dipRect.x, y: dipRect.y });
    const workPhysical = screen.dipToScreenRect(null, display.workArea);
    const winWidth = rect.right - rect.left;
    const winHeight = rect.bottom - rect.top;
    const covers = winWidth * winHeight >= workPhysical.width * workPhysical.height * 0.9;
    const overlaps = rect.left <= workPhysical.x + workPhysical.width && rect.right >= workPhysical.x
      && rect.top <= workPhysical.y + workPhysical.height && rect.bottom >= workPhysical.y;
    return covers && overlaps;
  } catch {
    return false;
  }
}

/**
 * 安装前台/位置变化钩子，变化时调用 onMaybeChanged。
 * 返回卸载函数。钩子不可用时返回 null（调用方可降级为无自动隐藏）。
 */
export function startForegroundWatch(onMaybeChanged: () => void): (() => void) | null {
  const native = ensureApi();
  if (!native || foregroundHook) return null;
  try {
    // 异步回调（消息循环投递）必须 koffi.register 创建带 HandleScope 的跳板；
    // 直接传 JS 函数会在事件到达时触发 V8 "Cannot create a handle" 致命错。
    let last = 0;
    const handler = () => {
      const now = Date.now();
      if (now - last < 400) return;
      last = now;
      onMaybeChanged();
    };
    callback = koffi.register(handler, 'WinEventProc *');
    // 不用 SKIPOWNPROCESS：覆盖窗/护理窗多为本进程窗口，其前台变化同样需要触发复查；
    // 事件量由 400ms 去抖控制，检查本身只是 GetForegroundWindow + 一次矩形比较。
    const flags = WINEVENT_OUTOFCONTEXT;
    foregroundHook = native.SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, null, callback, 0, 0, flags);
    locationHook = native.SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, null, callback, 0, 0, flags);
    // 覆盖窗销毁时前台可能回到本进程（SKIPOWNPROCESS 不投递），需要销毁事件触发复查
    destroyHook = native.SetWinEventHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_DESTROY, null, callback, 0, 0, flags);
    if (!foregroundHook && !locationHook && !destroyHook) {
      koffi.unregister(callback);
      callback = null;
      return null;
    }
    return () => {
      for (const handle of [foregroundHook, locationHook, destroyHook]) {
        if (handle) { try { native.UnhookWinEvent(handle); } catch { /* 已卸载 */ } }
      }
      foregroundHook = null;
      locationHook = null;
      destroyHook = null;
      if (callback) { try { koffi.unregister(callback); } catch { /* 已注销 */ } callback = null; }
    };
  } catch (err) {
    console.warn('[foreground] 钩子安装失败:', err);
    callback = null;
    return null;
  }
}
