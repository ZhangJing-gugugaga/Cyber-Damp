/**
 * 蘑菇渲染（view 层）—— P0 平菇 N + 金针菇 R；complex杂交形态搁置
 * 三帧破土动画（土壤隆起 → 菌盖顶开 → 抖落孢子），由 growth 0..1 驱动
 */
import { Container, Graphics } from 'pixi.js';
import type { MushroomSpecies } from '../../shared/types/file-runtime';
import { SHROOM } from './token-colors';

/** 平菇：灰褐扇形菌盖叠生（cap/gill/stem 三色） */
function drawOyster(g: Graphics, growth: number): void {
  const s = 0.3 + growth * 0.7;
  const capW = 18 * s;
  const capH = 9 * s;
  const stemH = 12 * s;
  // 菌柄
  g.roundRect(-2.5 * s, -stemH, 5 * s, stemH, 2 * s).fill({ color: SHROOM.oysterStem });
  // 菌褶（菌盖下缘）
  g.ellipse(0, -stemH + 2, capW * 0.85, capH * 0.45).fill({ color: SHROOM.oysterGill });
  // 菌盖（扇形）
  g.moveTo(-capW, -stemH + 2)
    .quadraticCurveTo(0, -stemH - capH * 2.2, capW, -stemH + 2)
    .closePath().fill({ color: SHROOM.oysterCap });
}

/** 金针菇：米白细束，菌盖未开呈笔尖状，菌丝泛荧光绿光晕 */
function drawEnoki(g: Graphics, growth: number, tSec: number): void {
  const s = 0.3 + growth * 0.7;
  const glow = 0.08 + Math.sin(tSec * 1.6) * 0.03;
  // 菌丝荧光光晕（呼吸）
  g.circle(0, -10 * s, 10 * s).fill({ color: SHROOM.enokiGlow, alpha: glow });
  // 细束菌柄（3-4 根）
  for (let i = -1; i <= 1; i++) {
    g.roundRect(i * 3 * s - 1.2 * s, -16 * s, 2.4 * s, 16 * s, 1.2 * s)
      .fill({ color: SHROOM.enokiBody });
  }
  // 未开菌盖（笔尖）
  g.moveTo(-3 * s, -16 * s).lineTo(0, -24 * s).lineTo(3 * s, -16 * s)
    .closePath().fill({ color: SHROOM.enokiBody });
}

/** 胆小菇（AC-30）：修长烟紫菌柄 + 菌盖下拟真小眼 */
function drawShy(g: Graphics, growth: number, tSec: number): void {
  const s = 0.3 + growth * 0.7;
  const stemH = 22 * s;
  // 修长菌柄（烟紫，低饱和）
  g.roundRect(-2.2 * s, -stemH, 4.4 * s, stemH, 2 * s).fill({ color: SHROOM.shyStem });
  // 小菌盖（藏眼位）
  g.ellipse(0, -stemH, 8 * s, 4 * s).fill({ color: SHROOM.shyStem });
  // 拟真小眼（会眨：每 4s 闭 0.15s）
  const blink = tSec % 4 > 3.85 ? 0.15 : 1;
  g.ellipse(1.5 * s, -stemH - 1 * s, 2.2 * s, 2.6 * s * blink).fill({ color: SHROOM.shyEye });
  g.circle(2.2 * s, -stemH - 1 * s, 0.9 * s * blink).fill({ color: SHROOM.shyPupil });
}

export class MushroomView {
  readonly container = new Container();
  private readonly g = new Graphics();
  /** 胆小菇缩头进度 0..1（1=缩回） */
  private retract = 0;
  private lastT = 0;

  constructor(readonly species: MushroomSpecies) {
    this.container.addChild(this.g);
  }

  /**
   * growth 0..1 破土生长；tSec 用于呼吸/光晕/眨眼；
   * pointer 传入时胆小菇执行 120px 缩头（AC-30：0.2s 内缩回，移远恢复）
   */
  update(growth: number, tSec: number, pointer?: { x: number; y: number }): void {
    const dt = Math.max(0, Math.min(0.1, tSec - this.lastT));
    this.lastT = tSec;
    this.g.clear();

    if (this.species === 'shy' && pointer) {
      const d = Math.hypot(pointer.x - this.container.position.x, pointer.y - this.container.position.y);
      const target = d < 120 ? 1 : 0;
      const k = Math.min(1, dt / 0.2); // 0.2s 内完成
      this.retract += (target - this.retract) * k;
      this.container.scale.set(Math.max(0.1, 1 - this.retract * 0.9));
    }

    // 土壤隆起（growth<0.3：只露土堆）
    if (growth < 0.3) {
      const k = growth / 0.3;
      this.g.ellipse(0, 0, 10 * k, 4 * k).fill({ color: SHROOM.oysterStem, alpha: 0.6 });
    } else {
      this.g.position.y = -(growth - 0.3) * 6;
      if (this.species === 'enoki') drawEnoki(this.g, growth, tSec);
      else if (this.species === 'shy') drawShy(this.g, growth, tSec);
      else drawOyster(this.g, growth);
      // 成熟后轻微晃动（可采摘信号）
      if (growth >= 1) this.g.rotation = Math.sin(tSec * 1.2) * 0.05;
      else this.g.rotation = 0;
    }
  }

  /** 稀有度角标（N/R 字母，11px 等效） */
  drawBadge(): void {
    const badge = new Graphics();
    badge.circle(14, -26, 6).fill({ color: 0xF2EDE0, alpha: 0.9 });
    this.container.addChild(badge);
  }
}

/** 金针菇剪下：掉落 0/1 粒子（等宽字形以矩形近似） */
export function binaryParticleTextures(): { glyph: string; w: number }[] {
  return [
    { glyph: '0', w: 5 },
    { glyph: '1', w: 3 },
  ];
}