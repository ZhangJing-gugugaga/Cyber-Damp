import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import koffi from 'koffi';

const REPARSE_POINT = 0x400;
const INVALID_ATTRIBUTES = 0xffffffff;
const TIMEOUT = Symbol('folder-size-timeout');

export interface FolderSizeOptions {
  /** Total elapsed time, including slow metadata requests; no contents are read. */
  timeoutMs?: number;
  /** Optional shared deadline across the desktop scan. */
  deadlineMs?: number;
  maxEntries?: number;
  maxDepth?: number;
}

export interface FolderSizeResult {
  sizeBytes: number;
  files: number;
  skippedEntries: number;
  complete: boolean;
  limit: 'time' | 'entries' | 'depth' | null;
}

let attributesApi: ReturnType<ReturnType<typeof koffi.load>['func']> | undefined;

/** lstat detects junctions/symlinks; this also excludes other Windows reparse directories. */
async function isReparseDirectory(fullPath: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  attributesApi ??= koffi.load('kernel32.dll').func('uint32 __stdcall GetFileAttributesW(str16 path)');
  return new Promise((resolve, reject) => {
    attributesApi!.async(path.toNamespacedPath(fullPath), (error: unknown, attributes: number) => {
      if (error || attributes === INVALID_ATTRIBUTES) reject(error ?? new Error('Directory attributes unavailable'));
      else resolve((attributes & REPARSE_POINT) !== 0);
    });
  });
}

/**
 * Sum logical file lengths, never document contents or allocated disk blocks.
 * Async metadata calls and incremental directory reads keep the main thread free.
 * Links/reparse directories are excluded; limits or access errors return an honest
 * lower bound rather than failing the whole desktop scan or inventing a weight.
 */
export async function folderSizeBytes(root: string, options: FolderSizeOptions = {}): Promise<FolderSizeResult> {
  const deadline = Math.min(Date.now() + (options.timeoutMs ?? 2000), options.deadlineMs ?? Infinity);
  const maxEntries = Math.max(0, options.maxEntries ?? 50_000);
  const maxDepth = Math.max(0, options.maxDepth ?? 64);
  const result: FolderSizeResult = { sizeBytes: 0, files: 0, skippedEntries: 0, complete: true, limit: null };
  const pending = [{ fullPath: path.resolve(root), depth: 0 }];
  let visited = 0;

  async function bounded<T>(operation: Promise<T>, onLate?: (value: T) => void): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      operation.then((value) => onLate?.(value), () => undefined);
      throw TIMEOUT;
    }
    let timer: ReturnType<typeof setTimeout>;
    let expired = false;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(TIMEOUT); }, remaining);
    });
    operation.then((value) => { if (expired) onLate?.(value); }, () => undefined);
    try { return await Promise.race([operation, timeout]); }
    finally { clearTimeout(timer!); }
  }

  while (pending.length) {
    if (Date.now() >= deadline) { result.complete = false; result.limit = 'time'; break; }
    const current = pending.pop()!;
    if (current.depth > maxDepth) {
      result.complete = false; result.limit = 'depth'; result.skippedEntries++;
      continue;
    }
    try {
      const stat = await bounded(fs.lstat(current.fullPath));
      if (stat.isSymbolicLink()) { result.skippedEntries++; continue; }
      if (!stat.isDirectory()) { result.complete = false; result.skippedEntries++; continue; }
      if (await bounded(isReparseDirectory(current.fullPath))) { result.skippedEntries++; continue; }

      const dir = await bounded(fs.opendir(current.fullPath, { bufferSize: 32 }), (late) => { void late.close().catch(() => undefined); });
      try {
        for (;;) {
          const entry = await bounded(dir.read(), () => { void dir.close().catch(() => undefined); });
          if (!entry) break;
          if (visited >= maxEntries) { result.complete = false; result.limit = 'entries'; return result; }
          visited++;
          if (entry.isSymbolicLink()) { result.skippedEntries++; continue; }
          const fullPath = path.join(current.fullPath, entry.name);
          if (entry.isDirectory()) {
            pending.push({ fullPath, depth: current.depth + 1 });
          } else if (entry.isFile()) {
            try {
              const fileStat = await bounded(fs.lstat(fullPath));
              if (!fileStat.isFile() || fileStat.isSymbolicLink()) { result.skippedEntries++; continue; }
              result.sizeBytes = Math.min(Number.MAX_SAFE_INTEGER, result.sizeBytes + fileStat.size);
              result.files++;
            } catch (error) {
              if (error === TIMEOUT) throw error;
              result.complete = false; result.skippedEntries++;
            }
          }
        }
      } finally {
        // A timed-out read may still be in flight; close after it without delaying startup.
        void dir.close().catch(() => undefined);
      }
    } catch (error) {
      result.complete = false;
      if (error === TIMEOUT) { result.limit = 'time'; break; }
      result.skippedEntries++;
    }
  }
  return result;
}
