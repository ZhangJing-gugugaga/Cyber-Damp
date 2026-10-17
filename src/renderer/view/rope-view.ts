/**
 * 绳索渲染（view 层）—— AC-34 下垂单一来源的唯一实现位置
 * 绳形 100% 采样 Matter 绳链刚体坐标（rope.links[i].position）；
 * 严禁按文件大小/质量直接计算绳形或插值下垂（SPEC §6 双源真相禁忌）
 */
import { Graphics } from 'pixi.js';
import type { Rope } from '../physics/rope-factory';
import { ROPE_COLOR, ROPE_WIDTH } from './token-colors';

export function drawRope(g: Graphics, rope: Rope, tier: string): void {
  g.clear();
  const color = ROPE_COLOR[tier as keyof typeof ROPE_COLOR] ?? ROPE_COLOR['rope-1'];
  const width = ROPE_WIDTH[tier as keyof typeof ROPE_WIDTH] ?? 3;

  const links = rope.links;
  if (links.length === 0) return;

  // 只读物理坐标画折线（悬链线形态由解算涌现）
  g.moveTo(links[0].position.x, links[0].position.y);
  for (let i = 1; i < links.length; i++) {
    g.lineTo(links[i].position.x, links[i].position.y);
  }
  g.stroke({ width, color, cap: 'round', join: 'round' });

  // 两端吸盘挂钩
  g.circle(rope.ax, rope.ay, 6).fill({ color, alpha: 0.9 });
  g.circle(rope.bx, rope.by, 6).fill({ color, alpha: 0.9 });
}

/**
 * 80% 字节预警视觉（P1 表现层，不改物理解算与崩断时机）：
 * 绳体颤抖 = 在物理坐标上叠加微小横向抖动（不改 link 位置，只影响绘制）
 */
export function drawRopeWarn(g: Graphics, rope: Rope, tier: string, phase: number): void {
  drawRope(g, rope, tier);
  const links = rope.links;
  if (links.length === 0) return;
  const shake = Math.sin(phase * 24) * 1.2;
  const color = 0xD9A441; // --warn
  g.moveTo(links[0].position.x + shake, links[0].position.y);
  for (let i = 1; i < links.length; i++) {
    g.lineTo(links[i].position.x + shake, links[i].position.y);
  }
  g.stroke({ width: 1, color, alpha: 0.6 });
}