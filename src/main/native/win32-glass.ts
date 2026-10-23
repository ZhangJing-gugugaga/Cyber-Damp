/**
 * 玻璃材质（koffi，最小补充；R2）
 *
 * 优先级：本机 Win11 22H2+ 用 DWM 背板（DwmSetWindowAttribute，未实测的机器自动跳过）；
 * Windows 10 用 SetWindowCompositionAttribute 的 Acrylic/Blur；
 * 都不可用时保持 Electron 半透明（CSS 背景），绝不伪称玻璃。
 *
 * 技术冲突优先级（R2）：不拦桌面点击、不压普通应用、不抢焦点 > Win+D 可见 > 原生 Acrylic。
 */
import koffi from 'koffi';

export type GlassMode = 'dwm-backdrop' | 'acrylic' | 'blur' | 'transparent';

interface GlassApi {
  DwmSetWindowAttribute(hwnd: unknown, attr: number, value: Buffer, size: number): number;
  SetWindowCompositionAttribute(hwnd: unknown, data: unknown): boolean;
}

let api: GlassApi | null = null;
let apiFailed = false;

const DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
const DWMWA_SYSTEMBACKDROP_TYPE = 38;
const DWMSBT_TRANSIENTWINDOW = 3; // Acrylic
const WCA_ACCENT_POLICY = 19;
const ACCENT_DISABLED = 0;
const ACCENT_ENABLE_BLURBEHIND = 3;
const ACCENT_ENABLE_ACRYLICBLURBEHIND = 4;
const HOSTWIND_NONE = 0x2; // ACCENT_FLAG_DRAW_ALL：不由系统绘制宿主背景

function glass(): GlassApi | null {
  if (api) return api;
  if (apiFailed || process.platform !== 'win32') return null;
  try {
    const dwm = koffi.load('dwmapi.dll');
    const user32 = koffi.load('user32.dll');
    koffi.struct('ACCENT_POLICY', {
      AccentState: 'uint32',
      AccentFlags: 'uint32',
      GradientColor: 'uint32',
      AnimationId: 'uint32',
    });
    koffi.struct('WINDOWCOMPOSITIONATTRIBDATA', {
      Attrib: 'uint32',
      pvData: 'void *',
      cbData: 'size_t',
    });
    api = {
      DwmSetWindowAttribute: dwm.func('int32 DwmSetWindowAttribute(void *hwnd, uint32 attr, void *value, uint32 size)'),
      SetWindowCompositionAttribute: user32.func('bool SetWindowCompositionAttribute(void *hwnd, _Inout_ WINDOWCOMPOSITIONATTRIBDATA *data)'),
    };
  } catch (err) {
    apiFailed = true;
    api = null;
    console.warn('[glass] DWM FFI 不可用，降级为半透明:', err);
  }
  return api;
}

function tryDwmBackdrop(hwnd: unknown): boolean {
  const native = glass();
  if (!native) return false;
  try {
    const dark = Buffer.alloc(4);
    dark.writeUInt32LE(1, 0);
    native.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, dark, 4);
    const backdrop = Buffer.alloc(4);
    backdrop.writeUInt32LE(DWMSBT_TRANSIENTWINDOW, 0);
    return native.DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, backdrop, 4) === 0;
  } catch {
    return false;
  }
}

function tryAccent(hwnd: unknown, accentState: number, gradientColor: number): boolean {
  const native = glass();
  if (!native) return false;
  try {
    const policy = koffi.alloc('ACCENT_POLICY', 1);
    koffi.encode(policy, 'ACCENT_POLICY', {
      AccentState: accentState,
      AccentFlags: HOSTWIND_NONE,
      GradientColor: gradientColor >>> 0,
      AnimationId: 0,
    });
    const data = koffi.alloc('WINDOWCOMPOSITIONATTRIBDATA', 1);
    koffi.encode(data, 'WINDOWCOMPOSITIONATTRIBDATA', {
      Attrib: WCA_ACCENT_POLICY,
      pvData: koffi.address(policy),
      cbData: koffi.sizeof('ACCENT_POLICY'),
    });
    return native.SetWindowCompositionAttribute(hwnd, data);
  } catch {
    return false;
  }
}

/**
 * 对窗口应用玻璃材质，返回实际生效的模式（诚实报告，不把降级写成玻璃）。
 * tint 为 ABGR（alpha 越小越透明）。
 */
export function applyGlass(hwnd: number, tint = 0x66141414): GlassMode {
  if (process.platform !== 'win32') return 'transparent';
  // Win11 22H2+：DWM 系统背板（顶层窗口才生效）
  if (tryDwmBackdrop(Number(hwnd))) return 'dwm-backdrop';
  // Windows 10：Acrylic（拖动时可能略涩，属已知系统行为）
  if (tryAccent(Number(hwnd), ACCENT_ENABLE_ACRYLICBLURBEHIND, tint)) return 'acrylic';
  // Blur（性能更稳的旧版模糊）
  if (tryAccent(Number(hwnd), ACCENT_ENABLE_BLURBEHIND, 0x00000000)) return 'blur';
  tryAccent(Number(hwnd), ACCENT_DISABLED, 0);
  return 'transparent';
}

/** 移除材质（隐藏/退出时恢复普通透明窗口）。 */
export function clearGlass(hwnd: number): void {
  if (process.platform !== 'win32') return;
  tryAccent(Number(hwnd), ACCENT_DISABLED, 0);
}
