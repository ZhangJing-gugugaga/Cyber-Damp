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
      };
      app: {
        version(): Promise<string>;
        quit(): Promise<void>;
        /** PRD §11：本地 JSONL 埋点 */
        track(name: string, props: Record<string, string | number | boolean>): Promise<void>;
      };
    };
  }
}

export {};
