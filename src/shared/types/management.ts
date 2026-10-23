export const STARTUP_STAGES = ['launch', 'graphics', 'desktop', 'materials', 'takeover'] as const;
export type StartupStage = typeof STARTUP_STAGES[number];
export interface SceneStatus { paused: boolean; hidden: boolean; ready: boolean; shortcut: string; shortcutError?: string; displayError?: string; page?: 'care' | 'shop' | 'settings'; startupStage?: StartupStage }
export interface ManagedFile { id: string; name: string; wet: number; mold: number; mushroom: string | null }
export interface ManagementPreferences { sfx: boolean; veil: '' | 'low' | 'high'; microphoneEnabled: boolean; microphoneState: 'disabled' | 'requesting' | 'calibrating' | 'ready' | 'denied' | 'unavailable' | 'error' }
export interface ManagementSnapshot { files: ManagedFile[]; coins: number; owned: string[]; equipped?: { rope: string; clip: string }; feedback?: { sequence: number; ok: boolean; message: string }; preferences?: ManagementPreferences }
export interface ManagementCommand { action: string; id?: string; value?: string }
