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
  const area = getWorkArea();
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
    },
  });

  // 压过任务栏（screen-saver 层级，专注模式由渲染层降透明度而非抢焦点）
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setBounds(area);

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
