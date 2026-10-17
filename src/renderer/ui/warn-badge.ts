/**
 * 80% 承重预警角标（ui 层，AC-35）
 * AC-36：pointer-events:none（纯展示，不得遮挡桌面下层应用）
 */
export function createWarnBadge(mount: HTMLElement): HTMLElement {
  const el = document.createElement('span');
  el.className = 'warn-badge';
  el.textContent = '绳索接近承重极限';
  el.style.cssText =
    'position:fixed;top:64px;left:50%;transform:translateX(-50%);display:none;padding:2px 10px;' +
    'font-size:var(--text-2xs);color:var(--warn);background:var(--panel-bg);border:1px solid var(--warn);border-radius:var(--radius-pill)';
  el.style.pointerEvents = 'none';
  mount.appendChild(el);
  return el;
}
