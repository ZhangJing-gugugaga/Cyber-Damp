/**
 * 主进程 → 渲染层 的真实桌面条目载荷（shared 叶子层类型）
 * geometry由Shell物理框投影到同一桌面画布CSS坐标，渲染层不得重新排网格。
 */
import type { ExtCategory, FileKind } from './file-node';
export interface DesktopViewportRequest { scaleFactor: number; width?: number; height?: number }
export interface DisplayChangedNotice { width: number; height: number; requestId?: number }

export interface DesktopCursor {
  x: number;
  y: number;
  leftDown: boolean;
  desktopActive: boolean;
}

export interface DesktopGeometry {
  x: number; y: number; size: number;
  labelX: number; labelY: number; labelWidth: number; labelHeight: number;
  /** Native monitor scale relative to the spanning canvas CSS scale. */
  labelScale?: number;
}

export interface DesktopEntry {
  fileIdentity?: string;
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
  geometry?: DesktopGeometry;
  displayName?: string;
  /** v0.2 品种输入：由 kind 与 .lnk 目标元数据判定（shared/object-category） */
  objectCategory?: import('./gameplay').ObjectCategory;
}
