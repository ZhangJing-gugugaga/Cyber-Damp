/**
 * CPU 占用监控（main 进程）
 * 契约：system:cpu 每 2s 推送 0..1 占用率（模块一「电脑出汗」数据源）
 * 纪律 4：渲染层 hidden 时 main 停止发送（以 webContents 可见性近似）
 */
import type { WebContents } from 'electron';
import * as os from 'node:os';

interface CpuSample {
  idle: number;
  total: number;
}

function sample(): CpuSample {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
  }
  return { idle, total };
}

export function startCpuMonitor(getWc: () => WebContents | null): void {
  let prev = sample();
  setInterval(() => {
    const wc = getWc();
    if (!wc || wc.isDestroyed()) return;
    // 渲染层失联/隐藏时停发（契约纪律 4）
    if (wc.isOffscreen?.() || wc.isCrashed?.()) return;

    const cur = sample();
    const totalDiff = cur.total - prev.total;
    const idleDiff = cur.idle - prev.idle;
    prev = cur;
    if (totalDiff <= 0) return;

    const usage = 1 - idleDiff / totalDiff;
    wc.send('system:cpu', Math.min(1, Math.max(0, usage)));
  }, 2000);
}
