/**
 * window.damp.wallpaper 组（R9 v0.2；gameplay-v2 契约 v1.15）。
 *
 * 当前阶段：Win32 壁纸读写与原值恢复尚未接入。通道已注册以便护理台 v2 界面挂载，
 * 但只返回真实状态——status 为 off，开启/擦雾一律 ok:false 并说明原因，
 * 不伪装成已开启、不触碰系统壁纸（renderer 规则：未接入的功能不伪装可用）。
 * 接入时：开启前登记原值到 wallpaper-restore.json（不进游戏存档），擦雾只在松手/确认时合成并限频设置。
 */
import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { loadSave } from '../save/save-store';
import { fogLevelFor } from '../../shared/wallpaper/effects';
import type { WallpaperView } from '../../shared/types/gameplay';

export const WALLPAPER_NOT_WIRED = '壁纸效果的 Windows 接入尚未完成，当前不会修改系统壁纸';

function currentView(): WallpaperView {
  const native = loadSave()?.native;
  const snapshot = native?.lastSnapshot ?? null;
  return {
    enabled: false,
    status: 'off',
    message: WALLPAPER_NOT_WIRED,
    fogLevel: snapshot
      ? fogLevelFor({ humidityPct: snapshot.humidityPct, weatherCode: snapshot.weatherCode, alertActive: native?.alert?.active === true })
      : 0,
    cornerMoldStage: 0,
    wipeProgress: 0,
  };
}

export function registerWallpaperHandlers(getWc: () => WebContents | null): void {
  ipcMain.handle('wallpaper:status', (event) => {
    if (event.sender !== getWc()) return { ...currentView(), status: 'error', message: 'invalid-request' };
    return currentView();
  });
  ipcMain.handle('wallpaper:setEnabled', (event, payload: unknown) => {
    if (event.sender !== getWc() || typeof payload !== 'object' || payload === null
      || typeof (payload as { on?: unknown }).on !== 'boolean') {
      return { ok: false, message: 'invalid-request' };
    }
    const on = (payload as { on: boolean }).on;
    // 关闭是当前真实状态（从未开启），如实返回成功；开启尚不可用
    if (!on) return { ok: true, view: currentView() };
    return { ok: false, message: WALLPAPER_NOT_WIRED, view: currentView() };
  });
  ipcMain.handle('wallpaper:wipe', (event, payload: unknown) => {
    if (event.sender !== getWc() || typeof payload !== 'object' || payload === null) {
      return { ok: false, message: 'invalid-request' };
    }
    return { ok: false, message: WALLPAPER_NOT_WIRED, view: currentView() };
  });
}
