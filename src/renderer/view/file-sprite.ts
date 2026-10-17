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
import type { FileNode } from '../../shared/types/file-node';
import type { FileRuntime } from '../../shared/types/file-runtime';
import {
  DAMP,
  ENV_COLOR,
  FILE_CELL_W,
  FILE_ICON_LEFT,
  FILE_ICON_SIZE,
  FILE_ICON_TOP,
  FILE_RADIUS,
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

function mixTint(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * k) << 16) |
    (Math.round(ag + (bg - ag) * k) << 8) |
    Math.round(ab + (bb - ab) * k)
  );
}

/** 稳定伪随机（同一文件每帧图案一致，不闪烁） */
function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export class FileSprite {
  readonly container = new Container();
  readonly node: FileNode;

  private readonly iconLayer = new Container();
  private readonly icon: Sprite | null;
  private readonly fallback = new Graphics();
  private readonly maskG = new Graphics();
  private readonly maskDroplets = new Graphics();
  private readonly mold = new Graphics();
  private readonly droplets = new Graphics();
  private readonly clip = new Graphics();
  private readonly label: Text;

  /** 开场演出揭示系数（0..1）；演出结束后固定为 1 */
  private introDroplets = 0;
  private introMold = 0;
  private introActive = true;
  private pinned = false;

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
    } else {
      this.drawFallback();
      this.iconLayer.addChild(this.fallback);
    }

    // 霉斑裁切轮廓：只允许在图标内部（圆角矩形）
    this.maskG
      .roundRect(FILE_ICON_LEFT, FILE_ICON_TOP, FILE_ICON_SIZE, FILE_ICON_SIZE, FILE_RADIUS)
      .fill(0xffffff);
    this.maskDroplets
      .roundRect(FILE_ICON_LEFT, FILE_ICON_TOP, FILE_ICON_SIZE, FILE_ICON_SIZE, FILE_RADIUS)
      .fill(0xffffff);
    this.mold.blendMode = 'multiply';
    this.mold.mask = this.maskG;
    this.droplets.mask = this.maskDroplets;

    this.label = new Text({
      text: node.name,
      style: {
        fontFamily: '"Microsoft YaHei", "Noto Sans SC", sans-serif',
        fontSize: 10,
        fill: DAMP.label,
        stroke: { color: INK.panel, width: 3 },
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 92,
        lineHeight: 12,
        breakWords: true,
      },
    });
    this.label.anchor.set(0.5, 0);
    this.label.position.set(FILE_CELL_W / 2, FILE_ICON_TOP + FILE_ICON_SIZE + 4);

    this.drawClipShape();
    this.clip.visible = false;
    this.clip.position.set(FILE_CELL_W / 2, FILE_ICON_TOP);

    this.container.addChild(
      this.iconLayer,
      this.mold,
      this.droplets,
      this.label,
      this.clip,
      this.maskG,
      this.maskDroplets,
    );
  }

  /** 蘑菇根部锚点：图标上边框中心（与 (0.5, 1.0) 锚点等价） */
  get mushroomAnchor(): { x: number; y: number } {
    return {
      x: this.container.position.x + FILE_CELL_W / 2,
      y: this.container.position.y + FILE_ICON_TOP,
    };
  }

  /** 仅 PINNED 状态显示木夹子 */
  setPinned(pinned: boolean): void {
    if (this.pinned === pinned) return;
    this.pinned = pinned;
    this.clip.visible = pinned;
    if (pinned) {
      this.label.style.fontSize = 9;
      this.label.style.lineHeight = 10;
      this.label.style.wordWrapWidth = 68;
    } else {
      this.label.style.fontSize = 10;
      this.label.style.lineHeight = 12;
      this.label.style.wordWrapWidth = 92;
    }
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

  /** 每帧幂等刷新（game loop 调用） */
  update(rt: FileRuntime, tSec: number): void {
    const h = clamp01(rt.humidity) * (this.introActive ? this.introDroplets : 1);
    const m = clamp01(rt.mold) * (this.introActive ? this.introMold : 1);

    // 图标色调：受潮偏冷、焦化偏褐；alpha 恒 1.0
    let tint = 0xffffff;
    if (rt.char > 0.05) {
      tint = mixTint(0xffffff, DAMP.char, Math.min(1, rt.char * 1.4));
    } else if (h > 0.2) {
      tint = mixTint(0xffffff, DAMP.water, 0.16 + h * 0.22);
    }
    if (this.icon) this.icon.tint = tint;
    this.fallback.tint = tint;

    // 标签墨洇（文字仍完整可见，只做轻微冷色/透明度变化）
    this.label.alpha = h > 0.65 ? 0.76 : h > 0.35 ? 0.88 : 1;
    this.label.tint = h > 0.35 ? mixTint(0xffffff, DAMP.water, 0.3) : 0xffffff;

    this.drawDroplets(h, tSec);
    this.drawMold(m, tSec);
  }

  /** 高光水珠粒子（ΔT 3-14 天分支；1~5s 内由 introDroplets 浮现） */
  private drawDroplets(h: number, tSec: number): void {
    this.droplets.clear();
    if (h <= 0.16) return;
    const count = Math.min(11, 2 + Math.round(h * 10));
    for (let i = 0; i < count; i++) {
      const rx = hash01(this.node.id, 100 + i);
      const ry = hash01(this.node.id, 500 + i);
      const x = FILE_ICON_LEFT + 6 + rx * (FILE_ICON_SIZE - 12);
      const y = FILE_ICON_TOP + 5 + ry * (FILE_ICON_SIZE - 12);
      const r = 1.3 + hash01(this.node.id, 900 + i) * 3.0;
      const pulse = 0.72 + Math.sin(tSec * 2.1 + i * 1.7) * 0.18;
      // 水珠主体（半透明水色）+ 左上高光
      this.droplets.ellipse(x, y, r, r * 1.18).fill({ color: DAMP.water, alpha: 0.5 * pulse });
      this.droplets
        .circle(x - r * 0.3, y - r * 0.35, Math.max(0.6, r * 0.32))
        .fill({ color: DAMP.waterHi, alpha: 0.8 * pulse });
      // 少量水珠下拉出 1-2px 的高光尾
      if (i % 4 === 0) {
        this.droplets
          .moveTo(x, y + r * 1.1)
          .lineTo(x, y + r * 1.1 + 1.8)
          .stroke({ width: 0.8, color: DAMP.waterHi, alpha: 0.45 * pulse });
      }
    }
  }

  /**
   * 毛绒状暗绿霉斑：从四角向图标内部蔓延。
   * blendMode = multiply；mask 限定在图标圆角轮廓内 —— 外围不会出现绿色圆圈。
   */
  private drawMold(m: number, tSec: number): void {
    this.mold.clear();
    if (m <= 0.015) return;
    const cx = FILE_ICON_LEFT + FILE_ICON_SIZE / 2;
    const cy = FILE_ICON_TOP + FILE_ICON_SIZE / 2;
    // 只在四角蔓延，保留图标中心可辨认；覆盖随 m 增长但不吞没整张图标
    const spread = 4 + m * 15;

    const corners: Array<[number, number]> = [
      [FILE_ICON_LEFT + 2, FILE_ICON_TOP + 2],
      [FILE_ICON_LEFT + FILE_ICON_SIZE - 2, FILE_ICON_TOP + 2],
      [FILE_ICON_LEFT + 2, FILE_ICON_TOP + FILE_ICON_SIZE - 2],
      [FILE_ICON_LEFT + FILE_ICON_SIZE - 2, FILE_ICON_TOP + FILE_ICON_SIZE - 2],
    ];

    corners.forEach(([bx, by], ci) => {
      const dirX = bx < cx ? 1 : -1;
      const dirY = by < cy ? 1 : -1;
      const lobes = 6;
      for (let k = 0; k < lobes; k++) {
        const jx = hash01(this.node.id, ci * 37 + k * 3);
        const jy = hash01(this.node.id, ci * 53 + k * 5 + 900);
        const reach = (0.2 + jx * 0.8) * spread;
        const x = bx + dirX * reach * (0.35 + jx * 0.65) + (jx - 0.5) * 6;
        // 毛绒边缘：呼吸式微抖动（只改绘制，不改物理）
        const flutter = Math.sin(tSec * 0.9 + k + ci) * 0.7;
        const y = by + dirY * reach * (0.35 + jy * 0.65) + (jy - 0.5) * 6 + flutter;
        const r = 1.4 + hash01(this.node.id, ci * 71 + k * 11) * (2.2 + m * 3.2);
        const a = (0.08 + m * 0.17) * (0.55 + jx * 0.45);
        this.mold.circle(x, y, r * 1.8).fill({ color: DAMP.mossDeep, alpha: a * 0.3 });
        this.mold.circle(x, y, r).fill({ color: m > 0.6 ? DAMP.mossDeep : DAMP.moss, alpha: a });
        this.mold.circle(x + 0.7, y - 0.5, r * 0.42).fill({ color: DAMP.moss, alpha: a * 0.65 });
      }
      // 菌丝：从角落向内的细线
      for (let k = 0; k < 3; k++) {
        const ang = Math.atan2(dirY, dirX) + (hash01(this.node.id, ci * 13 + k) - 0.5) * 1.4;
        const len = spread * (0.25 + hash01(this.node.id, ci * 19 + k) * 0.5);
        this.mold
          .moveTo(bx, by)
          .lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len)
          .stroke({ width: 0.8, color: DAMP.mossDeep, alpha: 0.12 + m * 0.14 });
      }
    });

    // 重度霉变：中心薄苔（仍在图标轮廓内，低透明度）
    if (m > 0.7) {
      const r = FILE_ICON_SIZE * 0.2 * (m - 0.65) * 3;
      this.mold.circle(cx, cy + 6, r).fill({ color: DAMP.mossDeep, alpha: 0.06 + m * 0.07 });
    }
  }

  /** 木夹子（只画一次，靠 visible 切换） */
  private drawClipShape(): void {
    const g = this.clip;
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
