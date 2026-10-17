/**
 * 游戏主循环（app 层）
 * 固定步长 16.666ms 累加器驱动 Verlet 物理与演化，禁止可变 dt 直喂（R4 防抖动）。
 * R3：document.hidden 暂停；AC-27：单帧异常不杀死循环（记录后继续）。
 */
import type { Application } from 'pixi.js';
import { FIXED_DELTA_MS } from '../../shared/constants';

/** 单帧最多补算步数（防掉帧后雪崩式追帧卡死） */
const MAX_STEPS_PER_FRAME = 6;

export interface GameLoopOptions {
  app: Application;
  /** 每个固定步调用（演化/物理/视图同步），dtSec = 固定步长（秒） */
  tick: (dtSec: number) => void;
  /** AC-27：单帧未捕获异常上报（循环继续运行） */
  onError?: (err: unknown) => void;
}

export interface GameLoopHandle {
  readonly errorCount: number;
}

export function startGameLoop(opts: GameLoopOptions): GameLoopHandle {
  const { app, tick } = opts;
  const fixedStep = FIXED_DELTA_MS;
  let acc = 0;
  let last = performance.now();
  let errorCount = 0;

  app.ticker.add(() => {
    const now = performance.now();
    const frame = Math.min(now - last, 100); // 掉帧保护：单帧最多补 100ms
    last = now;
    if (document.hidden) return;

    acc += frame;
    let steps = 0;
    while (acc >= fixedStep && steps < MAX_STEPS_PER_FRAME) {
      steps++;
      try {
        tick(fixedStep / 1000);
      } catch (err) {
        errorCount++;
        console.error('[cyber-damp] tick 异常（循环继续）:', err);
        opts.onError?.(err);
        acc = 0;
        break;
      }
      acc -= fixedStep;
    }
    if (acc >= fixedStep * MAX_STEPS_PER_FRAME) acc = 0;
  });

  return {
    get errorCount() {
      return errorCount;
    },
  };
}
