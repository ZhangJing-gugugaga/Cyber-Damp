/**
 * 桌面网格布局（world 纯领域层）
 * 规范：左上角起始、纵向优先、单元 100x110；回收站固定第一格（Windows 默认位）。
 * 输入是主进程扫描到的真实条目，本模块不生成任何文件名。
 */
import { DESKTOP_CELL_H, DESKTOP_CELL_W } from '../shared/constants';
import type { DesktopEntry } from '../shared/types/desktop';
import type { FileNode } from '../shared/types/file-node';

const PAD_X = 4;
const PAD_Y = 4;

export interface GridCell {
  x: number;
  y: number;
}

/** 纵向优先网格：第 i 个 → col = i / rowsPerCol, row = i % rowsPerCol */
export function layoutDesktopCells(count: number, viewW: number, viewH: number): GridCell[] {
  if (count <= 0) return [];
  const rowsPerCol = Math.max(1, Math.floor((viewH - PAD_Y * 2) / DESKTOP_CELL_H));
  const cols = Math.max(1, Math.floor((viewW - PAD_X * 2) / DESKTOP_CELL_W));
  const capacity = rowsPerCol * cols;
  if (count > capacity) {
    console.warn(`[desktop] 桌面条目 ${count} 超过网格容量 ${capacity}，超出部分本屏不展示`);
  }
  const visible = Math.min(count, capacity);
  const cells: GridCell[] = [];
  for (let i = 0; i < visible; i++) {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    cells.push({ x: PAD_X + col * DESKTOP_CELL_W, y: PAD_Y + row * DESKTOP_CELL_H });
  }
  return cells;
}

/** 真实条目 + 网格坐标 → FileNode（不改变任何真实属性） */
export function buildFileNodes(
  entries: DesktopEntry[],
  viewW: number,
  viewH: number,
): FileNode[] {
  const cells = layoutDesktopCells(entries.length, viewW, viewH);
  return cells.map((cell, i) => {
    const e = entries[i];
    return {
      id: e.id,
      name: e.name,
      ext: e.ext,
      category: e.category,
      sizeBytes: e.sizeBytes,
      mtime: e.mtime,
      x: cell.x,
      y: cell.y,
      realPath: e.realPath,
      kind: e.kind,
      iconDataUrl: e.iconDataUrl,
    };
  });
}
