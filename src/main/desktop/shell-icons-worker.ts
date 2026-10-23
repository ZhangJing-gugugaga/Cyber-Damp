import { parentPort, workerData } from 'node:worker_threads';
import koffi from 'koffi';
import { extractShellIconPixels } from '../native/win32-icon-pixels';
import type { ShellIconRequest } from './shell-icons';

const ole = koffi.load('ole32.dll');
const initialize = ole.func('long CoInitializeEx(void *reserved, uint32 flags)');
const uninitialize = ole.func('void CoUninitialize()');
const initialized = initialize(null, 2);
try {
  if (initialized < 0) throw new Error('Shell icon COM initialization failed');
  const icons = (workerData as ShellIconRequest[]).map(item =>
    extractShellIconPixels(item.path, true, item.resourceIndex)
      ?? (item.fallbackPath ? extractShellIconPixels(item.fallbackPath) : null));
  parentPort?.postMessage({ ok: true, icons });
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
} finally {
  if (initialized >= 0) uninitialize();
}
