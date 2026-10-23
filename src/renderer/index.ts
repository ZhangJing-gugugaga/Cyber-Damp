/**
 * renderer 引导（只装配，<80 行；架构 §8 入口纪律）
 * 装配：错误边界 → pixi-app → game 总装配
 */
import './ui/ui.css';
import { createPixiApp } from './app/pixi-app';
import { createGame } from './app/game';
import { trackError, trackEvent } from './app/telemetry';

async function main(): Promise<void> {
  // AC-27 全局错误边界：记录事件、保持进程存活、不丢存档
  window.addEventListener('error', (e) => {
    console.error('[cyber-damp] 未捕获错误:', e.message);
    trackError('uncaught', e.message, e.error instanceof Error ? e.error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[cyber-damp] 未处理 Promise:', e.reason);
    const err = e.reason;
    trackError(
      'unhandledrejection',
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? err.stack : undefined,
    );
  });

  // PRD §11：app_launch（first_ever 标记）
  let firstEver = false;
  try {
    firstEver = !localStorage.getItem('cd.launch');
    if (firstEver) localStorage.setItem('cd.launch', '1');
  } catch {
    /* 存储不可用则按非首次处理 */
  }
  trackEvent('app_launch', { firstEver });

  // Pixi v8 异步 init；画布挂载 + 游戏世界装配
  void window.damp?.management.command({ action: 'startup-stage', value: 'graphics' });
  const graphicsAt = performance.now();
  const app = await createPixiApp();
  console.info('[startup:graphics]', Math.round(performance.now() - graphicsAt));
  document.getElementById('stage')?.appendChild(app.canvas);
  await createGame(app);
}

void main();
