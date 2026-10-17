/**
 * FPS 监控（app 层，PRD §11 fps_drop：连续 5s < 30fps 记一次，60s 冷却）
 */
import { trackEvent } from './telemetry';

export function createFpsWatch(app: { ticker: { FPS: number } }): (dtSec: number) => void {
  let acc = 0;
  let lowSec = 0;
  let lastReport = 0;

  return (dtSec: number): void => {
    acc += dtSec;
    if (acc < 1) return;
    acc = 0;
    const fps = app.ticker.FPS;
    if (fps > 0 && fps < 30) lowSec++;
    else lowSec = 0;
    if (lowSec >= 5 && performance.now() - lastReport > 60000) {
      lastReport = performance.now();
      trackEvent('fps_drop', { fps: Math.round(fps) });
    }
  };
}
