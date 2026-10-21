import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { ShellViewSnapshot } from '../native/win32-shell-view';
import type { ShellRects } from '../native/win32-shell-rects';

export interface ShellLayoutSnapshot { view: ShellViewSnapshot; rects: ShellRects }
/** Bounded off-main-thread query. A failure must leave Explorer usable. */
export function queryShellLayout(): Promise<ShellLayoutSnapshot> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'shell-layout-worker.js'));
    let settled = false;
    const finish = (error?: Error, result?: ShellLayoutSnapshot): void => {
      if (settled) return; settled = true; clearTimeout(timer);
      // A stuck native call may outlive terminate; it never blocks desktop/UI.
      void worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error('Shell layout query exceeded 5 seconds')), 5000);
    worker.once('error', error => finish(error));
    worker.once('exit', () => { if (!settled) finish(new Error('Shell layout worker exited without a result')); });
    worker.once('message', (message: ShellLayoutSnapshot & { ok: boolean; error?: string }) => {
      if (!message.ok) finish(new Error(message.error || 'Shell layout unavailable'));
      else finish(undefined, { view: message.view, rects: message.rects });
    });
  });
}
