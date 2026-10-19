/**
 * 老式绿头摇头电扇：独立底座、网罩与叶轮栅格素材。
 * 底座固定；扇头透视摇动；叶轮在网罩后独立绕轴旋转。
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { propTexture } from './mushroom-assets';
import { ENV_COLOR } from './token-colors';

const FAN_BODY = 0x4e7b5a; // --fan-body（token 映射）

export class FanView {
  readonly container = new Container();
  private readonly head = new Container();
  private readonly blades = new Graphics();
  private readonly cage = new Graphics();
  private baseArt: Sprite | null = null;
  private rotor: Sprite | null = null;

  constructor() {
    const base = propTexture('fan-base');
    const cage = propTexture('fan-cage');
    const rotor = propTexture('fan-rotor');
    if (base && cage && rotor) {
      this.baseArt = new Sprite(base);
      this.baseArt.anchor.set(0.5, 1);
      this.baseArt.width = 64;
      this.baseArt.scale.y = this.baseArt.scale.x;
      this.rotor = new Sprite(rotor);
      // The three-blade silhouette is asymmetric. Its axle is at (330,940)
      // in the generated 1280px sheet, not at the trimmed bounding-box centre.
      this.rotor.pivot.set(rotor.source.width * 330 / 1280 - rotor.frame.x,
        rotor.source.height * 940 / 1280 - rotor.frame.y);
      this.rotor.scale.set(72 / (rotor.source.width * 0.44));
      const grille = new Sprite(cage);
      grille.anchor.set(0.5);
      grille.width = 88;
      grille.scale.y = grille.scale.x;
      this.head.position.set(0, -70);
      this.head.addChild(this.rotor, grille);
      this.container.addChild(this.baseArt, this.head);
      this.container.eventMode = 'none';
      return;
    }
    const g = new Graphics();
    // 底座与立柱
    g.ellipse(0, 0, 22, 6).fill({ color: FAN_BODY, alpha: 0.9 });
    g.rect(-3, -46, 6, 46).fill({ color: FAN_BODY, alpha: 0.85 });
    this.blades.rect(-2, -48, 4, 4).fill({ color: FAN_BODY });
    // 三叶扇叶
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.blades.ellipse(Math.cos(a) * 10, -66 + Math.sin(a) * 10, 11, 5)
        .fill({ color: ENV_COLOR.fog, alpha: 0.85 });
    }
    this.cage.circle(0, -66, 24).stroke({ width: 2, color: FAN_BODY, alpha: 0.9 });
    this.cage.circle(0, -66, 16).stroke({ width: 1, color: FAN_BODY, alpha: 0.5 });
    this.head.addChild(this.blades, this.cage);
    this.head.position.set(0, 0);
    this.container.addChild(g, this.head);
    this.container.eventMode = 'none';
  }

  /** tSec 驱动，独立于帧率；头部 ±40° 摇头（周期 4s）。 */
  update(tSec: number, running: boolean): void {
    if (this.rotor) {
      const yaw = running ? Math.sin(tSec * Math.PI / 2) * 0.7 : 0;
      this.head.scale.x = Math.cos(yaw);
      this.head.position.x = Math.sin(yaw) * 3;
      if (running) this.rotor.rotation = (tSec * 18) % (Math.PI * 2);
      return;
    }
    if (running) {
      this.blades.rotation = (tSec * 18) % (Math.PI * 2);
      this.head.rotation = Math.sin(tSec * (Math.PI * 2 / 4)) * 0.7;
    }
  }

  /** Read-only native-UAT evidence; no animation controls. */
  snapshot(): { baseWidth: number; baseHeight: number; headScaleX: number; headX: number; rotorAngle: number } {
    return { baseWidth: this.baseArt?.width ?? 0, baseHeight: this.baseArt?.height ?? 0,
      headScaleX: this.head.scale.x, headX: this.head.x, rotorAngle: this.rotor?.rotation ?? this.blades.rotation };
  }
}
