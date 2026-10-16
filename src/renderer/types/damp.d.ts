/**
 * window.damp 类型声明（renderer 侧消费）
 * 契约：docs/contracts/preload-api.md v1.0 —— 通道与载荷逐字对齐
 */
import type { SaveData } from '../shared/types/save';

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
      };
      app: {
        version(): Promise<string>;
        quit(): Promise<void>;
        onBeforeQuit(cb: () => void): () => void;
      };
    };
  }
}

export {};
