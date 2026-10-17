/**
 * 绳索渲染（view 层）
 * 唯一真相源 = VerletRope 的 32 个质点坐标；本模块只做平滑曲线与材质表现，
 * 严禁按文件大小另算绳形/下垂。
 */
import { Graphics } from 'pixi.js';
import type { VerletRope } from '../../world/verlet-rope';
import { ENV_COLOR, ROPE_COLOR } from './token-colors';

interface Pt {
  x: number;
  y: number;
}

/** 二次贝塞尔平滑穿过质点（中间点作为控制点，端点用折线收口） */
function traceSmooth(g: Graphics, pts: Pt[]): void {
  if (pts.length === 0) return;
  g.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    g.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const next = pts[i + 1];
    g.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  const last = pts[pts.length - 1];
  g.lineTo(last.x, last.y);
}

function drawCurve(g: Graphics, pts: Pt[], width: number, color: number, alpha = 1): void {
  traceSmooth(g, pts);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

/** 沿折线等距采样（麻绳编织纹用） */
function sampleAlong(pts: Pt[], step: number): Array<{ x: number; y: number; nx: number; ny: number }> {
  const out: Array<{ x: number; y: number; nx: number; ny: number }> = [];
  let carry = step * 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const nx = -dy / len;
    const ny = dx / len;
    let d = carry;
    while (d < len) {
      out.push({ x: a.x + (dx * d) / len, y: a.y + (dy * d) / len, nx, ny });
      d += step;
    }
    carry = d - len;
  }
  return out;
}

/**
 * 绘制一根绳。
 * @param warn 80%~99% 承重：中间质点每帧 ±1.5px 随机高频抖动 + 挂钩裂纹
 */
export function drawRope(
  g: Graphics,
  rope: VerletRope,
  tier: string,
  tSec: number,
  warn: boolean,
): void {
  g.clear();
  const color = ROPE_COLOR[tier as keyof typeof ROPE_COLOR] ?? ROPE_COLOR['rope-1'];

  // 抖动只作用于绘制副本，不回写物理质点
  const pts: Pt[] = rope.points.map((p, i) => {
    if (!warn || i < 7 || i > rope.points.length - 8) return { x: p.x, y: p.y };
    return {
      x: p.x + (Math.random() - 0.5) * 3,
      y: p.y + (Math.random() - 0.5) * 3,
    };
  });

  // 阴影（绳索离桌面有一点投影）
  traceSmooth(g, pts.map((p) => ({ x: p.x + 2, y: p.y + 3 })));
  g.stroke({ width: 5, color: 0x000000, alpha: 0.2, cap: 'round', join: 'round' });

  // 主绳体（规范宽度 4px）
  drawCurve(g, pts, 4, color, 1);

  // 材质纹理
  if (tier === 'rope-2') {
    // 红塑料绳：沿绳的高光 + 细密压纹
    traceSmooth(g, pts.map((p) => ({ x: p.x, y: p.y - 1 })));
    g.stroke({ width: 1.2, color: 0xffb3a8, alpha: 0.38, cap: 'round', join: 'round' });
    for (const s of sampleAlong(pts, 9)) {
      g.moveTo(s.x - s.nx * 1.6, s.y - s.ny * 1.6)
        .lineTo(s.x + s.nx * 1.6, s.y + s.ny * 1.6)
        .stroke({ width: 0.8, color: 0x7e241d, alpha: 0.4 });
    }
  } else if (tier === 'rope-3') {
    // 304 钢杆：冷色高光
    traceSmooth(g, pts.map((p) => ({ x: p.x, y: p.y - 1.2 })));
    g.stroke({ width: 1.3, color: 0xffffff, alpha: 0.55, cap: 'round', join: 'round' });
  } else {
    // 麻绳：双向斜纹模拟搓捻
    for (const [i, s] of sampleAlong(pts, 7).entries()) {
      const dir = i % 2 === 0 ? 1 : -1;
      g.moveTo(s.x - s.nx * 2.2, s.y - s.ny * 2.2)
        .lineTo(s.x + s.nx * 2.2 + dir * 1.4, s.y + s.ny * 2.2 + dir * 1.4)
        .stroke({ width: 1, color: 0x7a5f3a, alpha: 0.5 });
    }
  }

  // 两端吸盘挂钩（断裂后跟着绳端走）
  const left = rope.attachedLeft ? { x: rope.ax, y: rope.ay } : pts[0];
  const right = rope.attachedRight ? { x: rope.bx, y: rope.by } : pts[pts.length - 1];
  drawSuctionCup(g, left.x, left.y, warn, tSec);
  drawSuctionCup(g, right.x, right.y, warn, tSec + 1.7);

  // 左端裂缝（右侧超过 100% 后已经断开，不再画右端裂纹）
  if (warn) {
    drawCracks(g, left.x, left.y, tSec);
    if (rope.attachedRight) drawCracks(g, right.x, right.y, tSec + 0.8);
  }
  if (rope.broken && !rope.attachedRight) {
    // 右侧断口：散开的绳股
    const p = pts[pts.length - 1];
    g.moveTo(p.x, p.y).lineTo(p.x + 6, p.y - 4).stroke({ width: 1, color, alpha: 0.9 });
    g.moveTo(p.x, p.y).lineTo(p.x + 5, p.y + 3).stroke({ width: 1, color, alpha: 0.7 });
    g.moveTo(p.x, p.y).lineTo(p.x - 2, p.y + 5).stroke({ width: 1, color, alpha: 0.7 });
  }
}

function drawSuctionCup(g: Graphics, x: number, y: number, warn: boolean, tSec: number): void {
  const pulse = warn ? 1 + Math.sin(tSec * 20) * 0.08 : 1;
  g.circle(x, y, 8 * pulse).fill({ color: 0x3d3a35, alpha: 0.92 });
  g.circle(x, y, 5.4 * pulse).fill({ color: 0x6b665d, alpha: 0.9 });
  g.circle(x, y, 2).fill({ color: 0x24221e, alpha: 0.85 });
  // 挂钩小环
  g.moveTo(x + 5, y - 3).quadraticCurveTo(x + 11, y, x + 5, y + 4)
    .stroke({ width: 1.4, color: 0xc9cdd3, alpha: 0.8 });
}

/** 80% 预警：吸盘边缘裂纹（物理反馈，替代文字胶囊） */
function drawCracks(g: Graphics, x: number, y: number, tSec: number): void {
  const base = tSec * 24;
  for (let i = 0; i < 4; i++) {
    const ang = base + (i * Math.PI) / 2 + 0.4;
    const r0 = 8;
    const r1 = 13 + (i % 2) * 4;
    const mx = x + Math.cos(ang + 0.25) * (r0 + r1) * 0.5;
    const my = y + Math.sin(ang + 0.25) * (r0 + r1) * 0.5;
    g.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0)
      .lineTo(mx, my)
      .lineTo(x + Math.cos(ang - 0.1) * r1, y + Math.sin(ang - 0.1) * r1)
      .stroke({ width: 1.3, color: ENV_COLOR.warn, alpha: 0.9 });
  }
}
