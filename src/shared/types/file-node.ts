/**
 * 真实桌面文件节点（shared 叶子层类型）
 * 节点数据 100% 来自主进程扫描的真实 Desktop 目录；x/y 由 100x110 网格布局计算。
 */

/** 文件大类：决定受潮/滴落物/蘑菇菌种的表现分支 */
export type ExtCategory = 'doc-code' | 'image-video' | 'audio' | 'archive';

/** 节点来源：普通文件 / 文件夹 / 系统桌面特殊项（回收站） */
export type FileKind = 'file' | 'dir' | 'recycle' | 'shell';

export interface FileNode {
  fileIdentity?: string;
  /** 稳定 id（真实路径哈希；存档主键） */
  id: string;
  /** 真实文件名，如「会议纪要.docx」 */
  name: string;
  /** 小写无点扩展名；文件夹/回收站为空串 */
  ext: string;
  /** 由 ext 映射，决定受潮/滴落物/菌种表现 */
  category: ExtCategory;
  /** 真实字节数（stat.size；文件夹 0） */
  sizeBytes: number;
  /** 真实 mtime（epoch ms）；冷落度 = now - mtime */
  mtime: number;
  lastOpenedAt?: number;
  /** 桌面网格单元左上角（100x110 单元） */
  x: number;
  y: number;
  /** 真实绝对路径（回收站为 shell:RecycleBinFolder） */
  realPath: string;
  kind: FileKind;
  /** 主进程原生 API 提取的高清图标 PNG data URL */
  iconDataUrl: string;
  geometry?: import('./desktop').DesktopGeometry;
  displayName?: string;
}
