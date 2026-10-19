/**
 * 主进程 → 渲染层 的真实桌面条目载荷（shared 叶子层类型）
 * 不含坐标：布局由渲染层按当前工作区尺寸计算，避免多分辨率下坐标失真。
 */
import type { ExtCategory, FileKind } from './file-node';

export interface DesktopEntry {
  id: string;
  name: string;
  ext: string;
  category: ExtCategory;
  /** 真实字节数 */
  sizeBytes: number;
  /** 真实最后修改时间 epoch ms */
  mtime: number;
  lastOpenedAt?: number;
  realPath: string;
  kind: FileKind;
  /** 原生图标（PNG data URL） */
  iconDataUrl: string;
}
