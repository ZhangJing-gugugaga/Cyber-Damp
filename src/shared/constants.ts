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
  xlsx: 'doc-code', // PRD pin 集含报销单.xlsx
  py: 'doc-code', c: 'doc-code', js: 'doc-code', exe: 'doc-code',
  // 图片与视频类：褪色 + 油彩水膜
  jpg: 'image-video', png: 'image-video', gif: 'image-video', // PRD pin 集含表情包.gif
  mp4: 'image-video',
  avi: 'image-video', mov: 'image-video',
  // 音频类：底部蓄水鼓袋
  mp3: 'audio', wav: 'audio', flac: 'audio',
  // 压缩包类：密闭发酵胀气
  zip: 'archive', rar: 'archive', '7z': 'archive',
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
 * 该绳 Σ sizeBytes 超限即移除锚点约束；MVP 文件树最大 24GB（等效不限钢杆）
 */
export const ROPE_BYTE_LIMITS = {
  'rope-1': 5 * GB,    // 老式麻绳
  'rope-2': 25 * GB,   // 妈妈的红塑料绳
  'rope-3': 100 * GB,  // 304 不锈钢防风晒衣杆（刚性）
} as const;

/**
 * sizeToMass：字节 → Matter 质量（对数映射，kb=sizeBytes/1024 二进制口径）
 * 实算锚点（两位小数，与代码对表的唯一参考）：
 *   1KB→0.40 / 10KB→1.20 / 1MB→2.81 / 1GB→5.22 / 20GB→6.26 / 24GB→6.32
 * 保留警告：5GB→5.78 vs 25GB→6.33 几乎无差——崩断必须按字节判（ROPE_BYTE_LIMITS）
 * 仅用于下垂深度与配重表现的参考量；禁止用作崩断阈值
 */
export function sizeToMass(sizeBytes: number): number {
  const kb = Math.max(sizeBytes / 1024, 1);
  return 0.4 + Math.log10(kb) * 0.8;
}

/** 物理引擎常量（防 Matter 迭代解算抖动） */
export const MASS_RATIO_MAX = 35;        // 绳-文件质量比安全上限
export const CONSTRAINT_ITERATIONS = 4;
export const POSITION_ITERATIONS = 8;
export const FIXED_DELTA_MS = 1000 / 60; // 固定步长累加器驱动，禁止可变 dt 直喂

/** Matter 碰撞分类位（绳链互不碰撞也不撞文件；文件撞文件+任务栏） */
export const CAT = {
  ROPE: 0x0001,
  FILE: 0x0002,
  TASKBAR: 0x0004,
} as const;
