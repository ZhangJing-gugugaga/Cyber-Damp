/**
 * 字符滴落池（view 层，P1）：湿润文档/代码文件的标点从图标底部掉落
 * 小扫把清扫（sweep 半径内批量销毁）；同屏 ≤24，预算内复用。
 */
import { Container, Text } from 'pixi.js';
import { DAMP, INK } from './token-colors';

const GLYPHS = ['，', '；', '{', '}', '、'];
const MAX = 24;

interface LiveGlyph {
  t: Text;
  vx: number;
  vy: number;
  life: number;
  age: number;
}

export class GlyphPool {
  readonly container = new Container();
  private live: LiveGlyph[] = [];

  constructor() {
    this.container.eventMode = 'none';
  }

  get count(): number {
    return this.live.length;
  }

  /** 从湿润文档底部掉一个字符 */
  spawn(x: number, y: number): void {
    if (this.live.length >= MAX) return;
    const t = new Text({
      text: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      style: {
        fontFamily: '"Microsoft YaHei", monospace',
        fontSize: 11,
        fill: DAMP.inkBleed,
        stroke: { color: INK.panel, width: 2 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() - 0.5) * 34, y + Math.random() * 8);
    this.container.addChild(t);
    this.live.push({ t, vx: (Math.random() - 0.5) * 16, vy: -3, life: 6 + Math.random() * 3, age: 0 });
  }

  update(dtSec: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.age += dtSec;
      g.vy += 90 * dtSec;
      g.t.position.x += g.vx * dtSec;
      g.t.position.y += g.vy * dtSec;
      g.t.alpha = Math.max(0, 1 - g.age / g.life);
      if (g.age >= g.life) {
        g.t.destroy();
        this.live.splice(i, 1);
      }
    }
  }

  /** 小扫把：清除半径内字符，返回清扫数量 */
  sweep(x: number, y: number, r = 46): number {
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      if (Math.hypot(g.t.position.x - x, g.t.position.y - y) <= r) {
        g.t.destroy();
        this.live.splice(i, 1);
        n++;
      }
    }
    return n;
  }

  /** 悬停命中（AC-26：字符可扫区域必须拦截穿透） */
  hit(x: number, y: number): boolean {
    return this.live.some((g) => Math.hypot(g.t.position.x - x, g.t.position.y - y) <= 24);
  }
}
