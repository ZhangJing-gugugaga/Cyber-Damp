/**
 * Win32 桌面层级托管（main 进程，koffi FFI，零子进程）
 *
 * - 查找 Progman → 发送 0x052C 生成 WorkerW → 找到承载 SHELLDLL_DefView 的层，
 *   把它下面那个 WorkerW 作为宿主，用 SetParent 将 Electron 窗口嵌到壁纸层；
 * - 找到 SHELLDLL_DefView 下的 SysListView32，启动就绪后 ShowWindow(SW_HIDE)；
 * - 所有退出路径（exit/SIGINT/SIGTERM/SIGBREAK/uncaughtException/will-quit）
 *   都调用 restoreDesktop() 恢复原生图标；Explorer 重启由 5s 监护兜底。
 *
 * 安全红线：attach 失败时绝不隐藏原生图标。
 */
import koffi from 'koffi';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { protectDesktopIcons } from './desktop-watchdog';

type Hwnd = bigint;

const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, intptr_t lParam)');

const SW_HIDE = 0;
const SW_SHOW = 5;
const GWL_STYLE = -16;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SWP_HIDEWINDOW = 0x0080;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Point {
  x: number;
  y: number;
}

interface Win32 {
  GetAsyncKeyState(key: number): number;
  GetForegroundWindow(): unknown;
  GetClassNameW(hwnd: unknown, buffer: Buffer, count: number): number;
  GetDoubleClickTime(): number;
  FindWindowW(cls: unknown, title: unknown): unknown;
  FindWindowExW(parent: unknown, after: unknown, cls: unknown, title: unknown): unknown;
  SendMessageTimeoutW(hwnd: unknown, msg: number, wp: number, lp: number, flags: number, timeout: number, result: unknown): unknown;
  EnumWindows(cb: unknown, lParam: number): boolean;
  ShowWindow(hwnd: unknown, cmd: number): boolean;
  SetParent(child: unknown, parent: unknown): unknown;
  GetParent(hwnd: unknown): unknown;
  IsWindow(hwnd: unknown): boolean;
  GetWindowLongW(hwnd: unknown, index: number): number;
  SetWindowLongW(hwnd: unknown, index: number, value: number): number;
  GetWindowRect(hwnd: unknown, out: Rect): boolean;
  ScreenToClient(hwnd: unknown, io: Point): boolean;
  SetWindowPos(hwnd: unknown, after: unknown, x: number, y: number, cx: number, cy: number, flags: number): boolean;
}

let api: Win32 | null = null;
let apiFailed = false;

function win32(): Win32 | null {
  if (api) return api;
  if (apiFailed || process.platform !== 'win32') return null;
  try {
    const user32 = koffi.load('user32.dll');
    api = {
      GetAsyncKeyState: user32.func('int16 GetAsyncKeyState(int vKey)'),
      GetForegroundWindow: user32.func('void *GetForegroundWindow()'),
      GetClassNameW: user32.func('int GetClassNameW(void *hWnd, void *lpClassName, int nMaxCount)'),
      GetDoubleClickTime: user32.func('uint32 GetDoubleClickTime()'),
      FindWindowW: user32.func('void *FindWindowW(str16 lpClassName, str16 lpWindowName)'),
      FindWindowExW: user32.func(
        'void *FindWindowExW(void *hWndParent, void *hWndChildAfter, str16 lpszClass, str16 lpszWindow)',
      ),
      SendMessageTimeoutW: user32.func(
        'intptr_t SendMessageTimeoutW(void *hWnd, uint32 Msg, uintptr_t wParam, intptr_t lParam, uint32 fuFlags, uint32 uTimeout, void *lpdwResult)',
      ),
      EnumWindows: user32.func('bool EnumWindows(EnumWindowsProc *lpEnumFunc, intptr_t lParam)'),
      ShowWindow: user32.func('bool ShowWindow(void *hWnd, int nCmdShow)'),
      SetParent: user32.func('void *SetParent(void *hWndChild, void *hWndNewParent)'),
      GetParent: user32.func('void *GetParent(void *hWnd)'),
      IsWindow: user32.func('bool IsWindow(void *hWnd)'),
      GetWindowLongW: user32.func('int GetWindowLongW(void *hWnd, int nIndex)'),
      SetWindowLongW: user32.func('int SetWindowLongW(void *hWnd, int nIndex, int dwNewLong)'),
      GetWindowRect: user32.func('bool GetWindowRect(void *hWnd, _Out_ RECT *lpRect)'),
      ScreenToClient: user32.func('bool ScreenToClient(void *hWnd, _Inout_ POINT *lpPoint)'),
      SetWindowPos: user32.func(
        'bool SetWindowPos(void *hWnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)',
      ),
    };
  } catch (err) {
    apiFailed = true;
    api = null;
    console.warn('[desktop] Win32 FFI 不可用，降级为普通窗口:', err);
  }
  return api;
}

