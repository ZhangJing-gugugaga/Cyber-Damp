/**
 * 存档桥（renderer → main IPC 薄封装）
 * 契约：docs/contracts/preload-api.md v1.0
 * 非 Electron 环境（浏览器直接打开 index.html）降级为内存桩，保证 vite dev 不炸
 */
import type { SaveData } from '../../shared/types/save';

interface DampSaveApi {
  load(): Promise<SaveData | null>;
  write(data: SaveData): Promise<{ ok: boolean }>;
}

/** 内存降级桩：dev 预览用，刷新即失忆 */
function memoryFallback(): DampSaveApi {
  let mem: SaveData | null = null;
  return {
    async load() { return mem; },
    async write(data) { mem = data; return { ok: true }; },
  };
}

export function saveApi(): DampSaveApi {
  return window.damp?.save ?? memoryFallback();
}

/** 读存档：IPC 失败/损坏/版本不符统一返回 null（新开局） */
export async function loadSave(): Promise<SaveData | null> {
  try {
    return await saveApi().load();
  } catch (err) {
    console.warn('[save] load 失败，走新开局:', err);
    return null;
  }
}
