/**
 * Demo Mode 上帝控制台（ui 层，Ctrl+Shift+D，模态 z=400 居中 560px）
 * AC-31 一键回南天（3s 扫描）/ AC-32 一键挂满（容量预检贪心截断）/ 一键培育 / 状态读数
 * AC-36：根容器 auto（模态）/ 静态文本与读数 none / 按钮 auto / 置灰 none
 */
import type { WorldRuntime } from '../app/world-runtime';
import { icon, renderIcons } from './icons';

export interface DemoActions {
  rainSweep(): void;
  hangFull(): void;
  cultivate(): void;
  /** 状态读数外部快照 */
  readout(): { rope: string; load: string; files: string; moldy: string };
}

export interface DemoConsole {
  el: HTMLElement;
  toggle(): void;
  close(): void;
  refresh(): void;
}

export function createDemoConsole(mount: HTMLElement, runtime: WorldRuntime, actions: DemoActions): DemoConsole {
  const el = document.createElement('div');
  el.className = 'demo-console';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '气象局内幕控制台');
  el.style.display = 'none';

  const header = document.createElement('header');
  header.className = 'demo-console__header';
  header.innerHTML = `
    <h2 class="demo-console__title">${icon('terminal', 24)}气象局内幕控制台</h2>
    <p class="demo-console__subtitle">路演专用，改天换命，概不负责</p>
  `;
  el.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'demo-console__grid';
  el.appendChild(grid);

  function consoleBtn(label: string, desc: string, fn: () => void, disabled = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'console-btn';
    b.innerHTML = `<span class="console-btn__label">${label}</span><span class="console-btn__desc">${desc}</span>`;
    if (disabled) {
      b.setAttribute('aria-disabled', 'true');
    } else {
      b.addEventListener('click', () => {
        fn();
        refresh();
      });
    }
    grid.appendChild(b);
    return b;
  }

  consoleBtn('一键回南天', '全桌面 3 秒走完出水→变软→长蘑菇', () => actions.rainSweep());
  consoleBtn('一键挂满', '容量预检贪心挂载，保住最重文件出深 V', () => actions.hangFull());
  consoleBtn('一键培育', '随机文件立即结出一朵成熟蘑菇', () => actions.cultivate());

  const readoutDl = document.createElement('dl');
  readoutDl.className = 'console-readout';
  el.appendChild(readoutDl);

  const footer = document.createElement('footer');
  footer.className = 'console-footer';
  footer.innerHTML = `${icon('history', 16)} Esc 关闭 · Ctrl+Shift+D 呼出 · 全部改动即时生效`;
  el.appendChild(footer);

  function refresh(): void {
    const r = actions.readout();
    readoutDl.innerHTML = `
      <div><dt>当前绳型</dt><dd>${r.rope}</dd></div>
      <div><dt>绳上负载</dt><dd>${r.load}</dd></div>
      <div><dt>桌面文件</dt><dd>${r.files}</dd></div>
      <div><dt>重度霉变</dt><dd>${r.moldy}</dd></div>
      <div><dt>除湿币</dt><dd>${runtime.coins}</dd></div>
      <div><dt>库存蘑菇</dt><dd>${runtime.inventory.length} 朵</dd></div>
    `;
    renderIcons();
  }

  function toggle(): void {
    if (el.style.display === 'none') {
      refresh();
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }
  function close(): void {
    el.style.display = 'none';
  }

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  mount.appendChild(el);
  renderIcons();
  return { el, toggle, close, refresh };
}
