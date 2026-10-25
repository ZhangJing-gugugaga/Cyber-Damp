/**
 * 天气胶囊小窗（R2：有界小窗，绝非全屏幕布）
 *
 * 360×56 DIP，主屏工作区顶部居中，距顶 24 DIP；可拖动并记忆位置，
 * 重置回默认；DPI/显示器变化后夹回可见工作区。
 * 层级策略（阶段1原型结论，详见 docs/PRODUCT.md）：
 *  - 采用"普通非置顶顶层窗口"：不压普通应用（后激活的应用盖住它）、
 *    不抢焦点（showInactive）、透明留白穿透、点击区域仅限胶囊本体；
 *  - 不采用 WorkerW 嵌入：该层位于图标输入层之下，截获点击需要输入钩取/转发，
 *    违反 H2；实测证据见阶段1记录。
 *  - Win+D 会最小化本窗（与"桌面及 Win+D 可见"存在已知冲突，
 *    用户已接受此降级，托盘/程序入口可唤回）。
 */
import { BrowserWindow, app, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyGlass, clearGlass, type GlassMode } from '../native/win32-glass';
import { foregroundCoversRect, startForegroundWatch } from '../native/win32-foreground';
import { installCapsuleHitTest } from '../native/win32-capsule-hittest';

export const CAPSULE_WIDTH = 360;
export const CAPSULE_HEIGHT = 56;
const TOP_MARGIN = 24;

interface CapsuleState {
  remembered?: { x: number; y: number };
}

const defaultBounds = () => {
  const work = screen.getPrimaryDisplay().workArea;
  return {
    x: work.x + Math.round((work.width - CAPSULE_WIDTH) / 2),
    y: work.y + TOP_MARGIN,
  };
};

function clampToWorkArea(bounds: { x: number; y: number }): { x: number; y: number } {
  const work = screen.getPrimaryDisplay().workArea;
  const x = Math.min(Math.max(bounds.x, work.x), work.x + work.width - CAPSULE_WIDTH);
  const y = Math.min(Math.max(bounds.y, work.y), work.y + work.height - CAPSULE_HEIGHT);
  return { x, y };
}

function stateDir(): string {
  return process.env.CD_CAPSULE_STATE_DIR || app.getPath('userData');
}

function loadState(): CapsuleState {
  try {
    const file = path.join(stateDir(), 'capsule-state.json');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw) as CapsuleState;
    if (data?.remembered && Number.isFinite(data.remembered.x) && Number.isFinite(data.remembered.y)) return data;
  } catch { /* 无记忆即默认位 */ }
  return {};
}

function persistState(state: CapsuleState): void {
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'capsule-state.json'), JSON.stringify(state), 'utf8');
}

export interface CapsuleHandle {
  win: BrowserWindow;
  glassMode: GlassMode;
  unwatch: (() => void) | null;
  setVisible(visible: boolean): void;
  destroy(): void;
}

/** Windows 非客户区消息：drag 区域的按下/抬起（HTCAPTION） */
const WM_NCLBUTTONDOWN = 0x00a1;
const WM_NCLBUTTONUP = 0x00a2;

/**
 * 创建胶囊窗。HTML 由调用方提供（生产用胶囊页面；原型可传 data URL）。
 * boundsOffset 供多实例原型偏移，生产忽略。
 * onCapsuleClick：按下→抬起期间窗口未移动（系统拖动阈值内的纯点击）时回调。
 */
export function createCapsuleWindow(
  preloadPath: string,
  htmlDataUrl: string,
  hooks: { onCapsuleClick?: () => void } = {},
): CapsuleHandle {
  const state = loadState();
  const start = state.remembered ? clampToWorkArea(state.remembered) : defaultBounds();
  const win = new BrowserWindow({
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    x: start.x,
    y: start.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: false, // R2：不压普通应用；代价是 Win+D 会最小化（已接受）
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  // 透明留白穿透 + 内容命中（R2）：不再用 setIgnoreMouseEvents(forward)——
  // 实测 focusable:false 透明窗上转发不投递事件（见 win32-capsule-hittest）。
  // WM_NCHITTEST 子类化：留白 HTTRANSPARENT 穿透，本体 HTCAPTION 供拖动/点击。
  const uninstallHitTest = installCapsuleHitTest(win, 4);
  const glassMode = applyGlass(hwndNumber(win));

  let unwatch: (() => void) | null = null;
  let hiddenByCoverage = false;
  const refreshCoverage = () => {
    if (win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    const covered = foregroundCoversRect({ x, y, width: CAPSULE_WIDTH, height: CAPSULE_HEIGHT });
    if (covered && !hiddenByCoverage && win.isVisible()) {
      hiddenByCoverage = true;
      win.hide();
    } else if (!covered && hiddenByCoverage) {
      hiddenByCoverage = false;
      win.showInactive();
    }
  };
  unwatch = startForegroundWatch(refreshCoverage);

  win.once('ready-to-show', () => win.showInactive());
  // R2 点击/拖动按系统拖动阈值区分：drag 区域的鼠标事件全部以非客户区
  // 消息到达主进程（DOM 收不到 click）。按下→抬起之间窗口位置变过 = 拖动，
  // 不误开护理台；未移动 = 纯点击，打开护理台。
  let pressing = false;
  let pressMoved = false;
  const onMoveDuringPress = () => { if (pressing) pressMoved = true; };
  win.on('move', onMoveDuringPress);
  win.hookWindowMessage(WM_NCLBUTTONDOWN, () => { pressing = true; pressMoved = false; });
  win.hookWindowMessage(WM_NCLBUTTONUP, () => {
    if (!pressing) return;
    pressing = false;
    if (!pressMoved) hooks.onCapsuleClick?.();
  });
  // data: 供原型探针；生产传 care/capsule 页面文件路径
  if (htmlDataUrl.startsWith('data:')) void win.loadURL(htmlDataUrl);
  else void win.loadFile(htmlDataUrl);

  // 记忆拖动位置；显示器变化后夹回
  const remember = () => {
    if (win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    const state2: CapsuleState = { remembered: { x, y } };
    persistState(state2);
  };
  win.on('moved', remember);
  const onDisplayChanged = () => {
    if (win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    const clamped = clampToWorkArea({ x, y });
    if (clamped.x !== x || clamped.y !== y) win.setPosition(clamped.x, clamped.y);
  };
  screen.on('display-metrics-changed', onDisplayChanged);

  return {
    win,
    glassMode,
    unwatch,
    setVisible(visible: boolean) {
      if (win.isDestroyed()) return;
      if (visible && !win.isVisible()) win.showInactive();
      if (!visible && win.isVisible()) win.hide();
    },
    destroy() {
      unwatch?.();
      screen.off('display-metrics-changed', onDisplayChanged);
      if (!win.isDestroyed()) {
        uninstallHitTest();
        win.unhookWindowMessage(WM_NCLBUTTONDOWN);
        win.unhookWindowMessage(WM_NCLBUTTONUP);
        win.off('move', onMoveDuringPress);
        clearGlass(hwndNumber(win));
        win.destroy();
      }
    },
  };
}

function hwndNumber(win: BrowserWindow): number {
  const buf = win.getNativeWindowHandle();
  return process.platform === 'win32' ? buf.readInt32LE(0) : 0;
}
