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
import { ipcMain } from 'electron';

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

/** 拖动位移的合法范围（单次相对按下点的 DIP 位移；超出视为非法载荷） */
const MAX_DRAG_DELTA = 20000;

function isFiniteDelta(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_DRAG_DELTA;
}

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
  // 0.1.28：胶囊不再有透明留白，窗口即胶囊本体，鼠标事件走普通客户区 → DOM。
  // 原 WM_NCHITTEST 子类化 + -webkit-app-region:drag 方案只做过进程内消息级验证，
  // 0.1.27 实机"完全不可交互"；拖动区域在 Electron 中还会吞掉 click。
  // 现在：渲染层 pointer 事件区分点击/拖动，拖动经 IPC 由主进程 setPosition。
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

  // 点击/拖动（R2）：渲染层判定（按下后移动超过阈值 = 拖动），主进程只执行。
  // 发送方必须是本胶囊窗；载荷只接受有限位移，不接受绝对坐标。
  let dragOrigin: { x: number; y: number } | null = null;
  const fromCapsule = (sender: Electron.WebContents) => !win.isDestroyed() && sender === win.webContents;
  const onDragStart = (event: Electron.IpcMainEvent) => {
    if (!fromCapsule(event.sender)) return;
    const [x, y] = win.getPosition();
    dragOrigin = { x, y };
  };
  const onDragMove = (event: Electron.IpcMainEvent, payload: unknown) => {
    if (!fromCapsule(event.sender) || !dragOrigin || typeof payload !== 'object' || payload === null) return;
    const { dx, dy } = payload as { dx?: unknown; dy?: unknown };
    if (!isFiniteDelta(dx) || !isFiniteDelta(dy)) return;
    const next = clampToWorkArea({ x: Math.round(dragOrigin.x + dx), y: Math.round(dragOrigin.y + dy) });
    win.setPosition(next.x, next.y);
  };
  const onDragEnd = (event: Electron.IpcMainEvent) => {
    if (!fromCapsule(event.sender) || !dragOrigin) return;
    dragOrigin = null;
    remember();
  };
  const onClick = (event: Electron.IpcMainEvent) => {
    if (!fromCapsule(event.sender)) return;
    hooks.onCapsuleClick?.();
  };
  ipcMain.on('capsule:dragStart', onDragStart);
  ipcMain.on('capsule:dragMove', onDragMove);
  ipcMain.on('capsule:dragEnd', onDragEnd);
  ipcMain.on('capsule:click', onClick);
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
      ipcMain.off('capsule:dragStart', onDragStart);
      ipcMain.off('capsule:dragMove', onDragMove);
      ipcMain.off('capsule:dragEnd', onDragEnd);
      ipcMain.off('capsule:click', onClick);
      if (!win.isDestroyed()) {
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
