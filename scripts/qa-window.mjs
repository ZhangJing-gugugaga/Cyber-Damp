/**
 * QA 窗口探针（开发/验收用）：按标题找到主窗口，输出可见性/扩展样式（AC-26/28 验证）
 * 用法：node scripts/qa-window.mjs
 */
import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const FindWindowW = user32.func('void *FindWindowW(str16 className, str16 windowName)');
const IsWindowVisible = user32.func('bool IsWindowVisible(void *hWnd)');
const GetWindowLongW = user32.func('long GetWindowLongW(void *hWnd, int nIndex)');

const GWL_EXSTYLE = -20;
const WS_EX_TRANSPARENT = 0x20;
const WS_EX_TOPMOST = 0x8;

const hwnd = FindWindowW(null, '回南天 Cyber Damp');
if (!hwnd) {
  console.log(JSON.stringify({ found: false }));
  process.exit(0);
}
const ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
console.log(
  JSON.stringify({
    found: true,
    hwnd: String(koffi.address(hwnd)),
    visible: !!IsWindowVisible(hwnd),
    exStyle: ex >>> 0,
    clickThrough: (ex & WS_EX_TRANSPARENT) !== 0,
    topmost: (ex & WS_EX_TOPMOST) !== 0,
  }),
);
