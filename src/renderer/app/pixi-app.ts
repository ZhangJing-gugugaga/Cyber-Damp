/**
 * Pixi 应用工厂（app 层）
 * Pixi v8 异步 init（无同步构造）；透明画布 + DPR 上限 2（R3）
 * R10：WebGL 上下文丢失阻止默认行为（Chromium 自动恢复，纹理由 Pixi 重建）
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
  // AC-27/R10：上下文丢失不白屏（阻止默认销毁，renderer 进程保持存活）
  app.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('[pixi] WebGL 上下文丢失，等待自动恢复');
  });
  return app;
}
