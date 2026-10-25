import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { ShellIconPixels } from '../native/win32-icon-pixels';

export interface ShellIconRequest { path: string; resourceIndex?: number; fallbackPath?: string }

const CHUNK_SIZE = 8;
const CHUNK_TIMEOUT_MS = 15_000;

function queryChunk(chunk: ShellIconRequest[]): Promise<(ShellIconPixels | null)[] | null> {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'shell-icons-worker.js'), { workerData: chunk });
    let settled = false;
    const finish = (icons: (ShellIconPixels | null)[] | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(icons); // null = 本块作废（超时/崩溃/畸形结果），由调用方回退
    };
    const timer = setTimeout(() => finish(null), CHUNK_TIMEOUT_MS);
    worker.once('error', () => finish(null));
    worker.once('exit', () => { if (!settled) finish(null); });
    worker.once('message', (message: { ok: boolean; icons?: (ShellIconPixels | null)[]; error?: string }) => {
      if (!message.ok || !Array.isArray(message.icons) || message.icons.length !== chunk.length) finish(null);
      else finish(message.icons);
    });
  });
}

/**
 * 分块并行提取（R1 单个失败不阻塞其余对象）：实测桌面存在图标提取无限
 * 挂起的快捷方式（失效网络目标等），单 worker 串行会把整次桌面扫描拖死。
 * 卡死的 Shell 提供方只作废自己那一块并按 null 回退，扫描继续。
 */
export async function queryShellIcons(requests: ShellIconRequest[]): Promise<(ShellIconPixels | null)[]> {
  if (requests.length === 0) return [];
  const chunks: ShellIconRequest[][] = [];
  for (let i = 0; i < requests.length; i += CHUNK_SIZE) chunks.push(requests.slice(i, i + CHUNK_SIZE));
  const results = await Promise.all(chunks.map(async (chunk) => {
    const icons = await queryChunk(chunk);
    // 作废的块按等长 null 回退，保持结果与请求一一对位
    return icons ?? (chunk.map(() => null) as (ShellIconPixels | null)[]);
  }));
  return results.flat();
}
