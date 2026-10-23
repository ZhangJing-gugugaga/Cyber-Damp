import { Container, Text } from 'pixi.js';
import type { FileNode } from '../../shared/types/file-node';

/** Canvas text only: real filenames are never parsed as HTML or SVG. */
export class FileLabel extends Container {
  private readonly clean: Text;
  private pinned = false;
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
    this.clean.anchor.set(0.5, 0);
    this.addChild(this.clean);
  }

  setPinned(pinned: boolean): void {
    if (this.pinned === pinned) return;
    this.pinned = pinned;
    for (const text of [this.clean]) {
      text.style.fontSize = (pinned ? 10 : 12) * this.nativeScale;
      text.style.lineHeight = (pinned ? 12 : 14) * this.nativeScale;
      text.style.wordWrapWidth = pinned ? 68 * this.nativeScale : this.node.geometry?.labelWidth ?? 92;
    }
  }

  /** Material effects belong to the icon. Filenames remain white and stable. */
  update(_wet: number, _char: number, _wrung: boolean): void {
    this.clean.visible = true;
    this.clean.alpha = 1;
    this.rotation = 0;
  }
}
