/**
 * 全局常量（shared 叶子层）
 * 口径与 SPEC v1.0 / architecture.md v1.0 逐字对齐；改值必须同步文档
 */

/** GB 统一定义为 1024³ 字节（GiB 语义，与文件系统一致） */
export const GB = 1024 ** 3;

/** ext（小写无点）→ 大类；未命中归 doc-code */
const EXT_TABLE: Record<string, 'doc-code' | 'image-video' | 'audio' | 'archive'> = {
  // 文档与代码类：受潮宣纸洇染，晾晒滴黑色标点/字母
  docx: 'doc-code', pdf: 'doc-code', txt: 'doc-code', md: 'doc-code',
  xlsx: 'doc-code', ppt: 'doc-code', pptx: 'doc-code',
  py: 'doc-code', c: 'doc-code', js: 'doc-code', ts: 'doc-code', exe: 'doc-code', lnk: 'doc-code',
  // 图片与视频类：褪色 + 油彩水膜
  jpg: 'image-video', jpeg: 'image-video', png: 'image-video', gif: 'image-video',
  webp: 'image-video', bmp: 'image-video',
  mp4: 'image-video', avi: 'image-video', mov: 'image-video', mkv: 'image-video',
  // 音频类：底部蓄水鼓袋
  mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio',
  // 压缩包类：密闭发酵胀气
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
};

import type { ExtCategory } from './types/file-node';

export function extToCategory(ext: string): ExtCategory {
  return EXT_TABLE[ext.toLowerCase()] ?? 'doc-code';
}

/** 大类中文标签（UI 展示用） */
export const CATEGORY_LABEL: Record<ExtCategory, string> = {
  'doc-code': '文档与代码',
  'image-video': '图片与视频',
  audio: '音频',
  archive: '压缩包',
};

/**
 * 绳型字节上限（崩断判定按字节累计，禁止按质量判定）
 * 该绳 Σ sizeBytes 超限即断开右端约束；MVP 文件树最大 24GB（等效不限钢杆）
 */
export const ROPE_BYTE_LIMITS = {
  'rope-1': 5 * GB,    // 老式麻绳
  'rope-2': 25 * GB,   // 妈妈的红塑料绳
  'rope-3': 100 * GB,  // 304 不锈钢防风晒衣杆（刚性）
} as const;

/**
 * 单文件挂载重力载荷（唯一公式）：
 *   Fg = log10(sizeBytes + 10) × 1.8
 * 1KB→5.43 / 1MB→10.83 / 1GB→16.24 / 24GB→18.90（约 3.5 倍跨度）。
 * 该值作为 Verlet 质点的额外加速度权重，绳形由约束解算涌现。
 */
export function ropePointLoad(sizeBytes: number): number {
  return Math.log10(Math.max(0, sizeBytes) + 10) * 1.8;
}

/** 固定物理步长（固定步长累加器驱动，禁止可变 dt 直喂） */
export const FIXED_DELTA_MS = 1000 / 60;

/** 桌面网格单元（Windows 标准桌面网格） */
export const DESKTOP_CELL_W = 100;
export const DESKTOP_CELL_H = 110;
