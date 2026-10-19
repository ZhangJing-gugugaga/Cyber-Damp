import { Container, Filter, GlProgram, Graphics, Rectangle, type Application } from 'pixi.js';
import { materialVertex } from './shaders/material-filter';
import { DesktopRipple } from './desktop-ripple';

const fragment = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uStrength;
void main() {
  vec2 pixel=vTextureCoord*uInputSize.xy;
  vec2 radial=pixel-uInputSize.xy*0.5;
  float distance=length(radial);
  vec2 ripples=radial/max(distance,1.0)*sin(distance*0.048-uTime*7.0)*5.5;
  ripples+=vec2(sin(pixel.y*0.037+uTime*5.3)*6.0,cos(pixel.x*0.029-uTime*4.0)*4.0);
  vec2 samplePoint=clamp(vTextureCoord+ripples*uInputSize.zw*uStrength,uInputClamp.xy,uInputClamp.zw);
  // Keep the sampled premultiplied alpha: no opaque sheet over the real wallpaper.
  gl_FragColor=texture(uTexture,samplePoint);
}`;

/** Eight-second raw-bolete hallucination, confined to Cyber Damp's desktop layer. */
export class Hallucination {
  private readonly people = new Graphics();
  private readonly ripple = new Filter({
    glProgram: new GlProgram({ vertex: materialVertex, fragment }),
    resources: { hallucination: { uTime: { value: 0, type: 'f32' }, uStrength: { value: 0, type: 'f32' } } },
  });
  private remaining = 0;
  private time = 0;
  private applied = false;
  private previousArea: Rectangle | undefined;
  private readonly overlay = new Container();
  private readonly desktop = new DesktopRipple();

  constructor(private readonly app: Application) {
    this.overlay.eventMode = 'none'; this.overlay.addChild(this.people);
    this.app.stage.addChild(this.overlay); this.overlay.visible = false;
  }

  trigger(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (!this.applied) {
      this.previousArea = this.app.stage.filterArea;
      this.app.stage.filters = [...(this.app.stage.filters ?? []), this.ripple];
      this.applied = true;
    }
    this.remaining = seconds; this.time = 0; this.overlay.visible = true;
    this.desktop.start();
    this.app.stage.filterArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
  }

  update(dt: number): void {
    if (this.remaining <= 0) return;
    this.time += dt; this.remaining = Math.max(0, this.remaining - dt);
    if (!this.remaining) { this.stop(); return; }
    const strength = Math.min(1, this.time / 0.25, this.remaining / 0.6);
    Object.assign(this.ripple.resources.hallucination.uniforms, { uTime: this.time, uStrength: strength });
    this.desktop.update(this.time, strength, this.app.screen.width, this.app.screen.height);
    const g = this.people; g.clear();
    const colors = [0xf78ba7, 0xf2bf5c, 0xace68d, 0x8ee7e5, 0xb3a1fb, 0xf3a8e6];
    const width = this.app.screen.width;
    const count = Math.min(24, Math.ceil(width / 58) + 2);
    for (let i = 0; i < count; i++) {
      const x = ((this.time * 142 + i * 58) % (width + 150)) - 75;
      const y = this.app.screen.height * 0.53 + Math.sin(this.time * 2.2 + i * 0.32) * 11;
      const step = Math.sin(this.time * 7 + i * 0.8) > 0 ? 3 : -3;
      const color = colors[i % colors.length], alpha = 0.48 * strength;
      // Deliberate square pixels: a tiny translucent procession, never a text label.
      g.rect(x - 4, y - 22, 8, 8).rect(x - 5, y - 12, 10, 13)
        .rect(x - 10, y - 10 + step, 5, 4).rect(x + 5, y - 10 - step, 5, 4)
        .rect(x - 5, y + 1, 4, 8 + step).rect(x + 1, y + 1, 4, 8 - step)
        .fill({ color, alpha });
      g.rect(x + 1, y - 20, 2, 2).fill({ color: 0xffffff, alpha: alpha * 0.8 });
    }
  }

  private stop(): void {
    this.remaining = 0; this.overlay.visible = false; this.people.clear();
    this.desktop.stop();
    if (!this.applied) return;
    this.app.stage.filters = (this.app.stage.filters ?? []).filter((filter) => filter !== this.ripple);
    this.app.stage.filterArea = this.previousArea;
    this.applied = false;
  }

  destroy(): void { this.stop(); this.desktop.destroy(); this.overlay.destroy({ children: true }); this.ripple.destroy(); }
}
