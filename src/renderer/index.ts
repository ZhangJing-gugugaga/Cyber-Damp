/**
 * renderer 引导骨架（只装配，<80 行；后续批次扩展游戏主循环）
 * Pixi v8：异步 init（无同步构造），backgroundAlpha 0 透明画布
 */
import { Application } from 'pixi.js';
import { loadSave } from './app/save-bridge';

async function main(): Promise<void> {
  // 1. 存档加载（失败/损坏走新开局，禁止抛错中断启动——契约纪律 3）
  const save = await loadSave();
  console.info('[cyber-damp] 存档状态:', save ? '已恢复' : '新开局');

  // 2. Pixi 应用（WebGL 优先；上下文丢失自动重建在 game-loop 批次接线）
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resizeTo: window,
    preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio, 2), // DPR 上限 2（R3）
    autoDensity: true,
  });
  document.getElementById('stage')?.appendChild(app.canvas);

  // 3. 全局错误边界（AC-27：记录事件、保持进程存活、不丢失存档）
  window.addEventListener('error', (e) => {
    console.error('[cyber-damp] 未捕获错误:', e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[cyber-damp] 未处理 Promise:', e.reason);
  });
}

void main();
