/**
 * 开场 6 秒「延时摄影」腐化演出（app 装配层）
 *
 * 真实 mtime 分档（ΔT = now - mtime）：
 *   ΔT < 3d   保持干燥
 *   3-14d     1~5s 动态浮现高光水珠
 *   14-30d    1~5s 从图标边角 multiply 扩散毛绒霉斑
 *   ≥30d      1~3.2s 霉斑扩散完成，3.2~5.2s 蘑菇从图标上边框 scale 0→1 长出
 *
 * 演出期间 runtime.locked 锁定拖拽；任意点击/键可跳过；不篡改存档逻辑态。
 */
import type { WorldRuntime } from './world-runtime';
import type { Atmosphere } from './atmosphere';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';
import type { FileSprite } from '../view/file-sprite';
import type { MushroomView } from '../view/mushroom-view';
import { SHROOM } from '../view/token-colors';

const DURATION = 6.0;

const smooth = (a: number, b: number, t: number): number => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** 根部锚点缩放：从 0 弹到 1（轻微过冲后回落） */
const easeOutBack = (x: number): number => {
  const c = 1.70158;
  const y = x - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
};

interface Target {
  id: string;
  stage: 'fresh' | 'damp' | 'wet' | 'moldy';
  sprite: FileSprite;
  shroom: MushroomView | null;
  popped: boolean;
  popAt: number;
}

export interface OpeningDeps {
  runtime: WorldRuntime;
  atmosphere: Atmosphere;
  pool: ParticlePool;
  sfx: Sfx;
  sprites: Map<string, FileSprite>;
  shrooms: Map<string, MushroomView>;
  onToast(text: string): void;
  onFinish(): void;
}

export class Opening {
  private t = 0;
  private done = false;
  private targets: Target[] = [];
  private skipHandler: () => void;

  constructor(private deps: OpeningDeps) {
    const { runtime } = deps;
    let popIndex = 0;
    for (const ent of runtime.entities) {
      const sprite = deps.sprites.get(ent.node.id);
      if (!sprite) continue;
      const stage = ent.runtime.stage;
      if (stage === 'fresh') continue;
      const isMoldy = stage === 'moldy';
      const popAt = 3.2 + Math.min(0.5, popIndex * 0.05);
      if (isMoldy) popIndex++;
      this.targets.push({
        id: ent.node.id,
        stage,
        sprite,
        shroom: isMoldy ? deps.shrooms.get(ent.node.id) ?? null : null,
        popped: false,
        popAt,
      });
    }
    deps.sfx.setRain(0.85);
    deps.sfx.thunder();
    this.skipHandler = () => this.skip();
    window.addEventListener('keydown', this.skipHandler);
    window.addEventListener('pointerdown', this.skipHandler);
  }

  /** 每帧推进；返回 true 表示演出结束 */
  update(dtSec: number): boolean {
    if (this.done) return true;
    this.t += dtSec;
    const t = this.t;
    const { atmosphere, pool, sfx } = this.deps;

    // 0-1s 起雾；5-6s 退雾，交还天气驱动
    const fog = t < 1 ? smooth(0, 1, t) : t > 5 ? Math.max(0, 1 - (t - 5)) : 1;
    atmosphere.introFog = fog;

    const droplet = smooth(1, 5, t);
    for (const target of this.targets) {
      const moldy = target.stage === 'moldy';
      const wet = target.stage === 'wet';
      const droplets = droplet;
      const mold = moldy ? smooth(1, 3.2, t) : wet ? smooth(1, 5, t) : 0;
      target.sprite.setIntro(droplets, mold);

      if (!target.shroom) continue;
      const grow = smooth(target.popAt, target.popAt + 1.7, t);
      target.shroom.container.scale.set(Math.max(0.001, easeOutBack(grow)));
      if (!target.popped && t >= target.popAt) {
        target.popped = true;
        const p = target.shroom.container.position;
        sfx.pop(target.shroom.species === 'enoki' ? 1.5 : 1);
        pool.burst(p.x, p.y, 4, () => ({
          x: p.x + (Math.random() - 0.5) * 16,
          y: p.y - 4,
          vx: (Math.random() - 0.5) * 36,
          vy: -16 - Math.random() * 24,
          gravity: 18,
          color: SHROOM.spore,
          size: 1.4,
          life: 1.4,
          shape: 'circle',
          alpha: 0.9,
        }));
      }
    }

    if (t >= DURATION) this.finish();
    return this.done;
  }

  /** 跳过：直接落到终态 */
  private skip(): void {
    if (this.done) return;
    this.dropListeners();
    for (const target of this.targets) {
      target.sprite.setIntro(1, 1);
      target.shroom?.container.scale.set(1);
    }
    this.finish();
  }

  private dropListeners(): void {
    window.removeEventListener('keydown', this.skipHandler);
    window.removeEventListener('pointerdown', this.skipHandler);
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.dropListeners();
    this.deps.atmosphere.introFog = -1;
    for (const target of this.targets) {
      target.shroom?.container.scale.set(1);
    }
    // 所有替身（包括 ΔT<3d 未进入 targets 的新鲜文件）解除开场遮罩，
    // 回到真实运行时湿度/霉变状态。
    for (const sprite of this.deps.sprites.values()) sprite.finishIntro();
    this.deps.runtime.locked = false;
    this.deps.sfx.setRain(0.25);
    const needy = this.deps.runtime.entities.filter(
      (e) => e.runtime.stage !== 'fresh',
    ).length;
    this.deps.onToast(`检测到您的桌面已遭遇回南天侵袭，共有 ${needy} 个文件急需晾晒`);
    this.deps.onFinish();
  }
}
