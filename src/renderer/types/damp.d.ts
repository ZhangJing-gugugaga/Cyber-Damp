/**
 * window.damp 类型声明（renderer 侧消费）
 * 契约：docs/contracts/preload-api.md v1.0 + v1.2（desktop/desktopReady 通道）
 */
import type { SaveData } from '../../shared/types/save';
import type { DesktopEntry } from '../../shared/types/desktop';

declare global {
  interface Window {
    damp?: {
      window: {
        setIgnoreMouseEvents(ignore: boolean, forward?: boolean): Promise<void>;
        getWorkArea(): Promise<{ x: number; y: number; width: number; height: number }>;
      };
      desktop: {
        scan(): Promise<DesktopEntry[]>;
        open(realPath: string): Promise<{ ok: boolean; error?: string }>;
      };
      save: {
        load(): Promise<SaveData | null>;
        write(data: SaveData): Promise<{ ok: boolean }>;
      };
      system: {
        onCpu(cb: (usage: number) => void): () => void;
        onDisplayChanged(cb: (size: { width: number; height: number }) => void): () => void;
      };
      app: {
        version(): Promise<string>;
        quit(): Promise<void>;
        /** PRD §11：本地 JSONL 埋点 */
        track(name: string, props: Record<string, string | number | boolean>): Promise<void>;
        /** 世界装配完成 → 主进程挂 WorkerW + 隐藏原生图标 */
        desktopReady(): Promise<{ ok: boolean; iconsHidden?: boolean; skipped?: boolean }>;
        onBeforeQuit(cb: () => void): () => void;
      };
    };
  }
}

export {};
