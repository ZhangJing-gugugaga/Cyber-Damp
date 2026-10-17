/**
 * 虚拟桌面生成器（world 纯领域层）
 * SPEC v1.0 §6 pin 集权威源：初始桌面 = PRD v1.1 §7.2 的 16 个命名锚文件。
 * 文件名/mtime 冷落度逐一钉死；大文件 sizeBytes 钉死（演示深 V 用），
 * 其余 sizeBytes 用确定性 PRNG 对数分布（同日同桌面，保证演示可复现）。
 * mulberry32 仅用于坐标微扰与 sizeBytes 抖振——不生成新文件名。
 */
import type { FileNode, ExtCategory } from '../shared/types/file-node';
import { GB, extToCategory } from '../shared/constants';

/** mulberry32 确定性 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** pin 集条目：[文件名, 冷落天数, sizeBytes|null] */
/** 大文件锚点（架构师锁定）：学习资料.7z = 24GB——AC-37 下垂验收/Demo 容量预检必要性/钢杆相对价值三锚点依赖 */
const PIN_SET: Array<[string, number, number | null]> = [
  ['毕业论文_最终版_不改了_v3.docx', 62, null],
  ['新建文件夹 (2)', 45, null],
  ['学习资料.7z', 120, 24 * GB],
  ['甲方需求_确认版.pdf', 31, null],
  ['IMG_20250713_183642.jpg', 12, null],
  ['demo.mp4', 90, 2.3 * GB],
  ['main.py', 20, null],
  ['会议记录_7月.docx', 8, null],
  ['周报_W41.docx', 2, null],
  ['截图.png', 5, null],
  ['song.flac', 60, null],
  ['old_project.zip', 200, 0.8 * GB],
  ['报销单.xlsx', 15, null],
  ['utils.c', 25, null],
  ['表情包.gif', 40, null],
  ['简历_最新.pdf', 3, null],
];

function splitExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  // 「新建文件夹 (2)」无扩展名；以点分隔且点后无路径分隔符视为 ext
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot + 1) };
}

/** 日期字符串（YYYY-MM-DD）→ seed，保证同日同桌面 */
function dateSeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

const DAY_MS = 86400000;

/** 工作区基准兜底：1920x1080 屏减去任务栏；实际调用时传入真实工作区尺寸 */
const WORK_W = 1920;
const WORK_H = 1040;
const EDGE_MARGIN = 140;
const TOP_MARGIN = 80;

/**
 * 生成 16 个锚文件的初始桌面。
 * @param now 当前 epoch ms（mtime = now - days*DAY_MS）
 * @param workW 工作区宽（DIP；默认 1920，Windows 实际值由调用方传入）
 * @param workH 工作区高（DIP；默认 1040）
 */
export function generateDesktop(now: number, workW = WORK_W, workH = WORK_H): FileNode[] {
  const rnd = mulberry32(dateSeed(new Date(now)));
  const nodes: FileNode[] = [];

  // 布局：4 列网格 + 确定性抖动（列宽/行高按真实工作区自适应，防小屏文件出界）
  const cols = 4;
  const cellW = (workW - EDGE_MARGIN * 2) / cols;
  const rows = Math.ceil(PIN_SET.length / cols);
  const cellH = (workH - TOP_MARGIN - 40) / rows;

  PIN_SET.forEach(([name, days, pinnedSize], i) => {
    const { ext } = splitExt(name);
    const category: ExtCategory = extToCategory(ext);
    const col = i % cols;
    const row = Math.floor(i / cols);

    // sizeBytes：钉死值优先；其余 1KB-50MB 对数分布
    let sizeBytes: number;
    if (pinnedSize !== null) {
      sizeBytes = pinnedSize;
    } else {
      const logMin = Math.log10(1024);            // 1KB
      const logMax = Math.log10(50 * 1024 * 1024); // 50MB
      sizeBytes = Math.round(10 ** (logMin + rnd() * (logMax - logMin)));
    }

    const jx = (rnd() - 0.5) * 40;
    const jy = (rnd() - 0.5) * 24;

    nodes.push({
      id: `f-${String(i + 1).padStart(3, '0')}`,
      name,
      ext,
      category,
      sizeBytes,
      mtime: now - days * DAY_MS,
      x: Math.round(EDGE_MARGIN + col * cellW + cellW / 2 + jx),
      y: Math.round(TOP_MARGIN + row * cellH + jy),
    });
  });

  return nodes;
}

/** 冷落度分布自检（QA/开发用）：≥8 个 >30 天的陈年老文件 */
export function countMoldy(nodes: FileNode[], now: number): number {
  return nodes.filter((n) => (now - n.mtime) / DAY_MS > 30).length;
}
