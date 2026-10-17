/**
 * 游戏主循环（app 层）
 * SPEC §10：固定步长 16.666ms 累加器驱动物理，禁止可变 dt 直喂（R4 防抖动）
 * R3：document.hidden 暂停 ticker；AC-27：单帧异常不杀死循环（记录后继续）
 * AC-28：全屏/锁屏时 setPaused(true) 停止物理与演化（渲染 ticker 由 game 侧停用）
 */
import type { Application } from 'pixi.js';
import Matter from 'matter-js';
import { FIXED_DELTA_MS } from '../../shared/constants';

const { Engine } = Matter;

/** 单帧最多补算步数（防掉帧后雪崩式追帧卡死） */
const MAX_STEPS_PER_FRAME = 6;

export interface GameLoopOptions {
  app: Application;
  engine: Matter.Engine;
  /** 每个固定物理步之后调用（演化/视图同步），dtSec = 固定步长（秒） */
  tick: (dtSec: number) => void;
  /** AC-27：单帧未捕获异常上报（循环继续运行） */
  onError?: (err: unknown) => void;
}

export interface GameLoopHandle {
  /** AC-28：全屏应用/锁屏时暂停物理与演化 */
  setPaused(paused: boolean): void;
  readonly paused: boolean;
  readonly errorCount: number;
}

export function startGameLoop(opts: GameLoopOptions): GameLoopHandle {
  const { app, engine, tick } = opts;
  const fixedStep = FIXED_DELTA_MS;
  let acc = 0;
  let last = performance.now();
  let paused = false;
  let errorCount = 0;

  app.ticker.add(() => {
    if (paused) return;
    const now = performance.now();
    const frame = Math.min(now - last, 100); // 掉帧保护：单帧最多补 100ms
    last = now;
    if (document.hidden) return; // R3：隐藏暂停（AC-28 锁屏另走 main 侧 powerMonitor）

    acc += frame;
    let steps = 0;
    while (acc >= fixedStep && steps < MAX_STEPS_PER_FRAME) {
      steps++;
      try {
        Engine.update(engine, fixedStep);
        tick(fixedStep / 1000);
      } catch (err) {
        // AC-27：记录事件、保持循环存活；丢弃本帧积压，避免异常风暴
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
    setPaused: (p: boolean) => {
      paused = p;
    },
    get paused() {
      return paused;
    },
    get errorCount() {
      return errorCount;
    },
  };
}
