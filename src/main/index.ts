/** 主进程装配：单实例、原生图标、胶囊、护理台与退出恢复。 */
import { app } from 'electron';
import * as path from 'node:path';
import { registerHandlers } from './ipc/register-handlers';
import { trackEvent } from './telemetry/event-log';
import { installManagement, openManagement, setNativeTrayActions, managementWebContents } from './window/management-window';
import { createCapsuleWindow } from './window/capsule-window';
import { reconcilePendingEntries, restoreAllIconReferences } from './desktop/icon-mutate';
import { registerNativeHandlers, bootstrapNativeMode, scanForNative, latestCycleCandidates } from './ipc/native-handlers';
import { runNativeEventCycle } from './desktop/native-event-scheduler';
import { installResidentWatch } from './desktop/resident-watch';

const startedAt = Date.now();

// Native UAT can isolate game saves while still using the real Explorer
// desktop and production window/input path. Ordinary startup is unchanged.
if (process.env.CD_UAT === '1' && process.env.CD_UAT_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.CD_UAT_DATA_DIR));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openManagement();
  });

  void app.whenReady().then(() => {
    trackEvent('session_start');
    // R4/R1：先核对上次未结算的图标写入（补结算/丢弃），再调度新事件
    try {
      const reconciliation = reconcilePendingEntries();
      if (reconciliation.settled || reconciliation.dropped) {
        console.info('[icon-restore] 启动核对:', JSON.stringify(reconciliation));
      }
    } catch (error) {
      console.warn('[icon-restore] 启动核对失败（保留登记）:', error);
    }
    const preload = path.join(__dirname, '..', 'preload', 'index.js');

    installManagement(preload);

    // 产品仅保留原生图标、天气胶囊和护理窗口。
    registerHandlers();
    registerNativeHandlers(() => managementWebContents());
    const capsule = createCapsuleWindow(
      preload,
      path.join(__dirname, '..', 'renderer', 'capsule.html'),
      { onCapsuleClick: () => openManagement() },
    );
    setNativeTrayActions({ toggleCapsule: (visible) => capsule.setVisible(visible) });
    void bootstrapNativeMode().catch((error) => console.error('[native] 启动引导失败:', error));
    // 常驻（R4.2）：在线跨日与系统唤醒触发同一协调器；当日去重由事件
    // 记录状态机保证，与启动/改城/继续游戏共用 runNativeEventCycle。
    installResidentWatch({
      runCheck: async (reason) => {
        await scanForNative();
        const cycle = await runNativeEventCycle(latestCycleCandidates());
        console.info(`[native] ${reason}事件循环:`, JSON.stringify(cycle));
      },
    });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    trackEvent('session_duration', { sec: Math.round((Date.now() - startedAt) / 1000) });
    // R8 完全退出：先恢复本程序修改的图标引用（进度保留在存档，重启后回显）
    try {
      const reports = restoreAllIconReferences();
      if (reports.length) console.info('[icon-restore] 退出恢复:', JSON.stringify(reports));
    } catch (error) {
      console.warn('[icon-restore] 退出恢复失败（登记保留）:', error);
    }
  });
}