// 结构定义需要在使用 func 声明前注册，放到模块顶层更稳妥
try {
  if (process.platform === 'win32') {
    koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    koffi.struct('POINT', { x: 'long', y: 'long' });
  }
} catch {
  /* 重复注册时忽略；实际调用前还会再确保 */
}

interface DesktopState {
  overlay: Hwnd | null;
  host: Hwnd | null;
  listView: Hwnd | null;
  originalStyle: number;
  attached: boolean;
  iconsHidden: boolean;
}

const state: DesktopState = {
  overlay: null,
  host: null,
  listView: null,
  originalStyle: 0,
  attached: false,
  iconsHidden: false,
};

/** Read only the button and desktop focus needed for clearing surrogate selection.
 * Polling never synthesizes a click or captures input from another application. */
export function desktopPointerState(): { leftDown: boolean; desktopActive: boolean } {
  const native = win32();
  if (!native) return { leftDown: false, desktopActive: false };
  const foreground = native.GetForegroundWindow();
  const buffer = Buffer.alloc(128);
  const length = native.GetClassNameW(foreground, buffer, 64);
  const cls = buffer.toString('utf16le', 0, Math.max(0, length) * 2);
  return { leftDown: (native.GetAsyncKeyState(1) & 0x8000) !== 0,
    desktopActive: toHwnd(foreground) === state.overlay || ['Progman', 'WorkerW', 'SHELLDLL_DefView', 'SysListView32'].includes(cls) };
}

function toHwnd(value: unknown): Hwnd | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value === 0n ? null : value;
  if (typeof value === 'number') return value === 0 ? null : BigInt(value);
  try {
    const addr = koffi.address(value);
    const b = BigInt(addr);
    return b === 0n ? null : b;
  } catch {
    return null;
  }
}

function windowHandle(win: BrowserWindow): Hwnd | null {
  try {
    const buf = win.getNativeWindowHandle();
    return buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
  } catch {
    return null;
  }
}

/** Existing borderless overlay bounds in physical desktop pixels. */
export function overlayScreenRect(win: BrowserWindow): { x: number; y: number; width: number; height: number } | null {
  const a = win32(), hwnd = windowHandle(win);
  if (!a || !hwnd) return null;
  const rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!a.GetWindowRect(hwnd, rect)) return null;
  return { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top };
}

/** Keep one existing scene; size its native surface to all monitor work areas. */
export function fitOverlayScreenRect(win: BrowserWindow, rect: { x: number; y: number; width: number; height: number }): boolean {
  const a = win32(), hwnd = windowHandle(win);
  if (!a || !hwnd) return false;
  const point = { x: rect.x, y: rect.y };
  if (state.attached && state.host) a.ScreenToClient(state.host, point);
  // Electron enforces fixed min/max through WM_GETMINMAXINFO when non-resizable.
  // Temporarily release those existing constraints while resizing our hidden surface.
  const resizable = win.isResizable();
  try {
    if (!resizable) win.setResizable(true);
    return Boolean(a.SetWindowPos(hwnd, null, Math.round(point.x), Math.round(point.y), Math.round(rect.width), Math.round(rect.height), SWP_NOACTIVATE | 0x0004));
  } finally { if (!resizable) win.setResizable(false); }
}

interface FoundDesktop {
  host: Hwnd;
  defView: Hwnd | null;
  listView: Hwnd | null;
}

