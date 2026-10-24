/** 原生桌面枚举仍使用的文件分类映射。 */
import type { ExtCategory } from './types/file-node';

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


export function extToCategory(ext: string): ExtCategory {
  return EXT_TABLE[ext.toLowerCase()] ?? 'doc-code';
}
