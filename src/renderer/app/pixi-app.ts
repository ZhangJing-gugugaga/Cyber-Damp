/**
 * Pixi 应用工厂（app 层）
 * Pixi v8 异步 init（无同步构造）；透明画布 + DPR 上限 2（R3）
 */
import { Application } from 'pixi.js';

export async function createPixiApp(): Promise<Application> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resizeTo: window,
    preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  return app;
}
