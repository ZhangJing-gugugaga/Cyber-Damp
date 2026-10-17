/**
 * 工具体验效果（app 装配层）：吹风机施热/蒸汽粒子/过热警示 + 刮水器水痕
 * 从 game.ts 拆出（单文件 ≤300 行纪律）；领域状态变更走 world-runtime
 */
import type { WorldRuntime } from './world-runtime';
import type { Atmosphere } from './atmosphere';
import type { ParticlePool } from '../view/particles';
import type { FileSprite } from '../view/file-sprite';

/** 吹风机按住施热：局部烘干 + 焦化 + 蒸汽粒子 + 过热警示（每 id 一次） */
export function applyHeatFx(
  runtime: WorldRuntime,
  sprites: Map<string, FileSprite>,
  pool: ParticlePool,
  toast: (text: string) => void,
  warned: Set<string>,
  id: string,
  dtSec: number,
): void {
  runtime.applyHeat(id, dtSec);
  const rt = runtime.byId.get(id)?.runtime;
  const sp = sprites.get(id)?.container.position;
  if (sp) {
    pool.spawn({
      x: sp.x + 50 + (Math.random() - 0.5) * 30,
      y: sp.y + 24,
      vx: (Math.random() - 0.5) * 30,
      vy: -50 - Math.random() * 40,
      gravity: -30,
      color: 0xe8d9b8, // 热风气浪（近 --shroom-bolete-stem 域暖白）
      size: 2.5,
      life: 0.5,
      shape: 'circle',
      alpha: 0.4,
    });
  }
  if (rt && rt.char > 0.5 && !warned.has(id)) {
    warned.add(id);
    toast('过热警告：纸边都烤卷了，快拿保湿喷雾救一下。');
  }
}

/** 刮水器拖动：擦雾（缓慢回潮）+ 水痕滴落 */
export function squeegeeFx(atmosphere: Atmosphere, pool: ParticlePool, dist: number, x: number, y: number): void {
  atmosphere.wipe(dist);
  pool.spawn({
    x,
    y,
    vx: (Math.random() - 0.5) * 60,
    vy: 60 + Math.random() * 60,
    gravity: 300,
    color: 0xc7d9dc, // --damp-1-water（水痕）
    size: 2,
    life: 0.6,
    shape: 'circle',
    alpha: 0.7,
  });
}
