/**
 * 屏幕挂雾滤镜（Pixi v8 Filter + GlProgram）
 * AC-02：全局湿度 ≥80% 时屏幕四边持续显示半透明水雾且色温向冷偏移
 * 约束：滤镜挂「覆盖全屏的雾 Sprite」（单个 Sprite），不挂 stage（R3）
 */
import { Filter, GlProgram } from 'pixi.js';

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uFog;      // 0..1 雾浓度（全局湿度映射）
uniform float uTime;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main(void) {
    vec4 fg = texture2D(uTexture, vTextureCoord);
    if (uFog <= 0.001) {
        gl_FragColor = fg;
        return;
    }
    vec2 uv = vTextureCoord;
    float n = noise(uv * 4.0 + vec2(uTime * 0.02, uTime * 0.015));
    vec2 d = uv - 0.5;
    // 四边更浓：边缘距离驱动
    float edge = smoothstep(0.5, 0.18, max(abs(d.x), abs(d.y)) - 0.2);
    float fog = clamp(uFog * (0.45 + n * 0.4) * (0.5 + edge), 0.0, 0.55);
    vec3 fogColor = vec3(0.875, 0.914, 0.918); // --fog-cool #DFE9EA
    fg.rgb = mix(fg.rgb, fogColor, fog);
    // 色温向冷偏移
    fg.rgb *= vec3(0.97, 1.0, 1.04);
    gl_FragColor = fg;
}
`;

export class FogFilter extends Filter {
  constructor() {
    super({
      glProgram: new GlProgram({ vertex: VERTEX, fragment: FRAGMENT }),
      resources: {
        fogUniforms: {
          uFog: { value: 0, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
        },
      },
    });
  }

  /** 全局湿度 0..1 → 雾浓度（AC-02：≥80% 明显起雾）；tSec 驱动雾流动 */
  setFog(globalHumidity: number, tSec: number): void {
    const u = this.resources.fogUniforms.uniforms;
    u.uFog = Math.max(0, Math.min(1, globalHumidity));
    u.uTime = tSec;
  }
}