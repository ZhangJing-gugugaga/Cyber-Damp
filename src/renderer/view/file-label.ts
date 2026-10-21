import { Container, Sprite, Text, Texture } from 'pixi.js';
import { scorchedCharacters } from '../../world/file-material';
import type { FileNode } from '../../shared/types/file-node';

/** Canvas text only: real filenames are never parsed as HTML or SVG. */
export class FileLabel extends Container {
  private readonly clean: Text;
  private readonly ink: Text;
  private readonly carbon = new Sprite(Texture.EMPTY);
  private pinned = false;
  private renderedKey = '';
  private get nativeScale(): number { return this.node.geometry?.labelScale ?? 1; }

  constructor(private node: FileNode) {
    super();
    const style = {
      fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 12 * this.nativeScale,
      fill: 0xffffff, align: 'center' as const, wordWrap: true, wordWrapWidth: node.geometry?.labelWidth ?? 92,
      lineHeight: 14 * this.nativeScale, breakWords: true,
      dropShadow: { color: 0x000000, alpha: 0.9, blur: 1, distance: 1, angle: Math.PI / 2 },
    };
    const name = node.displayName ?? node.name.replace(/\.(lnk|url)$/i, '');
    this.clean = new Text({ text: name, style });
    this.ink = new Text({ text: name, style: this.clean.style.clone() });
    this.clean.anchor.set(0.5, 0);
    this.ink.anchor.set(0.5, 0);
    this.ink.position.set(0.8, 0.65);
    // The text texture already has a baked soft shadow. A per-label GPU blur
    // adds two offscreen passes per wet icon and harms native-size readability.
    this.ink.visible = false;
    this.carbon.anchor.set(0.5, 0);
    this.carbon.visible = false;
    this.addChild(this.ink, this.clean, this.carbon);
  }

  setPinned(pinned: boolean): void {
    if (this.pinned === pinned) return;
    this.pinned = pinned;
    for (const text of [this.clean, this.ink]) {
      text.style.fontSize = (pinned ? 10 : 12) * this.nativeScale;
      text.style.lineHeight = (pinned ? 12 : 14) * this.nativeScale;
      text.style.wordWrapWidth = pinned ? 68 * this.nativeScale : this.node.geometry?.labelWidth ?? 92;
    }
    this.renderedKey = '';
  }

  update(wet: number, char: number, wrung: boolean): void {
    const burnt = char > 0.3;
    this.clean.visible = !burnt;
    this.clean.alpha = 1;
    this.ink.visible = !burnt && wet > 0.35;
    this.ink.alpha = Math.max(0, wet - 0.35) * 0.4;
    this.carbon.visible = burnt;
    this.rotation = wrung ? Math.PI / 12 : 0;
    if (!burnt) return;
    const key = `${this.pinned}:${char > 0.65 ? 2 : 1}`;
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    const parts = scorchedCharacters(this.node.name, this.node.id, char);
    const font = (this.pinned ? 10 : 11) * this.nativeScale, lineHeight = (this.pinned ? 12 : 14) * this.nativeScale;
    const maxWidth = this.pinned ? 68 * this.nativeScale : this.node.geometry?.labelWidth ?? 92;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fontName = `${font}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
    ctx.font = fontName;
    const lines: typeof parts[] = [[]];
    let width = 0;
    for (const part of parts) {
      const next = ctx.measureText(part.glyph).width;
      if (width + next > maxWidth && lines[lines.length - 1].length) { lines.push([]); width = 0; }
      lines[lines.length - 1].push(part); width += next;
    }
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = (maxWidth + 4) * scale;
    canvas.height = (lines.length * lineHeight + 4) * scale;
    ctx.scale(scale, scale); ctx.font = fontName; ctx.textBaseline = 'top';
    lines.forEach((line, row) => {
      const lineWidth = line.reduce((sum, p) => sum + ctx.measureText(p.glyph).width, 0);
      let x = (maxWidth + 4 - lineWidth) / 2;
      for (const part of line) {
        ctx.fillStyle = part.carbon ? '#10100f' : '#ffffff';
        ctx.shadowColor = part.carbon ? 'transparent' : '#000000';
        ctx.shadowBlur = part.carbon ? 0 : 1;
        ctx.shadowOffsetY = part.carbon ? 0 : 1;
        ctx.fillText(part.glyph, x, 1 + row * lineHeight);
        x += ctx.measureText(part.glyph).width;
      }
    });
    const old = this.carbon.texture;
    this.carbon.texture = Texture.from(canvas);
    this.carbon.width = maxWidth + 4;
    this.carbon.height = lines.length * lineHeight + 4;
    if (old !== Texture.EMPTY) old.destroy(true);
  }
}
