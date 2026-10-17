/**
 * 场景图层分层（view 层）
 * SPEC §8：in-world（Pixi 画布）与 chrome（DOM 覆盖层）严格分层
 * z 序：环境雾底 → 文件替身 → 绳与道具 → 蘑菇 → 粒子 → 演出覆盖
 */
import { Container } from 'pixi.js';

export class WorldLayers {
  readonly root = new Container();
  readonly fogLayer = new Container();      // 挂雾/色温（最底）
  readonly fileLayer = new Container();     // 文件替身
  readonly propLayer = new Container();     // 晾衣绳 + 衣夹 + 家电
  readonly shroomLayer = new Container();   // 蘑菇 + 蜗牛
  readonly fxLayer = new Container();       // 粒子（水珠/墨点/颜料/孢子）
  readonly overlayLayer = new Container();  // 演出覆盖（时光坍缩）

  constructor() {
    this.root.addChild(
      this.fogLayer,
      this.fileLayer,
      this.propLayer,
      this.shroomLayer,
      this.fxLayer,
      this.overlayLayer,
    );
    this.fogLayer.eventMode = 'none';
    this.overlayLayer.eventMode = 'none';
  }
}