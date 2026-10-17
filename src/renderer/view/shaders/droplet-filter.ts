/**
 * 水珠受潮滤镜（Pixi v8 Filter + GlProgram，架构 §5.3 样板）
 * 诚实约束：透明合成窗口的 WebGL 画布无法采样桌面背后像素——「折射桌面背景」
 * 物理不可实现；本滤镜改为对图标自身纹理做局部折射偏移 + 高光 + 暗环（视觉等价）
 * 约束：滤镜只挂单个 Sprite，禁止挂 stage（全屏挂 stage 每帧全图采样，Win 掉帧）
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
uniform float uTime;
uniform float uDroplets;   // 水珠密度 0..1（由 file humidity 驱动）

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 程序化水滴高度场：环状凸起 + 重力下滑轨迹
float heightField(vec2 uv) {
    float h = 0.0;
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 c = vec2(0.25 + fi * 0.18, fract(hash(vec2(fi, 7.0)) + uTime * 0.03));
        float d = length((uv - c) * vec2(1.0, 1.4));
        h += smoothstep(0.09, 0.0, d);
    }
    return h;
}

void main(void) {
    vec2 uvs = vTextureCoord;
    float h = heightField(uvs) * uDroplets;
    vec2 offset = vec2(h * 0.012, h * 0.02);
    vec4 fg = texture2D(uTexture, clamp(uvs + offset, 0.0, 1.0));
    fg.rgb += vec3(0.35) * h;                        // 近白高光（#F4FAFB 近似）
    fg.rgb *= 1.0 - 0.25 * step(0.02, h) * uDroplets; // 边缘暗环
    gl_FragColor = fg;
}
`;

export class DropletFilter extends Filter {
  constructor() {
    super({
      glProgram: new GlProgram({ vertex: VERTEX, fragment: FRAGMENT }),
      resources: {
        timeUniforms: {
          uTime: { value: 0, type: 'f32' },
          uDroplets: { value: 0, type: 'f32' },
        },
      },
    });
  }

  /** humidity 0..1 → 水珠密度；tSec 驱动下滑 */
  setHumidity(h: number, tSec: number): void {
    const u = this.resources.timeUniforms.uniforms;
    u.uTime = tSec;
    u.uDroplets = Math.max(0, Math.min(1, h));
  }
}