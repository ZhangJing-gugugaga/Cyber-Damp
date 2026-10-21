/**
 * 桌面网格布局（world 纯领域层）
 * 纵向优先；回收站固定第一格。
 * 顶部留出状态栏、完整菌盖和倾倒空间；底部避开共享任务栏落地点。
 * 输入是主进程扫描到的真实条目，本模块不生成任何文件名。
 */
import { DESKTOP_CELL_H, DESKTOP_CELL_W } from '../shared/constants';
import type { DesktopEntry } from '../shared/types/desktop';
import type { FileNode } from '../shared/types/file-node';

const PAD_X = 4;
const PAD_TOP = 144;
const PAD_BOTTOM = 54;
const ITEM_HEIGHT = 124; // 64px artwork plus up to three filename lines
const ROW_STRIDE = 192; // includes a mature cap above the following row

export interface GridCell {
  x: number;
  y: number;
}

/** 纵向优先网格：第 i 个 → col = i / rowsPerCol, row = i % rowsPerCol */
export function layoutDesktopCells(count: number, viewW: number, viewH: number): GridCell[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.floor((viewW - PAD_X * 2) / DESKTOP_CELL_W));
  // Retain the original item capacity. A dense desktop may need tighter rows,
  // but adding space for fungi must never silently remove formerly visible items.
  const legacyRows = Math.max(1, Math.floor((viewH - 8) / DESKTOP_CELL_H));
  const capacity = legacyRows * cols;
  if (count > capacity) {
    console.warn(`[desktop] 桌面条目 ${count} 超过网格容量 ${capacity}，超出部分本屏不展示`);
  }
  const visible = Math.min(count, capacity);
  const available = Math.max(0, viewH - PAD_TOP - PAD_BOTTOM - ITEM_HEIGHT);
  const preferredRows = Math.floor(available / ROW_STRIDE) + 1;
  const rowsPerCol = Math.max(preferredRows, Math.ceil(visible / cols));
  const rowStride = rowsPerCol > 1 ? Math.min(ROW_STRIDE, available / (rowsPerCol - 1)) : 0;
  const cells: GridCell[] = [];
  for (let i = 0; i < visible; i++) {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    cells.push({ x: PAD_X + col * DESKTOP_CELL_W, y: PAD_TOP + row * rowStride });
  }
  return cells;
}

/** 真实条目 + 网格坐标 → FileNode（不改变任何真实属性） */
export function buildFileNodes(
  entries: DesktopEntry[],
  viewW: number,
  viewH: number,
): FileNode[] {
  return entries.map((e) => {
    if (!e.geometry) throw new Error('缺少原生桌面布局，不能重排图标');
    const cell = { x: e.geometry.x - 18, y: e.geometry.y - 4 };
    return {
      id: e.id,
      fileIdentity: e.fileIdentity,
      name: e.name,
      ext: e.ext,
      category: e.category,
      sizeBytes: e.sizeBytes,
      mtime: e.mtime,
      lastOpenedAt: e.lastOpenedAt,
      x: cell.x,
      y: cell.y,
      realPath: e.realPath,
      kind: e.kind,
      iconDataUrl: e.iconDataUrl,
      geometry: e.geometry,
      displayName: e.displayName,
    };
  });
}
