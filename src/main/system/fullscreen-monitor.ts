/**
 * 全屏/锁屏暂停监控（main 进程，AC-28）
 * Windows：user32 查询前台窗口矩形 vs 监视器矩形（koffi FFI，零子进程）；
 * 锁屏/休眠：powerMonitor。暂停时隐藏覆盖窗并通知渲染层停渲染/停物理。
 */
import type { BrowserWindow } from 'electron';
import { powerMonitor } from 'electron';
import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const MONITORINFO = koffi.struct('MONITORINFO', {
  cbSize: 'uint32',
  rcMonitor: RECT,
  rcWork: RECT,
  dwFlags: 'uint32',
});

const GetForegroundWindow = user32.func('void *GetForegroundWindow()');
const GetWindowRect = user32.func('bool GetWindowRect(void *hWnd, _Out_ RECT *rect)');
const GetClassNameW = user32.func('int GetClassNameW(void *hWnd, _Out_ uint16 *buf, int max)');
const MonitorFromWindow = user32.func('void *MonitorFromWindow(void *hWnd, uint32 flags)');
const GetMonitorInfoW = user32.func('bool GetMonitorInfoW(void *hMon, _Inout_ MONITORINFO *mi)');
const IsZoomed = user32.func('bool IsZoomed(void *hWnd)');

/** 桌面/任务栏等 Shell 窗口不算全屏应用 */
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
const MONITOR_DEFAULTTONEAREST = 2;
const RECT_TOLERANCE = 8;
const POLL_MS = 1500;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface MonitorInfo {
  cbSize: number;
  rcMonitor: Rect;
  rcWork: Rect;
  dwFlags: number;
}

const EMPTY_RECT: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

function selfAddress(win: BrowserWindow): bigint | null {
  try {
    const buf = win.getNativeWindowHandle();
    return buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
  } catch {
    return null;
  }
}

/** 前台窗口是否为全屏应用（排除自身/桌面 Shell/最大化普通窗口） */
function isForegroundFullscreen(win: BrowserWindow): boolean {
  try {
    const hwnd = GetForegroundWindow();
    if (!hwnd) return false;

    const self = selfAddress(win);
    if (self !== null && BigInt(koffi.address(hwnd)) === self) return false;
    if (IsZoomed(hwnd)) return false;

    const clsBuf = new Uint16Array(256);
    const n = GetClassNameW(hwnd, clsBuf, 256);
    if (n > 0) {
      const cls = Buffer.from(clsBuf.buffer, 0, n * 2).toString('ucs2');
      if (SHELL_CLASSES.has(cls)) return false;
    }

    const rect: Rect = { ...EMPTY_RECT };
    if (!GetWindowRect(hwnd, rect)) return false;

    const monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    const info: MonitorInfo = { cbSize: 40, rcMonitor: EMPTY_RECT, rcWork: EMPTY_RECT, dwFlags: 0 };
    if (!GetMonitorInfoW(monitor, info)) return false;

    const m = info.rcMonitor;
    return (
      rect.left <= m.left + RECT_TOLERANCE &&
      rect.top <= m.top + RECT_TOLERANCE &&
      rect.right >= m.right - RECT_TOLERANCE &&
      rect.bottom >= m.bottom - RECT_TOLERANCE
    );
  } catch (err) {
    // FFI 不可用（非 Windows 环境）时降级：不误暂停
    if (!warned) {
      warned = true;
      console.warn('[pause] 全屏检测不可用，已降级为锁屏暂停:', err);
    }
    return false;
  }
}

let warned = false;

/**
 * 启动监控：全屏应用/锁屏 → win.hide() + 通知渲染暂停；恢复 → show + 恢复。
 * @param getWin 主窗口访问器（可能为 null/已销毁）
 */
export function startFullscreenMonitor(getWin: () => BrowserWindow | null): void {
  let paused = false;
  let lockPaused = false;

  function apply(next: boolean, reason: string): void {
    if (next === paused) return;
    paused = next;
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    if (next) win.hide();
    else win.show();
    win.webContents.send('system:pauseChanged', next, reason);
  }

  powerMonitor.on('lock-screen', () => {
    lockPaused = true;
    apply(true, 'lock');
  });
  powerMonitor.on('suspend', () => {
    lockPaused = true;
    apply(true, 'lock');
  });
  powerMonitor.on('unlock-screen', () => {
    lockPaused = false;
    apply(false, 'lock');
  });
  powerMonitor.on('resume', () => {
    lockPaused = false;
    apply(false, 'lock');
  });

  setInterval(() => {
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    if (lockPaused) return; // 锁屏优先，恢复由 powerMonitor 处理
    const fullscreen = isForegroundFullscreen(win);
    apply(fullscreen, fullscreen ? 'fullscreen' : '');
  }, POLL_MS).unref();
}
