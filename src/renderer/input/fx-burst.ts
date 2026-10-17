/**
 * 粒子迸溅效果（input/game 共用）：拧干飙水 / 蘑菇孢子 / 绳崩碎屑
 * 预算由 ParticlePool 统一管控（同屏 ≤300，R3）
 */
import type { ParticlePool } from '../view/particles';
import { DAMP, SHROOM, ENV_COLOR } from '../view/token-colors';

/** 拧干飙水（AC-14 表现） */
export function splashBurst(pool: ParticlePool, x: number, y: number): void {
  pool.burst(x, y - 20, 14, (i) => ({
    x,
    y: y - 20,
    vx: (Math.random() - 0.5) * 180,
    vy: -120 - Math.random() * 90,
    gravity: 420,
    color: i % 3 === 0 ? DAMP.waterHi : DAMP.water,
    size: 2 + Math.random() * 2,
    life: 0.7 + Math.random() * 0.3,
    shape: 'circle',
  }));
}

/** 蘑菇孢子飘落 */
export function sporeBurst(pool: ParticlePool, x: number, y: number): void {
  pool.burst(x, y, 6, () => ({
    x,
    y,
    vx: (Math.random() - 0.5) * 40,
    vy: -20 - Math.random() * 30,
    gravity: 24,
    color: SHROOM.spore,
    size: 1.6 + Math.random(),
    life: 1.5,
    shape: 'circle',
    alpha: 0.9,
  }));
}

/** 绳崩碎屑（AC-12b 表现） */
export function debrisBurst(pool: ParticlePool, x: number, y: number): void {
  pool.burst(x, y, 10, () => ({
    x,
    y,
    vx: (Math.random() - 0.5) * 120,
    vy: -40 - Math.random() * 60,
    gravity: 380,
    color: ENV_COLOR.warn,
    size: 1.5 + Math.random() * 1.5,
    life: 0.9,
    shape: 'square',
    alpha: 0.8,
  }));
}
