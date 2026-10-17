/**
 * 提示气泡（ui 层）：宣纸便利贴隐喻（DESIGN §7）
 * 6s 自动消失；警示切 warn 边线不自动消失；AC-36 指针纪律：正文 none / 按钮 auto
 */
import { icon, renderIcons } from './icons';

export interface TipOptions {
  warn?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  /** 存续毫秒（默认 6000；warn 恒驻） */
  ms?: number;
}

export interface ToastHost {
  root: HTMLElement;
  tip(text: string, opts?: TipOptions): void;
}

export function createToastHost(mount: HTMLElement): ToastHost {
  const root = document.createElement('div');
  root.className = 'toast-host';
  mount.appendChild(root);

  function tip(text: string, opts: TipOptions = {}): void {
    const bubble = document.createElement('aside');
    bubble.className = opts.warn ? 'tip-bubble tip-bubble--warn' : 'tip-bubble';
    bubble.setAttribute('role', 'status');

    const body = document.createElement('p');
    body.className = 'tip-bubble__body';
    body.textContent = text;
    bubble.appendChild(body);

    if (opts.actionLabel) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'tip-bubble__action';
      action.textContent = opts.actionLabel;
      action.addEventListener('click', () => {
        opts.onAction?.();
        bubble.remove();
      });
      bubble.appendChild(action);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tip-bubble__close';
    close.setAttribute('aria-label', '关闭提示');
    close.innerHTML = icon('x', 16);
    close.addEventListener('click', () => bubble.remove());
    bubble.appendChild(close);

    // 随机微旋转（便利贴手感，-2°~+2°）
    bubble.style.setProperty('--tip-rot', `${(Math.random() * 4 - 2).toFixed(1)}deg`);
    root.appendChild(bubble);
    renderIcons();

    if (!opts.warn) {
      window.setTimeout(() => bubble.remove(), opts.ms ?? 6000);
    }
  }

  return { root, tip };
}
