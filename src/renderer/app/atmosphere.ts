/**
 * 环境表现层（app 装配层）：挂雾 / CPU 出汗 / 电扇
 * AC-02：全局湿度 ≥80% 四边起雾 + 色温偏冷（FogFilter 挂单个全屏雾 Sprite，不挂 stage）
 * AC-05：CPU 连续 5s >80% 顶框汗珠滴落（粒子预算内）
 */
import { Sprite, Texture } from 'pixi.js';
import type { Application } from 'pixi.js';
import { FanView } from '../view/fan-view';
import type { WorldLayers } from '../view/layers';
import type { ParticlePool } from '../view/particles';
import { ENV_COLOR } from '../view/token-colors';
import type { WorldRuntime } from './world-runtime';

/** AC-02 起雾阈值：湿度 ≥80% 明显起雾（65% 起淡雾过渡） */
const FOG_ONSET = 0.65;

export class Atmosphere {
  private readonly fogSprite: Sprite;
  private readonly fan: FanView | null = null;
  private sweatAcc = 0;
  /** 开场演出强制雾强度覆盖（0..1，演出结束归 -1 交还天气驱动） */
  introFog = -1;
  /** 刮水器擦除系数（1=完整雾；刮动下降，随时间缓恢复） */
  private fogOverride = 1;

  constructor(private app: Application, private layers: WorldLayers) {
    // 全屏雾 Sprite：Texture.WHITE 拉伸（滤镜只挂单个 Sprite——R3 纪律）
    // Fog has no sharp detail. Bake the stable edge texture once instead of
    // running a full-resolution offscreen noise filter on every frame.
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.max(1, Math.round(512 * app.screen.height / app.screen.width));
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const px = x / canvas.width * app.screen.width, py = y / canvas.height * app.screen.height;
      const distance = Math.min(px, py, app.screen.width - px, app.screen.height - py);
      const t = Math.min(1, distance / 80), edge = 1 - t * t * (3 - 2 * t);
      const noise = .5 + .25 * Math.sin(x * .039 + Math.sin(y * .021)) + .25 * Math.cos(y * .049 - x * .017);
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = 223; pixels.data[i + 1] = 233; pixels.data[i + 2] = 234;
      pixels.data[i + 3] = Math.round(edge * (.18 + noise * .22) * 255);
    }
    context.putImageData(pixels, 0, 0);
    this.fogSprite = new Sprite(Texture.from(canvas));
    this.fogSprite.width = app.screen.width;
    this.fogSprite.height = app.screen.height;
    this.fogSprite.eventMode = 'none';
    this.layers.fogLayer.addChild(this.fogSprite);
  }

  /** 购买电扇后调用：右下角放置 */
  placeFan(): FanView {
    const fan = new FanView();
    fan.container.position.set(this.app.screen.width - 120, this.app.screen.height - 130);
    this.layers.propLayer.addChild(fan.container);
    return fan;
  }

  /** 刮水器：拖动擦除雾（P1）。dist=位移 px；回南天水汽会慢慢爬回来 */
  wipe(dist: number): void {
    this.fogOverride = Math.max(0, this.fogOverride - dist * 0.0006);
  }

  update(rt: WorldRuntime, dtSec: number, tSec: number, pool: ParticlePool, fan: FanView | null): void {
    // 挂雾强度：introFog 覆盖 > 天气湿度映射 × 刮水器擦除系数；擦除后缓慢恢复
    this.fogOverride = Math.min(1, this.fogOverride + dtSec * 0.03);
    const day = rt.dayWeather();
    const weatherFog = Math.max(0, Math.min(1, (day.humidity - FOG_ONSET) / (1 - FOG_ONSET)));
    const fog = (this.introFog >= 0 ? this.introFog : weatherFog) * this.fogOverride;
    this.fogSprite.alpha = fog * (.96 + .04 * Math.sin(tSec * .08));
    this.fogSprite.visible = fog > 0.01;

    // CPU 出汗：顶框汗珠滴落（AC-05；预算内限频）
    if (rt.sweating) {
      this.sweatAcc += dtSec;
      const interval = 0.12;
      while (this.sweatAcc >= interval) {
        this.sweatAcc -= interval;
        pool.spawn({
          x: Math.random() * this.app.screen.width,
          y: 0,
          vx: (Math.random() - 0.5) * 12,
          vy: 30 + Math.random() * 40,
          gravity: 260,
          color: ENV_COLOR.sweat,
          size: 2 + Math.random() * 2,
          life: 2.4,
          shape: 'circle',
          alpha: 0.7,
        });
      }
    } else {
      this.sweatAcc = 0;
    }

    fan?.update(tSec, rt.fanPlaced);
  }
}
