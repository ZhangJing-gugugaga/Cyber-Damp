import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { ShellIconPixels } from '../native/win32-icon-pixels';

export interface ShellIconRequest { path: string; resourceIndex?: number; fallbackPath?: string }
/** Reuses the layout worker lifecycle; a slow Shell provider never blocks cancel/UI. */
export function queryShellIcons(requests: ShellIconRequest[]): Promise<(ShellIconPixels | null)[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'shell-icons-worker.js'), { workerData: requests });
    let settled = false;
    const finish = (error?: Error, icons?: (ShellIconPixels | null)[]): void => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error); else resolve(icons!);
    };
    const timer = setTimeout(() => finish(new Error('Shell icon query exceeded 30 seconds')), 30000);
    worker.once('error', error => finish(error));
    worker.once('exit', () => { if (!settled) finish(new Error('Shell icon worker exited without a result')); });
    worker.once('message', (message: { ok: boolean; icons?: (ShellIconPixels | null)[]; error?: string }) => {
      if (!message.ok || !Array.isArray(message.icons) || message.icons.length !== requests.length) {
        finish(new Error(message.error || 'Shell icons unavailable'));
      } else finish(undefined, message.icons);
    });
  });
}
