/**
 * 本地事件日志（main 进程，PRD §11）：JSONL 追加写入 userData/events.jsonl
 * 零第三方 SDK、零网络；只接受字符串/数字/布尔属性，不落任何隐私字段。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';

const MAX_BYTES = 1024 * 1024; // 1MB 轮转

let anonId = '';

function userDataPath(file: string): string {
  return path.join(app.getPath('userData'), file);
}

function ensureAnonId(): string {
  if (anonId) return anonId;
  const file = userDataPath('anon.id');
  try {
    anonId = fs.readFileSync(file, 'utf8').trim();
  } catch {
    /* 首次运行 */
  }
  if (!anonId) {
    anonId = randomUUID();
    try {
      fs.writeFileSync(file, anonId, 'utf8');
    } catch {
      /* 只读环境降级：本次会话仍可用内存 id */
    }
  }
  return anonId;
}

type Primitive = string | number | boolean;

/** 属性白名单清洗：仅原始值，限 20 键/键名 40 字/字符串值 200 字 */
function sanitizeProps(props: unknown): Record<string, Primitive> {
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return {};
  const out: Record<string, Primitive> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (n++ >= 20) break;
    if (typeof k !== 'string' || k.length === 0 || k.length > 40) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function rotateIfNeeded(file: string): void {
  try {
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
  } catch {
    /* 文件不存在或不可写，忽略 */
  }
}

/** 记录事件（IPC 入口；非法 name 直接丢弃） */
export function trackEvent(name: unknown, props: unknown = {}): void {
  if (typeof name !== 'string' || name.length === 0 || name.length > 64) {
    console.warn('[track] 非法事件名，已丢弃');
    return;
  }
  const file = userDataPath('events.jsonl');
  const line = JSON.stringify({
    name,
    ts: Date.now(),
    app: app.getVersion(),
    uid: ensureAnonId(),
    props: sanitizeProps(props),
  });
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${line}\n`, 'utf8');
    rotateIfNeeded(file);
  } catch (err) {
    console.warn('[track] 写入失败:', err);
  }
}
