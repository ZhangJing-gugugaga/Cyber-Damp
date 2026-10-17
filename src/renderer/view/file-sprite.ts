/**
 * 文件替身渲染（view 层）——程序化图标 + 四阶段冷落度表现
 * SPEC §7/AC-06~AC-11：分格式差异化受潮（墨洇/褪色/蓄水袋/胀气）+ 四阶段渐进
 * 色值全部来自 token-colors（设计 Token 的十六进制映射）
 */
import { Container, Graphics } from 'pixi.js';
import type { FileNode } from '../../shared/types/file-node';
import type { FileRuntime } from '../../shared/types/file-runtime';
import { CATEGORY_COLOR, DAMP, ENV_COLOR, FILE_ICON_H, FILE_ICON_W, INK } from './token-colors';

/** 类别差异形态：document=折角纸页 / code=尖括号 / image=山峦 / audio=音符 / archive=箱 / folder=文件夹 */
function drawIcon(g: Graphics, node: FileNode): void {
  const w = FILE_ICON_W;
  const h = FILE_ICON_H;
  const base = CATEGORY_COLOR[node.category];
  g.clear();

  if (node.ext === '' && node.name.includes('文件夹')) {
    // 文件夹：底板 + 标签页
    g.moveTo(6, h - 18).lineTo(6, h - 34).lineTo(28, h - 34).lineTo(34, h - 28)
      .lineTo(58, h - 28).lineTo(58, h - 18).closePath().fill({ color: base });
    return;
  }
  if (node.category === 'archive') {
    // 压缩包：箱体 + 束带
    g.roundRect(8, h - 62, w - 16, 44, 4).fill({ color: base });
    g.rect(8, h - 46, w - 16, 6).fill({ color: INK.paper2, alpha: 0.35 });
    return;
  }

  // 通用纸页 + 右下折角
  g.moveTo(8, h - 62).lineTo(w - 20, h - 62).lineTo(w - 8, h - 44).lineTo(w - 8, h - 18).lineTo(8, h - 18)
    .closePath().fill({ color: base });
  g.moveTo(w - 20, h - 62).lineTo(w - 20, h - 44).lineTo(w - 8, h - 44)
    .closePath().fill({ color: INK.paper2, alpha: 0.5 });

  // 类别符号
  if (node.category === 'doc-code') {
    if (['py', 'c', 'js'].includes(node.ext)) {
      g.moveTo(20, h - 46).lineTo(12, h - 36).lineTo(20, h - 26)
        .stroke({ width: 2, color: DAMP.labelInk });
      g.moveTo(40, h - 46).lineTo(48, h - 36).lineTo(40, h - 26)
        .stroke({ width: 2, color: DAMP.labelInk });
    } else {
      // 文档：横线文本
      for (let i = 0; i < 3; i++) {
        g.moveTo(16, h - 44 + i * 8).lineTo(44, h - 44 + i * 8)
          .stroke({ width: 2, color: DAMP.labelInk, alpha: 0.5 });
      }
    }
  } else if (node.category === 'image-video') {
    // 图片：太阳 + 山峦
    g.circle(20, h - 48, 4).fill({ color: ENV_COLOR.warn });
    g.moveTo(12, h - 24).lineTo(26, h - 40).lineTo(36, h - 30).lineTo(44, h - 40).lineTo(52, h - 24)
      .stroke({ width: 2, color: DAMP.labelInk });
  } else if (node.category === 'audio') {
    // 音频：音符
    g.circle(20, h - 30, 5).fill({ color: DAMP.labelInk });
    g.rect(24, h - 46, 2.5, 16).fill({ color: DAMP.labelInk });
    g.moveTo(26, h - 46).lineTo(36, h - 42).stroke({ width: 2.5, color: DAMP.labelInk });
  }
}

export class FileSprite {
  readonly container = new Container();
  private readonly icon = new Graphics();
  private readonly overlay = new Graphics();
  private readonly audioBag = new Graphics();
  readonly node: FileNode;

  constructor(node: FileNode) {
    this.node = node;
    drawIcon(this.icon, node);
    this.container.addChild(this.icon, this.audioBag, this.overlay);
    this.container.position.set(node.x, node.y);
    this.container.eventMode = 'static';
  }

