/**
 * renderer 引导（只装配，<80 行；架构 §8 入口纪律）
 * 装配：错误边界 → pixi-app → game 总装配
 */
import './ui/ui.css';
import { createPixiApp } from './app/pixi-app';
import { createGame } from './app/game';

async function main(): Promise<void> {
  // AC-27 全局错误边界：记录事件、保持进程存活、不丢存档
  window.addEventListener('error', (e) => {
    console.error('[cyber-damp] 未捕获错误:', e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[cyber-damp] 未处理 Promise:', e.reason);
  });

  // Pixi v8 异步 init；画布挂载 + 游戏世界装配
  const app = await createPixiApp();
  document.getElementById('stage')?.appendChild(app.canvas);
  await createGame(app);
}

void main();
