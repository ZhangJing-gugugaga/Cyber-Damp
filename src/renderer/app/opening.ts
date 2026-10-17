/**
 * 开场「时光坍缩」3s 精简版演出（app 装配层）
 * 分镜（DESIGN §6.2 压缩）：起雾返潮 → 老文件湿度/霉变斜坡 → 蘑菇破土+啵声 → toast 报数交还控制权
 * 演出期间输入锁定（runtime.locked）+ 强制穿透；任意键/点击可跳过
 */
import type { WorldRuntime } from './world-runtime';
import type { Atmosphere } from './atmosphere';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';
import type { MushroomView } from '../view/mushroom-view';
import { SHROOM } from '../view/token-colors';

const DURATION = 3.0; // AC-01：3s 完成初始化演出，≤10s 解锁交互

export interface OpeningDeps {
  runtime: WorldRuntime;
  atmosphere: Atmosphere;
  pool: ParticlePool;
  sfx: Sfx;
  /** 蘑菇视图已由 game 建好：id → view；演出控制其 growth 从 0 弹出 */
  shrooms: Map<string, MushroomView>;
  onToast(text: string): void;
  onFinish(): void;
}

interface ShroomSpawn {
  id: string;
  at: number;
  popped: boolean;
}

export class Opening {
  private t = 0;
  private done = false;
  private targets = new Map<string, { humidity: number; mold: number; baseH: number; baseM: number }>();
  private spawns: ShroomSpawn[] = [];
  private popIndex = 0;
  private skipHandler: () => void;

  constructor(private deps: OpeningDeps) {
    const { runtime } = deps;
    // 目标斜坡：按阶段定湿度/霉变终值；起点为当前值（读档恢复时近似无缝）
    for (const t of runtime.introTargets()) {
      const ent = runtime.byId.get(t.id)!;
      this.targets.set(t.id, {
        humidity: t.humidity,
        mold: t.mold,
        baseH: ent.runtime.humidity,
        baseM: ent.runtime.mold,
      });
      if (t.moldy) {
        this.spawns.push({ id: t.id, at: 2.0 + this.spawns.length * 0.22, popped: false });
      }
    }
    deps.sfx.setRain(0.8);
    this.skipHandler = () => this.skip();
    window.addEventListener('keydown', this.skipHandler, { once: false });
    window.addEventListener('pointerdown', this.skipHandler, { once: false });
  }

  /** 每帧推进；返回 true 表示演出结束 */
  update(dtSec: number): boolean {
    if (this.done) return true;
    this.t += dtSec;
    const { runtime, atmosphere, shrooms } = this.deps;

    // 0-1s 起雾（introFog 覆盖天气驱动）
    const fog = this.t < 1 ? this.t : Math.max(0, 1 - (this.t - 2.4) / 0.6) * 0.9;
    atmosphere.introFog = Math.min(1, fog);

    // 0.8-2.8s 湿度/霉变斜坡（easeInOut）
    const p = Math.min(1, Math.max(0, (this.t - 0.8) / 2.0));
    const e = p * p * (3 - 2 * p);
    for (const [id, tgt] of this.targets) {
      const rt = runtime.byId.get(id)?.runtime;
      if (!rt) continue;
      rt.humidity = tgt.baseH + (tgt.humidity - tgt.baseH) * e;
      rt.mold = Math.max(rt.mold, tgt.baseM + (tgt.mold - tgt.baseM) * e);
    }

    // 2.0s+ 蘑菇破土（啵声音高随稀有度）
    for (const s of this.spawns) {
      if (!s.popped && this.t >= s.at) {
        s.popped = true;
        const view = this.deps.shrooms.get(s.id);
        if (view) {
          view.container.scale.set(0.1);
          const isR = view.species === 'enoki';
          this.deps.sfx.pop(isR ? 1.5 : 1);
          this.deps.pool.burst(view.container.position.x, view.container.position.y, 4, () => ({
            x: view.container.position.x,
            y: view.container.position.y,
            vx: (Math.random() - 0.5) * 30,
            vy: -14 - Math.random() * 20,
            gravity: 16,
            color: SHROOM.spore,
            size: 1.4,
            life: 1.5,
            shape: 'circle',
            alpha: 0.9,
          }));
        }
      }
    }
    // 已弹出蘑菇生长恢复
    this.popIndex = this.spawns.filter((s) => s.popped).length;
    for (const s of this.spawns) {
      if (!s.popped) continue;
      const view = this.deps.shrooms.get(s.id);
      if (view) {
        const g = Math.min(1, (this.t - s.at) / 0.5);
        view.container.scale.set(0.1 + g * 0.9);
      }
    }

    if (this.t >= DURATION) this.finish();
    return this.done;
  }

  /** 跳过：直接落到终态 */
  private skip(): void {
    if (this.done) return;
    for (const [id, tgt] of this.targets) {
      const rt = this.deps.runtime.byId.get(id)?.runtime;
      if (rt) {
        rt.humidity = tgt.humidity;
        rt.mold = Math.max(rt.mold, tgt.mold);
      }
    }
    for (const s of this.spawns) {
      const view = this.deps.shrooms.get(s.id);
      view?.container.scale.set(1);
    }
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.deps.atmosphere.introFog = -1;
    this.deps.runtime.locked = false;
    window.removeEventListener('keydown', this.skipHandler);
    window.removeEventListener('pointerdown', this.skipHandler);

    // toast 报数交还控制权（AC-01 / DESIGN §6.2 8-10s 分镜文案）
    const needy = this.deps.runtime.entities.filter(
      (e) => e.runtime.humidity > 0.4 || e.runtime.mold > 0.3,
    ).length;
    this.deps.sfx.setRain(0.25);
    this.deps.onToast(`检测到您的桌面已遭遇回南天侵袭，共有 ${needy} 个文件急需晾晒`);
    this.deps.onFinish();
  }
}