/** 查找壁纸层 WorkerW 与桌面图标列表窗口 */
function findDesktopWindows(a: Win32): FoundDesktop | null {
  const progman = toHwnd(a.FindWindowW('Progman', null));
  if (!progman) return null;

  // 0x052C：让 Explorer 生成承载壁纸的 WorkerW
  a.SendMessageTimeoutW(progman, 0x052c, 0, 0, 0, 1000, null);

  let defView: Hwnd | null = toHwnd(a.FindWindowExW(progman, null, 'SHELLDLL_DefView', null));
  let holder: Hwnd | null = defView ? progman : null;

  if (!defView) {
    const cb = koffi.register((hwnd: unknown) => {
      const h = toHwnd(hwnd);
      if (!h) return true;
      const dv = toHwnd(a.FindWindowExW(h, null, 'SHELLDLL_DefView', null));
      if (dv) {
        defView = dv;
        holder = h;
        return false;
      }
      return true;
    }, koffi.pointer(EnumWindowsProc));
    try {
      a.EnumWindows(cb, 0);
    } finally {
      koffi.unregister(cb);
    }
  }

  // A wallpaper WorkerW sits *behind* SHELLDLL_DefView. Hiding SysListView32
  // does not remove DefView's mouse hit surface: it swallows all native input.
  // Host inside DefView instead, above the icon list and below ordinary apps.
  const host: Hwnd = defView ?? holder ?? progman;

  const listView = defView ? toHwnd(a.FindWindowExW(defView, null, 'SysListView32', null)) : null;
  return { host, defView, listView };
}

function placeChild(win: BrowserWindow, a: Win32, host: Hwnd, show = true): boolean {
  const hwnd = windowHandle(win);
  if (!hwnd) return false;
  const rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!a.GetWindowRect(hwnd, rect)) return false;
  const width = Math.max(1, rect.right - rect.left);
  const height = Math.max(1, rect.bottom - rect.top);
  const pt: Point = { x: rect.left, y: rect.top };
  a.ScreenToClient(host, pt);
  return Boolean(
    a.SetWindowPos(
      hwnd,
      null,
      Math.round(pt.x),
      Math.round(pt.y),
      width,
      height,
      SWP_NOACTIVATE | SWP_FRAMECHANGED | (show ? SWP_SHOWWINDOW : 0),
    ),
  );
}

/** 挂载到 WorkerW 壁纸层；失败返回 false（调用方不得隐藏图标） */
export function attachOverlayToDesktop(win: BrowserWindow, show = true): boolean {
  const a = win32();
  if (!a) return false;
  const hwnd = windowHandle(win);
  if (!hwnd) return false;
  const found = findDesktopWindows(a);
  if (!found) {
    console.warn('[desktop] 未找到 Progman/WorkerW，保持普通窗口层级');
    return false;
  }

  try {
    if (!state.attached) {
      state.originalStyle = Number(a.GetWindowLongW(hwnd, GWL_STYLE)) | 0;
    }
    // 先登记，保证后续任何一步抛错都能在 catch/退出路径里解绑并恢复图标
    state.overlay = hwnd;
    state.host = found.host;
    state.listView = found.listView ?? state.listView;
    state.attached = true;
    // 去掉顶层弹出样式，改为 WorkerW 的子窗口；透明分层窗口从 Win8 起支持子窗口
    const style = (state.originalStyle & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME)) | WS_CHILD;
    a.SetWindowLongW(hwnd, GWL_STYLE, style);
    a.SetParent(hwnd, found.host);
    if (toHwnd(a.GetParent(hwnd)) !== found.host) throw new Error('SetParent did not attach the overlay');
    // HWND_TOP = 0：置于宿主子窗口最上层；宿主本身仍在所有常规应用窗口之下
    // Initial takeover attaches while hidden; watchdog/readiness must finish
    // before the IPC caller reveals the fully painted desktop replacement.
    if (!placeChild(win, a, found.host, show)) throw new Error('SetWindowPos did not place the desktop overlay');
    console.info(
      `[desktop] 已嵌入 WorkerW: host=0x${found.host.toString(16)} listView=${
        state.listView ? `0x${state.listView.toString(16)}` : '未找到'
      }`,
    );
    return true;
  } catch (err) {
    console.warn('[desktop] SetParent/样式设置失败，回滚:', err);
    if (state.attached) restoreDesktop();
    return false;
  }
}

/** 启动就绪后隐藏原生桌面图标；未挂载成功时拒绝执行 */
export function prepareDesktopProtection(): void {
  const a = win32(); if (!a) return;
  const handle = findDesktopWindows(a)?.listView;
  if (handle) void protectDesktopIcons(handle).catch(error => console.warn('[desktop-watchdog] Preparation failed:', error));
}

