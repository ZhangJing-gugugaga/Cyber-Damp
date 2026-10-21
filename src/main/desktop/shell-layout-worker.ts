import { parentPort } from 'node:worker_threads';
import { readShellView } from '../native/win32-shell-view';
import { readShellRects } from '../native/win32-shell-rects';

try {
  const view = readShellView();
  const rects = readShellRects();
  const after = readShellView();
  if (JSON.stringify(view) !== JSON.stringify(after) || view.items.length !== rects.items.length) {
    throw new Error('Desktop changed during capture; retry');
  }
  parentPort?.postMessage({ ok: true, view, rects });
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
