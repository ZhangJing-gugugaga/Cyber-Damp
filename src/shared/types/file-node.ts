/**
 * 虚拟文件节点（shared 叶子层类型）
 * pin 集（PRD v1.1 §7.2）的静态定义；运行时字段见 file-runtime.ts
 */

/** 文件大类：决定受潮/滴落物/蘑菇菌种的表现分支 */
export type ExtCategory = 'doc-code' | 'image-video' | 'audio' | 'archive';

export interface FileNode {
  /** 稳定 UUID（生成时确定，存档主键） */
  id: string;
  /** 展示名，如「毕业论文_最终版_不改了_v3.docx」 */
  name: string;
  /** 小写无点，如 docx */
  ext: string;
  /** 由 ext 映射，决定受潮/滴落物表现 */
  category: ExtCategory;
  /** 虚拟但真实量级，用于配重与字节崩断判定 */
  sizeBytes: number;
  /** epoch ms；冷落度 = now - mtime */
  mtime: number;
  /** 桌面工作区坐标（初始布局） */
  x: number;
  y: number;
}
