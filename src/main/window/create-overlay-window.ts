/**
 * 桌面壁纸层覆盖窗（main 进程）
 * 架构 §5.1：透明无边框；不再 alwaysOnTop —— 启动就绪后由 Win32 SetParent 嵌入 WorkerW，
 * 位于系统壁纸之上、所有常规应用窗口之下。穿透控制经 IPC 仅跳变调用（契约纪律 1）。
 */
import { BrowserWindow, screen } from 'electron';
import type { WebContents } from 'electron';
import * as path from 'node:path';
import { isDesktopAttached, repositionOverlay, shutdownDesktop } from '../native/win32-desktop';

interface OverlayStartup {
  painted: boolean;
  failed: boolean;
  revealed: boolean;
  firstFrame: Promise<boolean>;
  resolvePaint: (ok: boolean) => void;
}
const startups = new WeakMap<BrowserWindow, OverlayStartup>();

/** Chromium may paint the empty document before the game finishes assembling. */
export function waitForOverlayFirstFrame(win: BrowserWindow): Promise<boolean> {
  const startup = startups.get(win);
  return !startup || startup.failed || win.isDestroyed() ? Promise.resolve(false) : startup.firstFrame;
}

/** Called only after the renderer/world and native desktop takeover are ready. */
export function revealDesktopOverlay(win: BrowserWindow): boolean {
  const startup = startups.get(win);
  if (!startup?.painted || startup.failed || win.isDestroyed()) return false;
  if (process.env.CD_NO_ATTACH !== '1' && !isDesktopAttached()) return false;
  win.showInactive();
  startup.revealed = true;
  console.info('[desktop] 首帧和桌面接管均已就绪，显示替身窗口');
  return true;
}

/** A second-instance launch must never expose an unfinished top-level window. */
export function isOverlayReady(win: BrowserWindow): boolean {
  const startup = startups.get(win);
  return Boolean(startup?.revealed && !startup.failed && !win.isDestroyed()
    && (process.env.CD_NO_ATTACH === '1' || isDesktopAttached()));
}

/** 工作区 bounds（主屏，不含任务栏；桌面图标网格与舞台同尺寸） */
export function getWorkArea(): { x: number; y: number; width: number; height: number } {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}

export function createOverlayWindow(preloadPath: string): BrowserWindow {
  // QA 模式（CD_QA=1）：不透明普通窗口，供自动化截屏与点击走查；不挂 WorkerW/不隐藏图标
  const qa = process.env.CD_QA === '1';
  const area = getWorkArea();

  if (qa) {
    const qaWin = new BrowserWindow({
      width: 1440,
      height: 900,
      frame: true,
      resizable: true,
      backgroundColor: '#10130F',
      title: '回南天 Cyber Damp (QA)',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    qaWin.center();
    qaWin.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'), { query: { qa: '1' } });
    return qaWin;
  }

  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    // 不设置 alwaysOnTop：窗口稍后会被 SetParent 到 WorkerW 壁纸层。
    backgroundColor: '#00000000',
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      // 桌面挂件常态失焦：禁止 Chromium 后台降帧（雨滴/蘑菇动画需持续 60fps）
      backgroundThrottling: false,
    },
  });

  let resolvePaint!: (ok: boolean) => void;
  const startup: OverlayStartup = {
    painted: false, failed: false, revealed: false,
    firstFrame: new Promise((resolve) => { resolvePaint = resolve; }),
    resolvePaint: (ok) => resolvePaint(ok),
  };
  startups.set(win, startup);
  const abortStartup = (reason: string): void => {
    startup.failed = true;
    startup.revealed = false;
    startup.resolvePaint(false);
    console.error('[desktop] 渲染初始化失败，保留原生桌面:', reason);
    if (!win.isDestroyed()) win.hide();
    shutdownDesktop();
  };

  win.setSkipTaskbar(true);
  // Native desktop remains usable while assets/IPC are still initializing.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setBounds(area);
  // Chromium's forwarded WM_MOUSEMOVE is unreliable for reparented layered
  // child windows. Feed a native DIP cursor probe into hover hit testing so a
  // pass-through window can become clickable again without a bootstrap click.
  const cursorTimer = setInterval(() => {
    if (win.isDestroyed() || win.webContents.isLoading()) return;
    const point = screen.getCursorScreenPoint();
    const work = getWorkArea();
    win.webContents.send('window:cursor', { x: point.x - work.x, y: point.y - work.y });
  }, 33);
  cursorTimer.unref();
  win.on('closed', () => { clearInterval(cursorTimer); startup.failed = true; startup.resolvePaint(false); });
  win.once('ready-to-show', () => {
    // This is only the first Chromium paint, not the world's ready signal.
    startup.painted = true;
    startup.resolvePaint(!startup.failed);
  });
  win.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) abortStartup(`load ${code}: ${description}`);
  });
  win.webContents.on('preload-error', (_event, _preloadPath, error) => abortStartup(`preload: ${error.message}`));

  // 安全加固（AC-25 相邻）：禁止渲染层打开新窗口/导航到外部页面
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault();
  });

  // 渲染层日志转发（诊断/QA：控制台错误可见于进程 stdout）
  win.webContents.on('console-message', (event) => {
    const msg = event.message;
    if (msg) console.log('[renderer]', msg);
    if (event.level === 'error' && !startup.revealed) abortStartup(msg);
  });

  // dev 模式加载 Vite dev server；生产加载构建产物
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  // 产物布局：dist/renderer/index.html（本模块编译在 dist/main/window/，需退两级到 dist）
  const loading = devUrl ? win.loadURL(devUrl) :
    win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'), {
      query: process.env.CD_UAT === '1' ? { inspect: '1' } : {},
    });
  void loading.catch((error: Error & { code?: string }) => {
    if (!win.isDestroyed() && error.code !== 'ERR_ABORTED') abortStartup(`navigation: ${error.message}`);
  });
  return win;
}

/** 多显示器/DPI 变化 → 重算 bounds 并通知渲染层（契约 system:displayChanged） */
export function startDisplayTracker(
  getWin: () => BrowserWindow | null,
  getWc: () => WebContents | null,
): void {
  screen.on('display-metrics-changed', () => {
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    const area = getWorkArea();
    win.setBounds(area);
    if (isDesktopAttached()) repositionOverlay(win);
    getWc()?.send('system:displayChanged', { width: area.width, height: area.height });
  });
}
