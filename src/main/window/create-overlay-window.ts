/**
 * 透明置顶穿透覆盖窗（main 进程）
 * 架构 §5.1：Electron 44.8.0 API 形态；穿透控制经 IPC 仅跳变调用（契约纪律 1）
 */
import { BrowserWindow, screen } from 'electron';
import type { WebContents } from 'electron';
import * as path from 'node:path';

/** 工作区 bounds（主屏，不含任务栏） */
export function getWorkArea(): { x: number; y: number; width: number; height: number } {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}

export function createOverlayWindow(preloadPath: string): BrowserWindow {
  // QA 模式（CD_QA=1）：不透明普通窗口，供 CursorTouch/Windows-MCP 截屏与点击走查
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
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      // 桌面挂件常态失焦：禁止 Chromium 后台降帧（雨滴/蘑菇动画需持续 60fps）
      backgroundThrottling: false,
    },
  });

  // 压过任务栏（screen-saver 层级，专注模式由渲染层降透明度而非抢焦点）
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setBounds(area);

  // 安全加固（AC-25 相邻）：禁止渲染层打开新窗口/导航到外部页面
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault();
  });

  // 渲染层日志转发（诊断/QA：控制台错误可见于进程 stdout）
  win.webContents.on('console-message', (event) => {
    const msg = (event as unknown as { message?: string }).message;
    if (msg) console.log('[renderer]', msg);
  });

  // dev 模式加载 Vite dev server；生产加载构建产物
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    // 产物布局：dist/renderer/index.html（本模块编译在 dist/main/window/，需退两级到 dist）
    win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  }
  return win;
}

/** 多显示器/DPI 变化 → 重算 bounds 并通知渲染层（契约 system:displayChanged） */
export function startDisplayTracker(
  getWin: () => BrowserWindow | null,
  getWc: () => WebContents | null,
): void {
  screen.on('display-metrics-changed', () => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      const area = getWorkArea();
      win.setBounds(area);
      getWc()?.send('system:displayChanged', { width: area.width, height: area.height });
    }
  });
}
