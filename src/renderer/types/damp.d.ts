/**
 * window.damp 类型声明（renderer 侧消费）
 * 契约：docs/contracts/preload-api.md v1.0 + v1.1（pause/track 通道）—— 通道与载荷逐字对齐
 */
import type { SaveData } from '../../shared/types/save';

declare global {
  interface Window {
    damp?: {
      window: {
        setIgnoreMouseEvents(ignore: boolean, forward?: boolean): Promise<void>;
        getWorkArea(): Promise<{ x: number; y: number; width: number; height: number }>;
      };
      save: {
        load(): Promise<SaveData | null>;
        write(data: SaveData): Promise<{ ok: boolean }>;
      };
      system: {
        onCpu(cb: (usage: number) => void): () => void;
        onDisplayChanged(cb: (size: { width: number; height: number }) => void): () => void;
        /** AC-28：全屏应用/锁屏暂停推送 */
        onPauseChanged(cb: (paused: boolean, reason: string) => void): () => void;
      };
      app: {
        version(): Promise<string>;
        quit(): Promise<void>;
        /** PRD §11：本地 JSONL 埋点 */
        track(name: string, props: Record<string, string | number | boolean>): Promise<void>;
        onBeforeQuit(cb: () => void): () => void;
      };
    };
  }
}

export {};
