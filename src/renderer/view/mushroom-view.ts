/**
 * 蘑菇渲染（view 层）—— P0 平菇 N + 金针菇 R；complex杂交形态搁置
 * 三帧破土动画（土壤隆起 → 菌盖顶开 → 抖落孢子），由 growth 0..1 驱动
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { mushroomTexture } from './mushroom-assets';
import type { MushroomSpecies, MushroomState } from '../../shared/types/file-runtime';
import { SHROOM } from './token-colors';

/** 平菇：灰褐扇形菌盖叠生（cap/gill/stem 三色） */
function drawOyster(g: Graphics, growth: number): void {
  const s = 0.3 + growth * 0.7;
  const capW = 18 * s;
  const capH = 9 * s;
  const stemH = 12 * s;
  // 根部接地阴影（y=0 即图标上边框，零间隙）
  g.ellipse(0, 0, 6 * s, 2 * s).fill({ color: SHROOM.rootShadow, alpha: 0.5 });
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
  // 根部接地阴影
  g.ellipse(0, 0, 6 * s, 2 * s).fill({ color: SHROOM.rootShadow, alpha: 0.45 });
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
  // 根部接地阴影
  g.ellipse(0, 0, 5 * s, 2 * s).fill({ color: SHROOM.rootShadow, alpha: 0.45 });
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
  private farSince = 0;
  private readonly art: Sprite | null;
  private readonly stemMask = new Graphics().rect(-64, -128, 128, 128).fill(0xffffff);
  private readonly fuse = new Graphics();
  private readonly artHeight: number;
  private hitPixels: { data: Uint8ClampedArray; width: number; height: number } | null | undefined;

  constructor(readonly species: MushroomSpecies) {
    this.artHeight = species === 'lava' ? 68 : species === 'bolete' ? 42 : species === 'shy' ? 46 : 36;
    this.container.addChild(this.g);
    const texture = mushroomTexture(species);
    this.art = texture ? new Sprite(texture) : null;
    if (this.art) {
      this.art.anchor.set(0.5, 1);
      const height = this.artHeight;
      this.art.height = height;
      this.art.width = height * this.art.texture.width / this.art.texture.height;
      this.container.addChild(this.art);
      this.art.mask = this.stemMask;
      this.container.addChild(this.stemMask);
    }
    this.container.addChild(this.fuse);
    this.update(1, 0);
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
      if (d <= 120) this.farSince = tSec;
      const target = d <= 120 || tSec - this.farSince < 2 ? 1 : 0;
      const delta = dt / (target ? 0.14 : 0.3);
      this.retract = target ? Math.min(1, this.retract + delta) : Math.max(0, this.retract - delta);
    }

    if (this.art) {
      const grown = Math.max(0.02, Math.min(1, growth));
      this.art.scale.set(this.artHeight / this.art.texture.height * grown);
      this.art.y = this.species === 'shy' ? this.retract * Math.max(0, 46 * grown - 2) : 0;
      this.art.rotation = growth >= 1 ? Math.sin(tSec * 1.8) * 0.035 : 0;
      return;
    }

    // 土壤隆起（growth<0.3：只露土堆）
    if (growth < 0.3) {
      this.g.position.y = 0;
      const k = growth / 0.3;
      this.g.ellipse(0, 0, 10 * k, 4 * k).fill({ color: SHROOM.oysterStem, alpha: 0.6 });
    } else {
      // 根部锚点固定 (0.5, 1.0)：g 的 y 偏移必须为 0，否则蘑菇会悬浮在图标上方
      this.g.position.y = 0;
      if (this.species === 'enoki') drawEnoki(this.g, growth, tSec);
      else if (this.species === 'shy') drawShy(this.g, growth, tSec);
      else drawOyster(this.g, growth);
      // 成熟后轻微晃动（可采摘信号）——绕根部旋转，根不离开图标上边缘
      if (growth >= 1) this.g.rotation = Math.sin(tSec * 1.2) * 0.05;
      else this.g.rotation = 0;
    }
  }

  setCondition(m: MushroomState, time: number): void {
    if (this.art && m.species === 'bolete') this.art.tint = (m.cooking ?? 0) >= 1 ? 0xc09062 : 0xffffff;
    this.fuse.clear();
    if (m.species !== 'lava' || m.growth < 1) return;
    const remaining = m.lavaSeconds ?? 12;
    const pulse = 1 + Math.sin(time * (15 - remaining)) * 0.035;
    if (this.art) this.art.scale.set(this.artHeight / this.art.texture.height * pulse);
    for (let i = 0; i < Math.ceil(remaining); i++) {
      const angle = i / 12 * Math.PI * 2;
      this.fuse.circle(Math.cos(angle) * 25, -49 + Math.sin(angle) * 18, 1.8)
        .fill({ color: remaining < 4 ? 0xffefb2 : 0xf07535, alpha: 0.8 });
    }
  }
  setDetached(): void { this.fuse.visible = false; }

  /** Hits only visible mushroom pixels, including the mask's two-pixel shy tip. */
  hit(x: number, y: number): boolean {
    if (!this.container.visible || this.container.alpha <= 0 || this.container.destroyed) return false;
    const point = { x, y };
    if (!this.art) return this.g.containsPoint(this.g.toLocal(point));
    const bounds = this.art.getBounds();
    if (x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height) return false;
    const clipPoint = this.stemMask.toLocal(point);
    if (clipPoint.x < -64 || clipPoint.x > 64 || clipPoint.y < -128 || clipPoint.y > 0) return false;
    const texture = this.art.texture, frame = texture.frame;
    if (this.hitPixels === undefined) {
      this.hitPixels = null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(frame.width); canvas.height = Math.ceil(frame.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(texture.source.resource as CanvasImageSource,
            frame.x, frame.y, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
          this.hitPixels = { data: context.getImageData(0, 0, canvas.width, canvas.height).data,
            width: canvas.width, height: canvas.height };
        }
      } catch { /* Keep strict art/mask bounds when a non-raster fallback cannot be sampled. */ }
    }
    const local = this.art.toLocal(point);
    const u = local.x / texture.orig.width + this.art.anchor.x;
    const v = local.y / texture.orig.height + this.art.anchor.y;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
    if (!this.hitPixels) return true;
    const mask = this.hitPixels;
    return mask.data[(Math.floor(v * mask.height) * mask.width + Math.floor(u * mask.width)) * 4 + 3] > 32;
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
