/**
 * 粒子池（view 层）——水滴/墨点/颜料/孢子/金币/汗珠
 * R3 预算：同屏粒子 ≤300；固定池复用不动态分配
 */
import { Container, Graphics } from 'pixi.js';

export interface ParticleCfg {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  color: number;
  size: number;
  /** 存活秒数 */
  life: number;
  shape: 'circle' | 'square';
  alpha?: number;
}

interface Live {
  g: Graphics;
  cfg: ParticleCfg;
  age: number;
}

/** 同屏粒子总预算（R3 硬约束） */
export const PARTICLE_BUDGET = 300;

export class ParticlePool {
  readonly container = new Container();
  private live: Live[] = [];

  constructor() {
    this.container.eventMode = 'none';
  }

  get count(): number {
    return this.live.length;
  }

  spawn(cfg: ParticleCfg): void {
    if (this.live.length >= PARTICLE_BUDGET) return; // 超预算丢弃（掉帧时保帧率）
    const g = new Graphics();
    if (cfg.shape === 'circle') g.circle(0, 0, cfg.size);
    else g.rect(-cfg.size, -cfg.size, cfg.size * 2, cfg.size * 2);
    g.fill({ color: cfg.color, alpha: cfg.alpha ?? 0.85 });
    g.position.set(cfg.x, cfg.y);
    this.container.addChild(g);
    this.live.push({ g, cfg, age: 0 });
  }

  /** 批量：水珠迸溅/孢子抖落/汗珠滴落 */
  burst(x: number, y: number, n: number, make: (i: number) => ParticleCfg): void {
    for (let i = 0; i < n; i++) this.spawn(make(i));
  }

  update(dtSec: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dtSec;
      if (p.age >= p.cfg.life) {
        this.container.removeChild(p.g);
        p.g.destroy();
        this.live.splice(i, 1);
        continue;
      }
      p.cfg.vy += p.cfg.gravity * dtSec;
      p.g.position.x += p.cfg.vx * dtSec;
      p.g.position.y += p.cfg.vy * dtSec;
      const k = 1 - p.age / p.cfg.life;
      p.g.alpha = (p.cfg.alpha ?? 0.85) * k;
    }
  }
}