/**
 * 共享种子随机（mulberry32）：小而稳定，同种子跨重启一致。
 * 世界层与共享层共用的最底层工具；不依赖 DOM/Electron/文件 I/O。
 */
export type Rand = () => number;

export function createRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 稳定字符串哈希（FNV-1a 32 位）：留言、品种兜底等"同输入同输出"场景用。 */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
