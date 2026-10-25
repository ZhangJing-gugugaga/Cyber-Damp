/**
 * 胶囊命中测试子类化（R2：透明留白穿透 + 点击/拖动系统阈值区分）
 *
 * 背景（2026-10-25 实测，Electron 44.8.0）：focusable:false 的透明窗上
 * setIgnoreMouseEvents(true,{forward}) 不投递 mousemove——渲染层监听与
 * 主进程 WM_MOUSEMOVE 钩子均为 0 事件，"忽略→悬停翻转"永不可达，胶囊
 * 整体不可交互。改为 Win32 原生接管 WM_NCHITTEST：
 *  - 透明留白（CSS margin 区）→ HTTRANSPARENT：点击/移动落到桌面下层；
 *  - 胶囊本体 → HTCAPTION：系统拖动 + 非客户区消息（点击 vs 拖动由
 *    capsule-window 的 NCLBUTTONDOWN/UP + 移动判定区分）。
 * 圆角缺口等形状细节按内容矩形近似（与原生应用一致的边界语义）。
 */
import koffi from 'koffi';
import { screen } from 'electron';

const user32 = koffi.load('user32.dll');

const GWLP_WNDPROC = -4;
const WM_NCHITTEST = 0x0084;
const HTTRANSPARENT = -1;
const HTCAPTION = 2;

// koffi 3.3.3：回调 proto 用返回类型前置的具名签名，func 参数与
// register 均按 '<名> *' 字符串形式引用（与 win32-foreground 同一模式）
koffi.proto('int64 __stdcall CAPS_WNDPROC(void *hwnd, uint32 msg, uint64 wParam, int64 lParam)');

const SetWindowLongPtrW = user32.func('void *SetWindowLongPtrW(void *hwnd, int32 index, CAPS_WNDPROC *proc)');
const CallWindowProcW = user32.func('int64 CallWindowProcW(void *proc, void *hwnd, uint32 msg, uint64 wParam, int64 lParam)');
const DefWindowProcW = user32.func('int64 DefWindowProcW(void *hwnd, uint32 msg, uint64 wParam, int64 lParam)');

interface ContentRect { left: number; top: number; right: number; bottom: number }

/**
 * 子类化窗口过程接管命中测试。返回卸载函数（销毁前调用：还原原过程并
 * 注销回调，避免 V8 句柄在窗口销毁后仍被调用）。
 */
export function installCapsuleHitTest(win: Electron.BrowserWindow, marginCss = 4): () => void {
  const handle = win.getNativeWindowHandle();
  const hwnd = process.platform === 'win32' ? handle.readInt32LE(0) : 0;
  if (!hwnd) return () => undefined;

  // 内容矩形（DIP）：CSS margin 数值即 DIP 值；命中点经 screenToDipPoint 换算后比较
  // （NCHITTEST 的 lParam 是物理像素，直接与 DIP 边界比较在缩放≠100% 时区域会错位——
  // 125% 实测出现过"本体穿透、留白可拖"的反转）
  let content: ContentRect = { left: 0, top: 0, right: 0, bottom: 0 };
  const refresh = (): void => {
    if (win.isDestroyed()) return;
    const b = win.getBounds(); // DIP
    const m = marginCss;
    content = { left: b.x + m, top: b.y + m, right: b.x + b.width - m, bottom: b.y + b.height - m };
  };
  refresh();
  win.on('move', refresh);
  win.on('resize', refresh);

  let original: unknown;
  const proc = koffi.register((hwndPtr: unknown, msg: number, wParam: bigint | number, lParam: bigint | number) => {
    if (msg === WM_NCHITTEST) {
      const raw = typeof lParam === 'bigint' ? Number(lParam) : lParam;
      const x = raw & 0xffff;
      const y = (raw >> 16) & 0xffff;
      const sx = x >= 0x8000 ? x - 0x10000 : x;
      const sy = y >= 0x8000 ? y - 0x10000 : y;
      const p = screen.screenToDipPoint({ x: sx, y: sy });
      if (p.x >= content.left && p.x <= content.right && p.y >= content.top && p.y <= content.bottom) {
        return HTCAPTION;
      }
      return HTTRANSPARENT;
    }
    if (!original) return DefWindowProcW(hwndPtr, msg, wParam, lParam);
    return CallWindowProcW(original, hwndPtr, msg, wParam, lParam);
  }, 'CAPS_WNDPROC *');

  original = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, proc);

  return () => {
    try { SetWindowLongPtrW(hwnd, GWLP_WNDPROC, original); } catch { /* 窗口已亡 */ }
    koffi.unregister(proc);
  };
}
