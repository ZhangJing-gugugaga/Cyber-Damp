/**
 * 工具箱（ui 层，bottom-left 44x44 入口 + 弹出工具格）
 * MVP：手（默认）/ 剪刀 / 保湿喷雾；吹风机/刮水器 P1 置灰（aria-disabled）
 * AC-36：面板容器 none / 工具格 auto / 置灰格 none
 */
import type { WorldRuntime } from '../app/world-runtime';
import type { Tool } from '../input/pointer-controller';
import shovelUrl from '../assets/pvz-shovel.png?url';
import { icon, renderIcons } from './icons';

interface ToolDef {
  id: Tool;
  lucide: string;
  label: string;
  disabled?: boolean;
}

const TOOLS: ToolDef[] = [
  { id: 'hand', lucide: 'hand', label: '浏览：单击选中 / 双击打开 / 拖拽晾晒' },
  { id: 'scissors', lucide: 'scissors', label: '剪刀：采摘普通蘑菇；彩蛋菇请用铲子' },
  { id: 'shovel', lucide: 'shovel', label: 'PVZ铲子：采摘彩蛋菇；胆小菇不会躲藏' },
  { id: 'spray', lucide: 'spray-can', label: '保湿喷雾：焦化恢复（消耗品）' },
  { id: 'heat', lucide: 'wind', label: '手持吹风机：按住吹干，过热会焦化' },
  { id: 'squeegee', lucide: 'eraser', label: '橡胶刮水器：拖动刮去屏幕雾气' },
  { id: 'broom', lucide: 'brush', label: '小扫把：清扫滴落的标点字符' },
];

export interface Toolbox {
  el: HTMLElement;
  getTool(): Tool;
  select(tool: Tool): void;
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
  const instruction = document.createElement('p');
  instruction.className = 'toolbox__instruction';
  instruction.setAttribute('role', 'status');
  const modeStatus = document.createElement('p');
  modeStatus.className = 'tool-mode-status'; modeStatus.setAttribute('role', 'status');
  (mount.closest('.rain-dock') ?? mount).appendChild(modeStatus);
  TOOLS.forEach((t, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'tool-cell';
    cell.title = t.label;
    cell.setAttribute('aria-label', t.label);
    cell.innerHTML = `${t.id === 'shovel' ? `<img src="${shovelUrl}" alt="" width="38" height="24">` : icon(t.lucide, 24)}<span class="tool-cell__label">${t.label.split('：')[0]}</span>`;
    if (t.disabled) {
      cell.setAttribute('aria-disabled', 'true');
      cell.title = '功能在路线图上，还没有到站';
    } else {
      cell.dataset.tool = t.id;
      cell.addEventListener('click', () => {
        select(t.id);
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
      cell.setAttribute('aria-pressed', String(t.id === current));
    }
    instruction.textContent = TOOLS.find(t => t.id === current)!.label + (current === 'hand' ? '' : ' · Esc 返回浏览');
    modeStatus.hidden = current === 'hand';
    modeStatus.textContent = `${TOOLS.find(t => t.id === current)!.label.split('：')[0]} · Esc 返回浏览`;
  }

  function select(tool: Tool): void {
    if (tool === 'shovel' && !runtime.owned.includes('pvz-shovel')) return;
    current = tool;
    syncSelected();
    void window.damp?.management.command({ action: 'tool-mode', value: tool === 'hand' ? 'off' : 'on' });
    window.dispatchEvent(new Event('damp:tool-change'));
  }

  function refresh(): void {
    // 喷雾无货置灰提示
    for (const cell of cells) {
      if (cell.dataset.tool === 'shovel') {
        cell.disabled = !runtime.owned.includes('pvz-shovel');
        cell.title = cell.disabled ? '先到雨天小铺免费领取PVZ铲子' : '铲子已就绪：胆小菇不再躲藏，点击采摘';
      }
      if (cell.dataset.spray === '1' && !cell.hasAttribute('aria-disabled')) {
        cell.title = runtime.sprayCharges > 0 ? `剩余 ${runtime.sprayCharges} 罐` : '杂货铺有售（20 币/罐）';
      }
    }
  }

  mount.appendChild(entry);
  el.appendChild(instruction);
  mount.appendChild(el);
  renderIcons();
  syncSelected();
  refresh();

  return {
    el,
    getTool: () => current,
    select,
    refresh,
  };
}
