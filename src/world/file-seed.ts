/**
 * 真实文件的开局状态种子（world 纯领域层）
 * 阶段仍由真实 mtime 推导；湿度/霉变只做与阶段一致的初值，
 * 让 6 秒开场演出有可插值的终态，同时不影响存档覆盖。
 */
import type { ExtCategory, FileKind } from '../shared/types/file-node';
import type { FileRuntime } from '../shared/types/file-runtime';
import { pickFileSpecies } from './mushroom-species';

export function stageSeed(stage: FileRuntime['stage']): { humidity: number; mold: number } {
  switch (stage) {
    case 'fresh':
      return { humidity: 0.08, mold: 0 };
    case 'damp':
      return { humidity: 0.45, mold: 0.08 };
    case 'wet':
      return { humidity: 0.7, mold: 0.45 };
    case 'moldy':
      return { humidity: 0.86, mold: 0.72 };
  }
}

/** 稳定 0..1 哈希（同一路径每次启动抽到同一菌种） */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * 重度遗忘（ΔT ≥ 30d）文件：保证开场就有可生长的成熟蘑菇。
 * 已有蘑菇（存档）不覆盖。
 */
export function seedMoldyMushroom(
  runtime: FileRuntime,
  category: ExtCategory,
  id: string,
  name = '',
  kind: FileKind = 'file',
): void {
  if (runtime.stage !== 'moldy' || runtime.state === 'burnt' || runtime.mushroom) return;
  runtime.mushroom = { species: pickFileSpecies({ category, name, kind }, hash01(id)), growth: 1 };
}
