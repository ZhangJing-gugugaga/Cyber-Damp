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
import { createMildewSurface } from './mildew-surface';
import { hash01 } from '../../world/file-seed';
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
  get artwork(): Container { return this.iconLayer; }
  get iconSize(): number { return this.node.geometry?.size ?? FILE_ICON_SIZE; }
  get iconCenterX(): number { return FILE_ICON_LEFT + this.iconSize / 2; }
  get iconRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.container.x + FILE_ICON_LEFT, y: this.container.y + FILE_ICON_TOP, w: this.iconSize, h: this.iconSize };
  }
  hit(x: number, y: number): boolean {
    const r = this.iconRect, g = this.node.geometry;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    if (!g) return false;
    const lx = this.container.x + g.labelX - (g.x - FILE_ICON_LEFT);
    const ly = this.container.y + g.labelY - (g.y - FILE_ICON_TOP);
    return x >= lx && x <= lx + g.labelWidth && y >= ly && y <= ly + g.labelHeight;
  }

  private readonly iconLayer = new Container();
  private readonly selection = new Graphics();
  private selectionKey = '';
  private readonly body = new Container();
  private readonly ghost = new Container();
  private readonly icon: Sprite | null;
  private readonly fallback = new Graphics();
  private readonly clip = new Container();
  private readonly label: FileLabel;
  private readonly surface: IconMaterialSurface;
  private lifecycle?: ReturnType<typeof createMildewSurface>;
  private introGrowth = 0;

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
    this.material.setVariation(hash01(node.id));
    this.container.position.set(node.x, node.y);
    this.container.eventMode = 'static';
    this.container.alpha = 1;

    // 图标：原生位图；缺失时才用中性纸页兜底（绝不统一灰绿 SVG）
    this.icon = texture ? new Sprite(texture) : null;
    if (this.icon) {
      this.icon.position.set(FILE_ICON_LEFT, FILE_ICON_TOP);
      this.icon.width = this.iconSize;
      this.icon.height = this.iconSize;
      this.iconLayer.addChild(this.icon);
      this.icon.filters = [this.material];
      const source = texture!.source.resource as HTMLImageElement;
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(source, 0, 0, 64, 64);
        const pixels = ctx.getImageData(0, 0, 64, 64).data;
        for (let y = 0; y < 64; y++) {
          if ([30, 31, 32, 33, 34].some((x) => pixels[(y * 64 + x) * 4 + 3] > 128)) { this.visibleTop = y * this.iconSize / 64; break; }
        }
      }
    } else {
      this.drawFallback();
      this.iconLayer.addChild(this.fallback);
    }

    this.surface = new IconMaterialSurface(this.icon, this.material);
    if (this.icon && texture) {
      this.lifecycle = createMildewSurface(texture.source.resource as CanvasImageSource,
        Math.round(hash01(node.id) * 0xffffffff), Math.ceil(this.iconSize * window.devicePixelRatio * 2),
        (u, v) => this.surface.nearestOpaque(u, v));
      this.lifecycle.update(0, 0, 0, 0);
      this.icon.texture = this.lifecycle.texture;
      this.icon.width = this.iconSize; this.icon.height = this.iconSize;
      this.icon.filters = [];
      this.container.on('destroyed', () => this.lifecycle?.destroy());
    }
    this.label = new FileLabel(node);
    const g = node.geometry;
    this.label.position.set(g ? g.labelX + g.labelWidth / 2 - (g.x - FILE_ICON_LEFT) : this.iconCenterX,
      g ? g.labelY - (g.y - FILE_ICON_TOP) : FILE_ICON_TOP + this.iconSize + 4);

    this.drawClipShape();
    this.clip.visible = false;
    this.clip.position.set(this.iconCenterX, FILE_ICON_TOP);

    this.body.pivot.set(this.iconCenterX, FILE_ICON_TOP + this.visibleTop);
    this.body.position.set(this.iconCenterX, FILE_ICON_TOP + this.visibleTop);
    this.body.addChild(
      this.iconLayer,
      this.label,
      this.clip,
    );
    this.container.addChild(this.selection, this.body, this.ghost);
  }

  /** Shell-sized feedback stays readable even when the artwork is deformed. */
  setSelection(selected: boolean, hovered: boolean, focused: boolean): void {
    const key = `${selected}:${hovered}:${focused}`;
    if (key === this.selectionKey) return;
    this.selectionKey = key;
    const g = this.selection.clear();
    if (!selected && !hovered) return;
    const geometry = this.node.geometry;
    const left = geometry ? Math.min(FILE_ICON_LEFT - 4, geometry.labelX - this.node.x - 3) : FILE_ICON_LEFT - 6;
    const right = geometry ? Math.max(FILE_ICON_LEFT + this.iconSize + 4, geometry.labelX - this.node.x + geometry.labelWidth + 3) : FILE_ICON_LEFT + this.iconSize + 6;
    const bottom = geometry ? geometry.labelY - this.node.y + geometry.labelHeight + 3 : FILE_ICON_TOP + this.iconSize + 25;
    g.roundRect(left, FILE_ICON_TOP - 4, right - left, bottom - FILE_ICON_TOP + 4, 2)
      .fill({ color: focused ? 0x78b9ec : 0xb0bdc7, alpha: selected ? 0.30 : 0.12 })
      .stroke({ color: focused ? 0xc1e3ff : 0xe0e6eb, alpha: selected ? 0.72 : 0.35, width: 1 });
  }

  mushroomHit(x: number, y: number): boolean {
    if (!this.lifecycle || !this.icon) return false;
    const local = this.icon.toLocal({ x, y });
    return this.lifecycle.hitFungus(local.x / this.icon.texture.width * 256,
      local.y / this.icon.texture.height * 256);
  }
  measureMildewOcclusion(pixels = Math.round(this.iconSize * window.devicePixelRatio)) {
    return this.lifecycle?.measureOcclusion(pixels) ?? null;
  }

  /** 蘑菇根部锚点：图标上边框中心（与 (0.5, 1.0) 锚点等价） */
  get mushroomAnchor(): { x: number; y: number } {
    return {
      x: this.container.position.x + this.iconCenterX,
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
  setIntroGrowth(growth: number): void { this.introGrowth = clamp01(growth); }

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
    const ordinary = rt.mushroom && (rt.mushroom.species === 'oyster' || rt.mushroom.species === 'enoki');
    this.lifecycle?.update(h, m, ordinary ? rt.mushroom!.growth * (this.introActive ? this.introGrowth : 1) : 0, tSec);
    // Reuse the existing scorch/crease shader. Mildew itself is already drawn
    // into the lifecycle texture, so it must not be applied a second time.
    this.material.update(0, 0, char, dryness, tSec, 0);
    const shrink = 1 - dryness * 0.28;
    const pivotY = this.pinned ? FILE_ICON_TOP + this.visibleTop : FILE_ICON_TOP + this.iconSize / 2;
    this.iconLayer.pivot.set(this.iconCenterX, pivotY); this.iconLayer.position.set(this.iconCenterX, pivotY);
    this.iconLayer.scale.set(shrink, 1 - dryness * 0.18);
    // Existing filter supplies gentle local swelling without changing Shell bounds.
    this.bulge.radius = this.iconSize * .65;
    this.bulge.strength = h > .35 ? (h - .35) * .12 : 0;
    this.visualTop = pivotY + (FILE_ICON_TOP + this.visibleTop - pivotY) * (1 - dryness * 0.18);
    this.label.update(h, char, this.wrung);
    this.clip.position.y = FILE_ICON_TOP + this.visibleTop;
    if (this.icon) {
      this.icon.tint = 0xffffff;
      if (this.twist.angle === 0) this.icon.filters = [
        ...(char > 0 || dryness > 0 ? [this.material] : []),
        ...(this.bulge.strength > 0 ? [this.bulge] : []),
      ];
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
