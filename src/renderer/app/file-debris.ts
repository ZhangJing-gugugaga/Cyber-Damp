/**
 * 文件碎屑表现（app 层，P1）
 * - 压缩包受潮：密闭发酵的「假碎片」小幅迸出（方形碎屑粒子）
 * - 文档/代码受潮：标点字符从图标底部滴落（GlyphPool，可用小扫把清扫）
 */
import type { WorldRuntime } from './world-runtime';
import type { FileSprite } from '../view/file-sprite';
import type { ParticlePool } from '../view/particles';
import type { GlyphPool } from '../view/glyph-pool';
import { CATEGORY_COLOR } from '../view/token-colors';

const fragmentAcc = new Map<string, number>();
const glyphAcc = new Map<string, number>();

/** 每帧调用（按文件节流：碎片 0.9s / 字符 2.2s） */
export function updateFileDebris(
  runtime: WorldRuntime,
  sprites: Map<string, FileSprite>,
  pool: ParticlePool,
  glyphs: GlyphPool,
  dtSec: number,
): void {
  for (const ent of runtime.entities) {
    const p = sprites.get(ent.node.id)?.container.position;
    if (!p) continue;
    const wet = ent.runtime.humidity > 0.5;

    if (ent.node.category === 'archive' && wet) {
      const t = (fragmentAcc.get(ent.node.id) ?? 0) + dtSec;
      if (t < 0.9) {
        fragmentAcc.set(ent.node.id, t);
      } else {
        fragmentAcc.set(ent.node.id, 0);
        pool.spawn({
          x: p.x + 8 + Math.random() * 48,
          y: p.y + 18 + Math.random() * 34,
          vx: (Math.random() - 0.5) * 26,
          vy: -6 - Math.random() * 12,
          gravity: 140,
          color: CATEGORY_COLOR.archive,
          size: 1.4 + Math.random() * 1.6,
          life: 1.3,
          shape: 'square',
          alpha: 0.75,
        });
      }
    }

    if (ent.node.category === 'doc-code' && ent.runtime.humidity > 0.65) {
      const t = (glyphAcc.get(ent.node.id) ?? 0) + dtSec;
      if (t < 2.2) {
        glyphAcc.set(ent.node.id, t);
      } else {
        glyphAcc.set(ent.node.id, 0);
        glyphs.spawn(p.x + 32, p.y + 56);
      }
    }
  }
}
