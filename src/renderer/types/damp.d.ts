/**
 * window.damp 类型声明（renderer 侧消费）
 * 契约：docs/contracts/preload-api.md v1.0 + v1.2（desktop/desktopReady 通道）
 */
import type { SaveData } from '../../shared/types/save';
import type { DesktopEntry } from '../../shared/types/desktop';
import type { DesktopWallpaper } from '../../shared/types/wallpaper';

declare global {
  interface Window {
    damp?: {
      management: {
        get(): Promise<{ status: import('../../shared/types/management').SceneStatus; snapshot: import('../../shared/types/management').ManagementSnapshot }>;
        open(): Promise<void>;
        command(command: import('../../shared/types/management').ManagementCommand): Promise<{ ok: boolean; error?: string }>;
        publish(snapshot: import('../../shared/types/management').ManagementSnapshot): void;
        onCommand(cb: (value: import('../../shared/types/management').ManagementCommand) => void): () => void;
        onStatus(cb: (value: import('../../shared/types/management').SceneStatus) => void): () => void;
        onSnapshot(cb: (value: import('../../shared/types/management').ManagementSnapshot) => void): () => void;
      };
      window: {
        onCursor(cb: (point: import('../../shared/types/desktop').DesktopCursor) => void): () => void;
        setIgnoreMouseEvents(ignore: boolean, forward?: boolean): Promise<void>;
        getWorkArea(): Promise<{ x: number; y: number; width: number; height: number }>;
        getInputSettings(): Promise<{ doubleClickMs: number }>;
      };
      desktop: {
        scan(viewport?: import('../../shared/types/desktop').DesktopViewportRequest): Promise<DesktopEntry[]>;
        wallpaper(): Promise<DesktopWallpaper | null>;
        open(realPath: string): Promise<{ ok: boolean; error?: string }>;
      };
      save: {
        load(): Promise<SaveData | null>;
        write(data: SaveData): Promise<{ ok: boolean }>;
      };
      weather: {
        current(location: import('../../shared/types/weather').WeatherLocation, forceRefresh?: boolean): Promise<import('../../shared/types/weather').WeatherLookup>;
        searchCity(query: string): Promise<{ ok: true; options: import('../../shared/types/weather').CityOption[] } | { ok: false; error: string }>;
      };
      icon: {
        applyState(items: Array<{ id: string; realPath: string; kind: 'dir' | 'lnk'; sourcePngBase64: string; eventId?: string }>): Promise<Array<{ id: string; ok: true } | { id: string; ok: false; reason: string; retryable: boolean }>>;
        restoreAll(): Promise<Array<{ id: string; realPath: string; kind: 'dir' | 'lnk'; outcome: 'restored' | 'kept-user-value' | 'missing' | 'failed'; detail?: string }>>;
      };
      native: {
        status(): Promise<import('../../shared/types/native-status').NativeStatusSnapshot>;
        setLocation(location: { cityId: string; label: string; latitude: number; longitude: number }): Promise<{ ok: boolean; message?: string }>;
        setPaused(paused: boolean): Promise<{ ok: boolean }>;
        careProgress(objectId: string, progress: number): Promise<{ ok: boolean }>;
        careComplete(objectId: string): Promise<{ ok: boolean; message?: string }>;
        quickCare(objectId: string): Promise<{ ok: boolean; message?: string }>;
        harvest(objectId: string): Promise<{ ok: boolean; message?: string; coins?: number }>;
        buy(itemId: string): Promise<{ ok: boolean; message?: string }>;
        onboardingDone(): Promise<{ ok: boolean; message?: string }>;
        restoreAndPause(): Promise<{ ok: boolean; message?: string }>;
        resume(): Promise<{ ok: boolean }>;
        setAutostart(on: boolean): Promise<{ ok: boolean; on?: boolean; message?: string }>;
        getAutostart(): Promise<{ on: boolean }>;
      };
      system: {
        onCpu(cb: (usage: number) => void): () => void;
        onDisplayChanged(cb: (size: import('../../shared/types/desktop').DisplayChangedNotice) => void): () => void;
      };
      app: {
        version(): Promise<string>;
        quit(): Promise<void>;
        /** PRD §11：本地 JSONL 埋点 */
        track(name: string, props: Record<string, string | number | boolean>): Promise<void>;
        /** 世界装配完成 → 主进程挂 WorkerW + 隐藏原生图标 */
        desktopReady(): Promise<{ ok: boolean; iconsHidden?: boolean; skipped?: boolean }>;
        viewportReady(result: { requestId: number; ok: boolean }): Promise<{ ok: boolean }>;
        onBeforeQuit(cb: () => void): () => void;
      };
    };
  }
}

export {};
