/**
 * 霉斑青苔滤镜（Pixi v8 Filter + GlProgram）
 * 值噪声 + 阈值：青苔从四角向中心蔓延（SPEC §6.3 中度/重度视觉）
 * uMoss 0..1 由 file.mold 驱动；uPhase 驱动蔓延推进
 * 约束：只挂单个 Sprite（禁挂 stage）
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
uniform float uMoss;
uniform float uPhase;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y);
}

void main(void) {
    vec4 fg = texture2D(uTexture, vTextureCoord);
    if (uMoss <= 0.001) {
        gl_FragColor = fg;
        return;
    }
    // 四角距离场（四蔓延源）
    vec2 uv = vTextureCoord;
    vec2 d1 = min(uv, 1.0 - uv);            // 最近两轴距离
    float edgeDist = min(d1.x, d1.y);        // 距边缘
    float corner = length(uv - 0.5);         // 距中心
    float n = noise(uv * 6.0 + uPhase * 0.1);
    // 蔓延推进：coverage 越大阈值越低；noise 打碎边缘成绒毛
    float threshold = (1.0 - uMoss) * 0.85;
    float mask = step(threshold + n * 0.22, 1.0 - edgeDist * 1.6 + uMoss * 0.3);
    mask *= smoothstep(0.5, 0.2, corner - uMoss * 0.15);
    // 青苔双色渐变（--damp-2-moss → --damp-3-moss-deep）
    vec3 moss = mix(vec3(0.431, 0.498, 0.306), vec3(0.271, 0.329, 0.184), uMoss);
    fg.rgb = mix(fg.rgb, moss, mask * uMoss * 0.85);
    gl_FragColor = fg;
}
`;

export class MoldFilter extends Filter {
  constructor() {
    super({
      glProgram: new GlProgram({ vertex: VERTEX, fragment: FRAGMENT }),
      resources: {
        mossUniforms: {
          uMoss: { value: 0, type: 'f32' },
          uPhase: { value: 0, type: 'f32' },
        },
      },
    });
  }

  /** mold 0..1 → 覆盖率；tSec 驱动蔓延噪声相位 */
  setMold(m: number, tSec: number): void {
    const u = this.resources.mossUniforms.uniforms;
    u.uMoss = Math.max(0, Math.min(1, m));
    u.uPhase = tSec;
  }
}