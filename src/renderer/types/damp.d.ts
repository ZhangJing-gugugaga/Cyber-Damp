/** 当前护理台与胶囊消费的 preload 类型；契约 v1.14。 */

declare global {
  interface Window {
    damp?: {
      management: {
        get(): Promise<{ status: import('../../shared/types/management').SceneStatus }>;
        open(): Promise<void>;
        command(command: import('../../shared/types/management').ManagementCommand): Promise<{ ok: boolean; error?: string }>;
        onStatus(cb: (value: import('../../shared/types/management').SceneStatus) => void): () => void;
      };
      window: {
        setIgnoreMouseEvents(ignore: boolean, forward?: boolean): Promise<void>;
      };
      weather: {
        current(location: import('../../shared/types/weather').WeatherLocation, forceRefresh?: boolean): Promise<import('../../shared/types/weather').WeatherLookup>;
        searchCity(query: string): Promise<{ ok: true; options: import('../../shared/types/weather').CityOption[] } | { ok: false; error: string }>;
      };
      native: {
        status(): Promise<import('../../shared/types/native-status').NativeStatusSnapshot>;
        setLocation(location: { cityId: string; label: string; latitude: number; longitude: number }): Promise<{ ok: boolean; message?: string }>;
        setPaused(paused: boolean): Promise<{ ok: boolean }>;
        careProgress(objectId: string, progress: number, mask?: string): Promise<{ ok: boolean; message?: string }>;
        careComplete(objectId: string): Promise<{ ok: boolean; message?: string }>;
        quickCare(objectId: string): Promise<{ ok: boolean; message?: string }>;
        harvest(objectId: string): Promise<{ ok: boolean; message?: string; coins?: number }>;
        buy(itemId: string): Promise<{ ok: boolean; message?: string }>;
        onboardingDone(): Promise<{ ok: boolean; message?: string }>;
        restoreAndPause(): Promise<{ ok: boolean; message?: string }>;
        resume(): Promise<{ ok: boolean }>;
        setAutostart(on: boolean): Promise<{ ok: boolean; on?: boolean; message?: string }>;
        getAutostart(): Promise<{ on: boolean }>;
        // ---------- v0.2 玩法通道（gameplay-v2 契约 v1.15-draft；preload 接线由员工 2 完成，浏览器模拟环境按同名实现） ----------
        careProgressV2?(payload: import('../../shared/types/gameplay').CareProgressV2Payload): Promise<{ ok: boolean; message?: string }>;
        careCompleteV2?(objectId: string): Promise<import('../../shared/types/gameplay').CareCompleteV2Result>;
        harvestV2?(payload: import('../../shared/types/gameplay').HarvestV2Payload): Promise<import('../../shared/types/gameplay').HarvestV2Result>;
        plantSpore?(payload: import('../../shared/types/gameplay').PlantSporePayload): Promise<{ ok: boolean; message?: string }>;
        cancelPlant?(objectId: string): Promise<{ ok: boolean; message?: string }>;
        setOverlayVariant?(variant: 'A' | 'B'): Promise<{ ok: boolean; message?: string }>;
      };
      app: {
        version(): Promise<string>;
        quit(): Promise<void>;
        /** PRD §11：本地 JSONL 埋点 */
        track(name: string, props: Record<string, string | number | boolean>): Promise<void>;
      };
      /** v0.2 壁纸效果组（R9；preload 尚未暴露，模拟环境已实现同名接口） */
      wallpaper?: {
        status(): Promise<import('../../shared/types/gameplay').WallpaperView>;
        setEnabled(on: boolean): Promise<{ ok: boolean; message?: string; view?: import('../../shared/types/gameplay').WallpaperView }>;
        wipe(payload: { fogMask: string; progress: number }): Promise<{ ok: boolean; message?: string; view?: import('../../shared/types/gameplay').WallpaperView }>;
      };
    };
  }
}

export {};
