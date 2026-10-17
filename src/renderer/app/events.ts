/**
 * 游戏动作事件总线（app 层）：核心动作的首次完成信号
 * 供新手引导/埋点订阅，避免 pointer → ui 的横向依赖。
 */
export type GameAction = 'wring' | 'hang' | 'pick' | 'sell' | 'buy' | 'shop-open';

const EVENT = 'cyber-damp:action';

export function emitAction(action: GameAction): void {
  window.dispatchEvent(new CustomEvent<GameAction>(EVENT, { detail: action }));
}

export function onAction(cb: (action: GameAction) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<GameAction>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
