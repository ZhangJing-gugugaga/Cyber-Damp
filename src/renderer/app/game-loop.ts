/**
 * 游戏主循环（app 层）
 * SPEC §10：固定步长 16.666ms 累加器驱动物理，禁止可变 dt 直喂（R4 防抖动）
 * R3：document.hidden 暂停 ticker；物理与演化同步节拍
 */
import type { Application } from 'pixi.js';
import Matter from 'matter-js';
import { FIXED_DELTA_MS } from '../../shared/constants';

const { Engine } = Matter;

export interface GameLoopOptions {
  app: Application;
  engine: Matter.Engine;
  /** 每个固定物理步之后调用（演化/视图同步），dtSec = 固定步长（秒） */
  tick: (dtSec: number) => void;
}

export function startGameLoop(opts: GameLoopOptions): void {
  const { app, engine, tick } = opts;
  const fixedStep = FIXED_DELTA_MS;
  let acc = 0;
  let last = performance.now();

  app.ticker.add(() => {
    const now = performance.now();
    const frame = Math.min(now - last, 100); // 掉帧保护：单帧最多补 100ms
    last = now;
    if (document.hidden) return; // R3：隐藏暂停（main 侧另有 powerMonitor 锁屏暂停）

    acc += frame;
    while (acc >= fixedStep) {
      Engine.update(engine, fixedStep);
      tick(fixedStep / 1000);
      acc -= fixedStep;
    }
  });
}