export async function hideDesktopIcons(): Promise<boolean> {
  if (!state.attached) return false;
  const a = win32();
  if (!a) return false;
  const found = findDesktopWindows(a);
  if (found?.listView) state.listView = found.listView;
  const listView = state.listView;
  if (!listView || !a.IsWindow(listView)) {
    console.warn('[desktop] 未找到 SysListView32，原生图标保持显示');
    return false;
  }
  if (!await protectDesktopIcons(listView)) {
    console.warn('[desktop] Restore watchdog unavailable; native icons stay visible');
    return false;
  }
  a.ShowWindow(listView, SW_HIDE);
  state.iconsHidden = true;
  console.info('[desktop] 原生桌面图标已隐藏（由替身接管）');
  return true;
}

/** 恢复原生图标 + 把窗口还给桌面；幂等，可在任意退出路径调用 */
export function restoreDesktop(): void {
  const a = win32();
  if (!a) return;
  try {
    if (state.overlay && state.attached) {
      a.ShowWindow(state.overlay, SW_HIDE);
      a.SetParent(state.overlay, null);
      a.SetWindowLongW(state.overlay, GWL_STYLE, state.originalStyle);
      a.SetWindowPos(
        state.overlay,
        null,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_HIDEWINDOW,
      );
    }
  } catch (err) {
    console.warn('[desktop] 恢复窗口层级失败:', err);
  }

  try {
    let listView = state.listView;
    if (!listView || !a.IsWindow(listView)) {
      const found = findDesktopWindows(a);
      listView = found?.listView ?? null;
    }
    if (listView && a.IsWindow(listView)) {
      a.ShowWindow(listView, SW_SHOW);
      if (state.iconsHidden) console.info('[desktop] 原生桌面图标已恢复');
    }
  } catch (err) {
    console.warn('[desktop] 恢复原生图标失败:', err);
  }

  state.iconsHidden = false;
  state.attached = false;
  state.overlay = null;
  state.host = null;
}

export function isDesktopAttached(): boolean {
  return state.attached;
}

export function doubleClickInterval(): number {
  return win32()?.GetDoubleClickTime() || 500;
}

/** 显示器/DPI 变化后按物理像素重新贴合 WorkerW 客户区 */
export function repositionOverlay(win: BrowserWindow): void {
  if (!state.attached || !state.host) return;
  const a = win32();
  if (!a) return;
  if (!a.IsWindow(state.host)) {
    // Explorer 重启：宿主的子窗口已失效，重新挂载
    attachOverlayToDesktop(win, win.isVisible());
    return;
  }
  placeChild(win, a, state.host, win.isVisible());
}

let monitorStarted = false;
let shuttingDown = false;
let hostSuspended = false;
export function suspendDesktopHost(value: boolean): void { hostSuspended = value; }

export function shutdownDesktop(): void {
  shuttingDown = true;
  restoreDesktop();
}

/** 5s 监护：宿主窗口/图标列表被 Explorer 重建时自动重新占用 */
export function startDesktopHostMonitor(win: BrowserWindow): void {
  if (monitorStarted) return;
  monitorStarted = true;
  const timer = setInterval(() => {
    if (shuttingDown || hostSuspended) return;
    if (win.isDestroyed()) return;
    const a = win32();
    if (!a) return;
    if (!state.attached || !state.host || !a.IsWindow(state.host)) {
      if (attachOverlayToDesktop(win)) void hideDesktopIcons();
      return;
    }
    if (state.iconsHidden && (!state.listView || !a.IsWindow(state.listView))) {
      const found = findDesktopWindows(a);
      if (found?.listView) {
        state.listView = found.listView;
        void hideDesktopIcons();
      }
    }
  }, 5000);
  timer.unref();
  win.on('closed', () => {
    clearInterval(timer);
    restoreDesktop();
  });
}

/** 注册所有退出路径的恢复钩子（安全红线） */
export function installDesktopSafety(): void {
  const restore = (): void => {
    try {
      shutdownDesktop();
    } catch {
      /* exit 钩子内绝不能再抛 */
    }
  };
  process.on('exit', restore);
  app.on('will-quit', restore);
  app.on('before-quit', restore);
  process.on('SIGINT', () => {
    restore();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    restore();
    process.exit(0);
  });
  // Windows Ctrl+Break
  process.on('SIGBREAK' as NodeJS.Signals, () => {
    restore();
    process.exit(0);
  });
  process.on('uncaughtException', (err) => {
    console.error('[desktop] 主进程未捕获异常，先恢复原生图标再退出:', err);
    restore();
    process.exit(1);
  });
}