  /** 按运行时状态刷新视觉（每帧由 game-loop 调用，幂等） */
  update(rt: FileRuntime, tSec: number): void {
    const stage = rt.stage;
    this.overlay.clear();
    this.audioBag.clear();

    // 焦化（char>0）：向内坍缩 + 焦褐（scale/skew 近似，SPEC P2 真 Mesh 后置）
    const charScale = 1 - rt.char * 0.2;
    this.icon.scale.set(charScale);
    this.icon.skew.x = rt.char * 0.12;
    if (rt.char > 0.05) {
      this.icon.tint = mixTint(0xffffff, DAMP.char, Math.min(1, rt.char * 1.4));
    } else {
      this.icon.tint = 0xffffff;
    }

    // 褪色（图片/视频饱和度下降 → 用 tint 压暗）
    if (this.node.category === 'image-video' && rt.humidity > 0.2) {
      this.icon.alpha = 1 - rt.humidity * 0.35;
    }

    switch (stage) {
      case 'fresh':
        this.icon.alpha = 1;
        break;
      case 'damp':
        // 轻度：冷凝 tint + 底部墨水晕染
        this.icon.tint = mixTint(0xffffff, DAMP.water, 0.25 + rt.humidity * 0.3);
        this.drawLabelInk();
        break;
      case 'wet':
        // 中度：四角青苔蔓延 + 水渍
        this.icon.tint = mixTint(0xffffff, DAMP.water, 0.45);
        this.drawMoss(tSec, 0.15 + rt.mold * 0.4);
        this.drawStain();
        break;
      case 'moldy':
        // 重度：深苔覆盖 >40% + 顶部破土位（蘑菇挂 shroomLayer）
        this.icon.tint = mixTint(0xffffff, DAMP.mossDeep, 0.55);
        this.drawMoss(tSec, 0.4 + rt.mold * 0.5);
        break;
    }

    // 音频蓄水鼓袋（P0 锁定：音频类不降级）
    if (this.node.category === 'audio') {
      const swell = 1 + rt.humidity * 0.22 + Math.sin(tSec * 2) * rt.humidity * 0.03;
      this.audioBag.ellipse(FILE_ICON_W / 2, FILE_ICON_H - 14, 26 * swell, 10 * swell)
        .fill({ color: DAMP.water, alpha: 0.55 });
    }

    // 压缩包密闭发酵胀气
    if (this.node.category === 'archive') {
      const swell = 1 + rt.humidity * 0.15;
      this.container.scale.set(swell);
    } else {
      this.container.scale.set(1);
    }
  }

  /** 底部文件名标签墨水晕染（damp 阶段） */
  private drawLabelInk(): void {
    const w = 74;
    const x = FILE_ICON_W / 2 - w / 2;
    const y = FILE_ICON_H - 12;
    this.overlay.roundRect(x, y, w, 15, 3).fill({ color: DAMP.label, alpha: 0.85 });
    this.overlay.roundRect(x, y, w, 15, 3).stroke({ width: 1, color: DAMP.inkBleed, alpha: 0.6 });
  }

  /** 四角绒毛青苔（Perlin 观感：多层半透明斑块向中心蔓延） */
  private drawMoss(tSec: number, coverage: number): void {
    const lobes = 5;
    for (let i = 0; i < lobes; i++) {
      const phase = tSec * 0.6 + i * 1.7;
      const wob = Math.sin(phase) * 2.5;
      const cornerX = i % 2 === 0 ? 10 + wob : FILE_ICON_W - 10 + wob;
      const cornerY = i < 3 ? FILE_ICON_H - 64 : FILE_ICON_H - 22;
      const r = 8 + coverage * 14 + Math.cos(phase) * 2;
      this.overlay.circle(cornerX, cornerY, Math.max(2, r))
        .fill({ color: DAMP.moss, alpha: 0.28 + coverage * 0.3 });
    }
  }

  /** 中度水渍晕块 */
  private drawStain(): void {
    this.overlay.ellipse(FILE_ICON_W / 2, FILE_ICON_H - 34, 26, 12)
      .fill({ color: DAMP.stain, alpha: 0.22 });
  }
}

/** 两色线性混色（Pixi tint 只支持乘法，用白为基底做近似插值） */
function mixTint(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}