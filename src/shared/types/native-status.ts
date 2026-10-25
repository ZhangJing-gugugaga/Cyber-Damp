/**
 * native:status 返回载荷（Goal v9 阶段3；native-handlers 的 renderer 消费面）
 */
import type { DamageState } from './native';
import type { NativeCollectionEntry, NativeSaveSection } from './save';

export interface NativeObjectView {
  id: string;
  displayName: string;
  kind: 'dir' | 'lnk';
  realPath: string;
  damage: DamageState | null;
  careProgress: number;
  careMask?: string;
  mushroomSpecies?: string;
  moldImmuneUntil: number;
  lastAdvanceAt: number;
  /** 当前扫描中仍在桌面（不存在则不可护理/采摘） */
  present: boolean;
  /** 当前桌面扫描的原生图标（合成状态图的底图） */
  iconDataUrl: string;
  /** v0.2：对象类别（仅在当前扫描中存在时提供；不读取文件正文） */
  objectCategory?: import('./gameplay').ObjectCategory;
}

export interface NativeStatusSnapshot {
  paused: boolean;
  restored: boolean;
  initStatus: string;
  initProgress: string;
  today: string;
  todayStatus: string;
  location: { cityId: string; label: string; latitude: number; longitude: number } | null;
  snapshot: NativeSaveSection['lastSnapshot'];
  collection: Record<string, NativeCollectionEntry>;
  onboarded: boolean;
  coins: number;
  owned: string[];
  objects: NativeObjectView[];
}
