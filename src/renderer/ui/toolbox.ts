/**
 * 工具箱（ui 层，bottom-left 44x44 入口 + 弹出工具格）
 * MVP：手（默认）/ 剪刀 / 保湿喷雾；吹风机/刮水器 P1 置灰（aria-disabled）
 * AC-36：面板容器 none / 工具格 auto / 置灰格 none
 */
import type { WorldRuntime } from '../app/world-runtime';
import type { Tool } from '../input/pointer-controller';
import { icon, renderIcons } from './icons';

interface ToolDef {
  id: Tool;
  lucide: string;
  label: string;
  disabled?: boolean;
}

const TOOLS: ToolDef[] = [
  { id: 'hand', lucide: 'hand', label: '手：拖拽晾晒 / 画圈拧干' },
  { id: 'scissors', lucide: 'scissors', label: '剪刀：采摘成熟蘑菇' },
  { id: 'spray', lucide: 'spray-can', label: '保湿喷雾：焦化恢复（消耗品）' },
  { id: 'hand', lucide: 'wind', label: '手持吹风机（P1 规划中）', disabled: true },
  { id: 'hand', lucide: 'eraser', label: '橡胶刮水器（P1 规划中）', disabled: true },
];

export interface Toolbox {
  el: HTMLElement;
  getTool(): Tool;
  refresh(): void;
}

export function createToolbox(mount: HTMLElement, runtime: WorldRuntime): Toolbox {
  let current: Tool = 'hand';
  let open = false;

  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = 'hud-btn hud-btn--toolbox';
  entry.setAttribute('aria-label', '工具箱');
  entry.innerHTML = icon('wrench', 24);

  const el = document.createElement('div');
  el.className = 'toolbox';
  el.setAttribute('aria-label', '工具箱面板');
  el.style.display = 'none';

  entry.addEventListener('click', () => {
    open = !open;
    el.style.display = open ? '' : 'none';
  });

  const cells: HTMLButtonElement[] = [];
  TOOLS.forEach((t, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'tool-cell';
    cell.innerHTML = `${icon(t.lucide, 20)}<span class="tool-cell__label">${t.label}</span>`;
    if (t.disabled) {
      cell.setAttribute('aria-disabled', 'true');
      cell.title = '功能在路线图上，还没有到站';
    } else {
      cell.dataset.tool = t.id;
      cell.addEventListener('click', () => {
        current = t.id;
        syncSelected();
      });
    }
    if (t.id === 'spray') cell.dataset.spray = '1';
    cell.dataset.index = String(i);
    cells.push(cell);
    el.appendChild(cell);
  });

  function syncSelected(): void {
    for (const cell of cells) {
      const t = TOOLS[Number(cell.dataset.index)];
      cell.classList.toggle('tool-cell--active', !t.disabled && t.id === current && cell.dataset.tool === current);
    }
  }

  function refresh(): void {
    // 喷雾无货置灰提示
    for (const cell of cells) {
      if (cell.dataset.spray === '1' && !cell.hasAttribute('aria-disabled')) {
        cell.title = runtime.sprayCharges > 0 ? `剩余 ${runtime.sprayCharges} 罐` : '杂货铺有售（20 币/罐）';
      }
    }
  }

  mount.appendChild(entry);
  mount.appendChild(el);
  renderIcons();
  syncSelected();

  return {
    el,
    getTool: () => current,
    refresh,
  };
}
