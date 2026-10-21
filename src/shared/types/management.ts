export interface SceneStatus { paused: boolean; hidden: boolean; ready: boolean; shortcut: string; shortcutError?: string; displayError?: string; page?: 'care' | 'shop' | 'settings' }
export interface ManagedFile { id: string; name: string; wet: number; mold: number; mushroom: string | null }
export interface ManagementSnapshot { files: ManagedFile[]; coins: number; owned: string[]; equipped?: { rope: string; clip: string }; feedback?: { sequence: number; ok: boolean; message: string } }
export interface ManagementCommand { action: string; id?: string; value?: string }
