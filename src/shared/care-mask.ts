/**
 * 64×64 擦拭掩码编解码（护理台与回归测试共用的纯函数）。
 *
 * 新格式（0.1.26 起）：4096 格按行主序打包为 512 字节再 base64（684 字符），
 * 中下部格子的往返不再丢失。
 * 旧格式（≤0.1.25）：编码只覆盖前 512 格（顶部 8 行），其余在保存时已永久
 * 丢失；解码按原状恢复前 512 格、其余为 0，不补造不存在的记录。
 * btoa/atob 在沙箱渲染层与 Node（≥16）都是全局标准 API，两侧共用本实现。
 */
export const CARE_MASK_CELLS = 64 * 64;
const MASK_BYTES = CARE_MASK_CELLS / 8;
const LEGACY_MASK_BYTES = 64;

export function encodeCareMask(mask: Uint8Array): string {
  const bytes = new Uint8Array(MASK_BYTES);
  for (let i = 0; i < CARE_MASK_CELLS; i += 1) {
    if (mask[i]) bytes[i >> 3] |= 1 << (7 - (i & 7));
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function decodeCareMask(value: string): Uint8Array | null {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    return null;
  }
  if (binary.length !== MASK_BYTES && binary.length !== LEGACY_MASK_BYTES) return null;
  const out = new Uint8Array(CARE_MASK_CELLS);
  for (let i = 0; i < binary.length; i += 1) {
    const byte = binary.charCodeAt(i);
    for (let b = 0; b < 8; b += 1) out[i * 8 + b] = (byte >> (7 - b)) & 1;
  }
  return out;
}
