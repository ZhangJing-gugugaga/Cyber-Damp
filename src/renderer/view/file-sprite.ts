/**
 * 文件替身渲染（view 层）——真实系统图标 + 受潮表现
 *
 * 硬约束：
 * - 图标 100% 来自主进程 app.getFileIcon / Shell 原生提取，opacity 恒为 1.0；
 * - 霉斑使用 mix-blend-mode: multiply（Pixi blendMode 'multiply'）并严格裁在图标轮廓内，
 *   严禁在图标外围画半透明绿色圆圈；
 * - 夹子只在 PINNED 状态可见；GRID / DRAGGING 绝不渲染夹子；
 * - 标签在绳上收窄到 68px，配合 72px 最小弧长间距，杜绝文字遮挡。
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { TwistFilter, BulgePinchFilter } from 'pixi-filters';
import { MaterialFilter } from './shaders/material-filter';
import { FileLabel } from './file-label';
import { IconMaterialSurface } from './icon-material-surface';
import { propTexture } from './mushroom-assets';
import type { FileNode } from '../../shared/types/file-node';
import type { FileRuntime } from '../../shared/types/file-runtime';
import {
  ENV_COLOR,
  FILE_CELL_W,
  FILE_ICON_LEFT,
  FILE_ICON_SIZE,
  FILE_ICON_TOP,
  INK,
} from './token-colors';

/** 原生图标 PNG data URL → Pixi 纹理（异步解码；失败返回 null 走矢量兜底） */
export function loadNativeIcon(dataUrl: string): Promise<Texture | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(Texture.from(image));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class FileSprite {
  readonly container = new Container();
  readonly node: FileNode;

  private readonly iconLayer = new Container();
  private readonly body = new Container();
  private readonly ghost = new Container();
  private readonly icon: Sprite | null;
  private readonly fallback = new Graphics();
  private readonly clip = new Container();
  private readonly label: FileLabel;
  private readonly surface: IconMaterialSurface;

  /** 开场演出揭示系数（0..1）；演出结束后固定为 1 */
  private introDroplets = 0;
  private introMold = 0;
  private introActive = true;
  private pinned = false;
  private readonly material = new MaterialFilter();
  private readonly twist = new TwistFilter({ radius: 46, angle: 0, offset: { x: 32, y: 32 }, padding: 0 });
  private readonly bulge = new BulgePinchFilter({ center: { x: 0.5, y: 0.5 }, radius: 40, strength: 0 });
  private wrung = false;
  private visibleTop = 0;
  private visualTop = FILE_ICON_TOP;
  private scatterAngle = 0;

  constructor(node: FileNode, texture: Texture | null) {
    this.node = node;
    this.container.position.set(node.x, node.y);
    this.container.eventMode = 'static';
    this.container.alpha = 1;

    // 图标：原生位图；缺失时才用中性纸页兜底（绝不统一灰绿 SVG）
    this.icon = texture ? new Sprite(texture) : null;
    if (this.icon) {
      this.icon.position.set(FILE_ICON_LEFT, FILE_ICON_TOP);
      this.icon.width = FILE_ICON_SIZE;
      this.icon.height = FILE_ICON_SIZE;
      this.iconLayer.addChild(this.icon);
      this.icon.filters = [this.material];
      const source = texture!.source.resource as HTMLImageElement;
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(source, 0, 0, 64, 64);
        const pixels = ctx.getImageData(0, 0, 64, 64).data;
        for (let y = 0; y < 64; y++) {
          if ([30, 31, 32, 33, 34].some((x) => pixels[(y * 64 + x) * 4 + 3] > 128)) { this.visibleTop = y; break; }
        }
      }
    } else {
      this.drawFallback();
      this.iconLayer.addChild(this.fallback);
    }

    this.surface = new IconMaterialSurface(this.icon, this.material);
    this.label = new FileLabel(node);
    this.label.position.set(FILE_CELL_W / 2, FILE_ICON_TOP + FILE_ICON_SIZE + 4);

    this.drawClipShape();
    this.clip.visible = false;
    this.clip.position.set(FILE_CELL_W / 2, FILE_ICON_TOP);

    this.body.pivot.set(50, FILE_ICON_TOP + this.visibleTop);
    this.body.position.set(50, FILE_ICON_TOP + this.visibleTop);
    this.body.addChild(
      this.iconLayer,
      this.label,
      this.clip,
    );
    this.container.addChild(this.body, this.ghost);
  }

  /** 蘑菇根部锚点：图标上边框中心（与 (0.5, 1.0) 锚点等价） */
  get mushroomAnchor(): { x: number; y: number } {
    return {
      x: this.container.position.x + FILE_CELL_W / 2,
      y: this.container.position.y + this.visualTop,
    };
  }

  get dripOrigin(): { x: number; y: number } {
    return this.surface.dripOrigin ?? { x: this.container.x + 50, y: this.container.y + 68 };
  }
  get mediaDripColor(): number { return this.surface.pigmentColor; }
  paintHit(x: number, y: number): { u: number; v: number } | null { return this.surface.hit(x, y); }
  addPaintStain(u: number, v: number, color: number): void { this.surface.addStain(u, v, color); }
  clearPaintStains(): void { this.surface.clearStains(); }

  /** 仅 PINNED 状态显示木夹子 */
  setPinned(pinned: boolean): void {
    if (this.pinned === pinned) return;
    this.pinned = pinned;
    if (pinned) this.scatterAngle = 0;
    this.clip.visible = pinned;
    this.label.setPinned(pinned);
  }

  /** 开场 6 秒演出：按 mtime 分档的揭示进度 */
  setIntro(droplets: number, mold: number): void {
    this.introDroplets = clamp01(droplets);
    this.introMold = clamp01(mold);
  }

  /** 演出结束：回到真实运行时状态 */
  finishIntro(): void {
    this.introActive = false;
    this.introDroplets = 1;
    this.introMold = 1;
  }

  setWring(angle: number, finished = false): void {
    this.twist.angle = Math.min(9, angle * 0.6);
    this.wrung ||= finished;
    if (this.icon) this.icon.filters = angle > 0.1 ? [this.material, this.twist] : [this.material];
  }

  previewPin(point: {x:number;y:number} | null): void {
    if (!point) { this.ghost.visible = false; return; }
    if (!this.ghost.children.length) {
      const texture = propTexture('clip'); if (!texture) return;
      const image = new Sprite(texture); image.anchor.set(0.5, 1);
      image.height = 27; image.width = 27 * texture.width / texture.height;
      this.ghost.addChild(image); this.ghost.alpha = 0.4;
    }
    this.ghost.position.set(point.x - this.container.x, point.y - this.container.y + 5);
    this.ghost.visible = true;
  }

  setSwing(time: number, wind: number): void {
    const weight = Math.max(1, Math.log10(this.node.sizeBytes + 10));
    this.body.rotation = this.pinned ? Math.sin(time * 5 / Math.sqrt(weight)) * wind * 0.5 / Math.sqrt(weight) : this.scatterAngle;
  }
  setScatterAngle(angle: number): void { this.scatterAngle = angle; }

  /** 每帧幂等刷新（game loop 调用） */
  update(rt: FileRuntime, tSec: number): void {
    const h = clamp01(rt.humidity) * (this.introActive ? this.introDroplets : 1);
    const m = clamp01(rt.mold) * (this.introActive ? this.introMold : 1);
    const dryness = (rt.dryness || 0) * (this.introActive ? this.introMold : 1);
    const char = this.introActive ? rt.char * this.introMold : rt.char;
    this.material.update(h, m, char, dryness, tSec, this.node.category === 'image-video' ? h : 0);
    const shrink = 1 - dryness * 0.2 - char * 0.1;
    const pivotY = this.pinned ? FILE_ICON_TOP + this.visibleTop : 36;
    this.iconLayer.pivot.set(50, pivotY); this.iconLayer.position.set(50, pivotY);
    this.iconLayer.scale.set(shrink);
    this.visualTop = pivotY + (FILE_ICON_TOP + this.visibleTop - pivotY) * shrink;
    this.label.update(h, char, this.wrung);
    this.clip.position.y = FILE_ICON_TOP + this.visibleTop;
    if (this.icon) {
      this.icon.tint = 0xffffff;
      if (this.twist.angle === 0 && this.node.category === 'archive' && this.node.kind !== 'recycle') {
        this.bulge.strength = h * 0.28;
        this.icon.filters = h > 0.3 ? [this.material, this.bulge] : [this.material];
      }
    }
    // Material shader samples the actual source alpha. Rectangle masks and
    // floating green circles are deliberately no longer part of the icon.
  }

  /** 木夹子（只画一次，靠 visible 切换） */
  private drawClipShape(): void {
    const texture = propTexture('clip');
    if (texture) {
      const image = new Sprite(texture); image.anchor.set(0.5, 1);
      image.height = 27; image.width = 27 * texture.width / texture.height;
      image.y = 5; this.clip.addChild(image); return;
    }
    const g = new Graphics(); this.clip.addChild(g);
    g.moveTo(-9, -5).lineTo(-3, -5).lineTo(0.5, 17).lineTo(-6, 17).closePath()
      .fill({ color: 0xa88b5f })
      .stroke({ width: 1, color: 0x6f5636 });
    g.moveTo(3, -5).lineTo(9, -5).lineTo(6, 17).lineTo(-0.5, 17).closePath()
      .fill({ color: 0x8a6c45 })
      .stroke({ width: 1, color: 0x6f5636 });
    g.circle(0, 7, 3.2).fill({ color: ENV_COLOR.coin, alpha: 0.85 });
    g.circle(0, 7, 1.4).fill({ color: 0x5a4526 });
    // 夹口高光
    g.moveTo(-7, -3).lineTo(-4, -3).stroke({ width: 1, color: 0xd9c39a, alpha: 0.6 });
  }

  /** 原生图标缺失时的中性纸页兜底（非统一灰绿图标，且只做兜底） */
  private drawFallback(): void {
    const g = this.fallback;
    const x = FILE_ICON_LEFT;
    const y = FILE_ICON_TOP;
    const s = FILE_ICON_SIZE;
    g.roundRect(x + 4, y + 2, s - 8, s - 4, 6)
      .fill({ color: INK.paper })
      .stroke({ width: 1, color: INK.panel, alpha: 0.35 });
    g.moveTo(x + s - 20, y + 2).lineTo(x + s - 20, y + 18).lineTo(x + s - 4, y + 18)
      .fill({ color: INK.paper2 });
    for (let i = 0; i < 4; i++) {
      g.moveTo(x + 12, y + 28 + i * 7)
        .lineTo(x + s - 12, y + 28 + i * 7)
        .stroke({ width: 1.5, color: INK.muted, alpha: 0.55 });
    }
    if (this.node.ext) {
      const badge = new Text({
        text: this.node.ext.toUpperCase().slice(0, 4),
        style: {
          fontFamily: '"Microsoft YaHei", sans-serif',
          fontSize: 9,
          fontWeight: '600',
          fill: INK.card,
        },
      });
      badge.anchor.set(0.5, 0.5);
      badge.position.set(x + s / 2, y + s / 2 + 8);
      this.fallback.addChild(badge);
    }
  }
}
