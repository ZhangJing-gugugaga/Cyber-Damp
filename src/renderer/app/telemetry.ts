/**
 * 渲染层埋点封装（app 层，PRD §11）
 * 事件名规范 {对象}_{动作}；本地 JSONL，无网络；错误只上报类型 + 堆栈哈希。
 */
type Props = Record<string, string | number | boolean>;

export function trackEvent(name: string, props: Props = {}): void {
  void window.damp?.app.track(name, props);
}

/** 首次完成事件（每安装一次）：localStorage 标记去重 */
export function trackFirst(name: string, props: Props = {}): void {
  try {
    const key = `cd.first.${name}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    /* localStorage 不可用则每次上报，不阻塞玩法 */
  }
  trackEvent(name, props);
}

/** FNV-1a 32 位（堆栈哈希，避免落原始堆栈泄露路径） */
export function hashStack(stack: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < stack.length; i++) {
    h ^= stack.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** AC-27：error_occurred（类型 + 消息摘要 + 堆栈哈希） */
export function trackError(type: string, message: string, stack?: string): void {
  trackEvent('error_occurred', {
    type,
    message: message.slice(0, 120),
    stackHash: stack ? hashStack(stack) : '',
  });
}
