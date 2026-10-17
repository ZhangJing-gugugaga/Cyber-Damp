/**
 * 悬停学习卡片（ui 层，PRD §7.1 第 15-60 秒）
 * 悬停文件显示：文件名 / 湿度 / 霉变 / 冷落天数 / 阶段（颜色+文字双重编码）
 * AC-36：纯展示元素 pointer-events:none，不遮挡桌面下层应用
 */
import type { WorldRuntime } from '../app/world-runtime';
import type { FileSprite } from '../view/file-sprite';
import { fileAt } from '../input/hit-tests';

const STAGE_LABEL: Record<string, string> = {
  fresh: '干爽如新',
  damp: '轻度受潮',
  wet: '中度受潮',
  moldy: '重度遗忘',
};

export interface HoverCard {
  el: HTMLElement;
  update(x: number, y: number, locked: boolean): void;
}

export function createHoverCard(
  mount: HTMLElement,
  runtime: WorldRuntime,
  sprites: Map<string, FileSprite>,
): HoverCard {
  const el = document.createElement('div');
  el.className = 'hover-card';
  el.style.display = 'none';
  mount.appendChild(el);

  let lastId = '';
  let lastSig = '';

  function render(id: string): void {
    const ent = runtime.byId.get(id);
    const sprite = sprites.get(id);
    if (!ent || !sprite) return;
    const rt = ent.runtime;
    const days = Math.max(0, Math.floor((runtime.now - sprite.node.mtime) / 86400000));
    const humidity = Math.round(rt.humidity * 100);
    const mold = Math.round(rt.mold * 100);
    const sig = `${id}|${humidity}|${mold}|${rt.stage}|${days}`;
    if (sig === lastSig) return;
    lastSig = sig;

    el.textContent = '';
    const title = document.createElement('div');
    title.className = 'hover-card__name';
    title.textContent = sprite.node.name;

    const meta = document.createElement('div');
    meta.className = 'hover-card__meta';
    meta.textContent = `${STAGE_LABEL[rt.stage] ?? rt.stage} · 已冷落 ${days} 天`;

    const stats = document.createElement('div');
    stats.className = 'hover-card__stats';
    stats.textContent = `湿度 ${humidity}%　霉变 ${mold}%`;

    el.append(title, meta, stats);
  }

  function update(x: number, y: number, locked: boolean): void {
    if (locked) {
      if (el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    const sprite = fileAt(sprites, x, y);
    if (!sprite) {
      if (el.style.display !== 'none') el.style.display = 'none';
      lastId = '';
      return;
    }
    if (sprite.node.id !== lastId) {
      lastId = sprite.node.id;
      lastSig = '';
      render(sprite.node.id);
    } else {
      render(sprite.node.id);
    }
    el.style.display = '';
    el.style.left = `${Math.min(window.innerWidth - 240, x + 18)}px`;
    el.style.top = `${Math.min(window.innerHeight - 110, y + 16)}px`;
  }

  return { el, update };
}
