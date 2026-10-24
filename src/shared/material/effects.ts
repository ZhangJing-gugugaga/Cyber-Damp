/**
 * 认可材质合成（移植 previews/visual-assets-2026-10-24/material-effects-lab/effects.js）
 *
 * - 只改 RGB，不碰 alpha（透明留白/非满方格轮廓保持原图）。
 * - type 0–5 霉变（绿苔侵角/蓝灰包边/赭黄侧蚀/灰紫菌岛/深青挂霉/粉灰扩散），
 *   6–8 水渍（底部浸水/纵向流挂/积水晕圈），9–11 焦化（底边烤焦/斜向烟熏/局部灼斑）。
 * - 水渍蓝色原图走暗沉路线（blue 判定随像素一起计算）。
 * - 随机款式按对象稳定派生（damageVariant），重绘/重启不变款。
 * - 纯函数零 DOM/Electron 依赖：主进程 ICO 合成与护理台污染层共用同一实现，
 *   保证"桌面图标 = 窗口里同一对象"。
 */

export type DamageFamily = 'damp' | 'mold' | 'char';

/** 12 款认可设计的基线与数量 */
const FAMILY_BASE: Record<DamageFamily, number> = { mold: 0, damp: 6, char: 9 };
const FAMILY_COUNT: Record<DamageFamily, number> = { mold: 6, damp: 3, char: 3 };

/** 按对象 ID 稳定派生款式（同对象同族恒定） */
export function damageVariant(objectId: string, family: DamageFamily): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < objectId.length; i += 1) h = Math.imul(h ^ objectId.charCodeAt(i), 0x01000193) >>> 0;
  return FAMILY_BASE[family] + (h % FAMILY_COUNT[family]);
}

export interface MaterialInput {
  /** RGBA 像素（原地修改）；建议 256×256 */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** 1=轻度 2=中度 3=重度；0 应完全不调用 */
  stage: 1 | 2 | 3;
  /** 款式编号（damageVariant 派生） */
  type: number;
}

export interface MaterialResult {
  /** 明显变色像素占不透明像素比例（轻度可辨性参考） */
  changed: number;
  /** 蓝色/近蓝原图（水渍走暗沉路线） */
  blue: boolean;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rough = (x: number, y: number) =>
  Math.sin(x * 0.13 + y * 0.05) * 0.036 + Math.sin(y * 0.19 - x * 0.07) * 0.026 + Math.cos(x * 0.31 + y * 0.24) * 0.012;

const MOLD_COLORS: Array<[number, number, number][]> = [
  [[94, 121, 75], [176, 193, 133], [225, 226, 185]],   // 绿苔侵角
  [[60, 91, 112], [137, 170, 185], [218, 230, 221]],   // 蓝灰包边
  [[112, 103, 46], [182, 161, 81], [231, 215, 153]],   // 赭黄侧蚀
  [[100, 79, 119], [163, 142, 175], [223, 213, 226]],  // 灰紫菌岛
  [[40, 102, 94], [97, 161, 143], [200, 226, 202]],    // 深青挂霉
  [[123, 74, 93], [193, 151, 157], [235, 214, 204]],   // 粉灰扩散
];

function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  return Math.hypot((x - cx) / rx, (y - cy) / ry);
}

function materialField(x: number, y: number, edge: number, s: number, type: number): { f: number } {
  const t = [0, 0.36, 0.52, 0.72][s];
  const w = rough(x * 256, y * 256);
  const a = Math.atan2(y - 0.49, x - 0.49);
  let f = 0;
  if (type === 0) f = (x * 0.68 + (1 - y) * 0.85) / (t * 1.55) + w;
  else if (type === 1) f = edge / [0, 12, 22, 34][s] + Math.sin(a * 5) * 0.18 + w * 2;
  else if (type === 2) f = (1 - x) / t + 0.12 * Math.sin(y * 15) + w;
  else if (type === 3) f = Math.min(ellipse(x, y, 0.29, 0.31, t * 0.65, t * 0.56), ellipse(x, y, 0.76, 0.78, t * 0.37, t * 0.46)) + w;
  else if (type === 4) {
    const stripe = Math.min(Math.abs(x - 0.25) / 0.11, Math.abs(x - 0.63) / 0.15, Math.abs(x - 0.86) / 0.07);
    f = Math.max(y / (t * 1.45), stripe) + w;
  } else if (type === 5) f = ellipse(x, y, 0.51, 0.53, t * 0.61, t * 0.57) + 0.12 * Math.sin(a * 7) + w;
  else if (type === 6) f = (1 - y) / (t * 1.24 + 0.025 * Math.sin(x * 19));
  else if (type === 7) {
    const stream = Math.min(ellipse(x, y, 0.24, 0.43, 0.09 + t * 0.12, 0.20 + t * 0.6), ellipse(x, y, 0.68, 0.34, 0.07 + t * 0.10, 0.17 + t * 0.55));
    f = stream + 0.06 * Math.sin(y * 22 + x * 9);
  } else if (type === 8) f = Math.min(ellipse(x, y, 0.32, 0.70, t * 0.86, t * 0.60), ellipse(x, y, 0.78, 0.31, t * 0.42, t * 0.46)) + w * 0.45;
  else if (type === 9) f = (1 - y) / (t * 1.17) + w * 1.5;
  else if (type === 10) f = Math.abs(y - (0.3 + x * 0.53)) / (t * 0.47) + w * 0.3;
  else if (type === 11) f = Math.min(ellipse(x, y, 0.73, 0.66, t * 0.65, t * 0.61), ellipse(x, y, 0.25, 0.28, t * 0.32, t * 0.38)) + w;
  return { f };
}

/**
 * 在 RGBA 数据上应用认可材质（原地修改 RGB）。stage/interval 语义与预览一致。
 */
export function applyDamageMaterial(input: MaterialInput): MaterialResult {
  const { data, width, height, stage, type } = input;
  const size = width * height;
  const at = (x: number, y: number) => (y * width + x) * 4;

  // 原图统计：不透明 bounds、蓝/近蓝判定（与预览同阈值）
  let colorful = 0;
  let blueCount = 0;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = at(x, y);
      if (data[i + 3] < 128) continue;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      if (hi - lo > 35) {
        colorful += 1;
        if ((b > r * 1.12 && b > g * 0.77) || (g > r * 1.35 && b > r * 1.35)) blueCount += 1;
      }
    }
  }
  if (maxX < minX || maxY < minY) return { changed: 0, blue: false };
  const isBlue = colorful > 0 && blueCount / colorful > 0.42;

  // 到透明的近似距离场（两遍扫描，同预览）
  const distance = new Float32Array(size);
  distance.fill(1000);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (data[at(x, y) + 3] < 128) distance[i] = 0;
      else distance[i] = Math.min(
        x ? distance[i - 1] + 1 : 1,
        y ? distance[i - width] + 1 : 1,
        x && y ? distance[i - width - 1] + 1.414 : 1000,
      );
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      distance[i] = Math.min(distance[i],
        x < width - 1 ? distance[i + 1] + 1 : 1,
        y < height - 1 ? distance[i + width] + 1 : 1,
        x < width - 1 && y < height - 1 ? distance[i + width + 1] + 1.414 : 1000);
    }
  }

  const original = new Uint8ClampedArray(data); // 变色计数参考
  let changed = 0;
  let opaque = 0;
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const i = at(x, y);
      if (data[i + 3] < 20) continue;
      opaque += 1;
      const nx = (x - minX) / bw;
      const ny = (y - minY) / bh;
      const { f } = materialField(nx, ny, distance[y * width + x], stage, type);
      let color: number[] | null = null;
      let opacity = 0;
      if (type < 6 && f < 1.08) {
        const palette = MOLD_COLORS[type];
        const spots = Math.sin(x * 0.38 + Math.sin(y * 0.18) * 2) * Math.cos(y * 0.34);
        color = f > 0.85 ? palette[2] : spots > 0.35 ? palette[0] : palette[1];
        opacity = f > 1 ? 0.65 : 0.92;
      } else if (type >= 6 && type <= 8 && f < 1.05) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        color = isBlue ? [20 + lum * 0.12, 30 + lum * 0.13, 43 + lum * 0.15] : [23, 100, 187];
        opacity = [0, 0.55, 0.66, 0.76][stage];
        if (f > 0.89) { color = isBlue ? [55, 69, 83] : [54, 153, 226]; opacity = 0.88; }
        if (type === 8 && f > 0.65 && f < 0.73) { color = isBlue ? [111, 124, 135] : [147, 211, 241]; opacity = 0.75; }
        if (type === 7 && Math.sin(x * 0.11 + y * 0.02) > 0.94) { color = isBlue ? [109, 125, 139] : [164, 225, 246]; opacity = 0.85; }
      } else if (type >= 9 && f < 1.08) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        color = type === 10 ? [52 + lum * 0.20, 49 + lum * 0.15, 47 + lum * 0.12] : [40, 32, 28];
        opacity = [0, 0.78, 0.88, 0.94][stage];
        if (f > 0.88) { color = [158, 104, 57]; opacity = 0.86; }
        if (type === 10 && Math.sin((x - y) * 0.09) > 0.75) { color = [156, 148, 130]; opacity = 0.62; }
        if (type === 11 && f < 0.85 && Math.abs(Math.sin(x * 0.09 + y * 0.055 + Math.sin(y * 0.08))) < 0.1) { color = [183, 131, 70]; opacity = 0.8; }
      }
      if (color && opacity > 0) {
        for (let k = 0; k < 3; k += 1) data[i + k] = Math.round(clamp(mix(data[i + k], color[k], opacity), 0, 255));
        const drift = Math.max(Math.abs(data[i] - original[i]), Math.abs(data[i + 1] - original[i + 1]), Math.abs(data[i + 2] - original[i + 2]));
        if (drift > 25) changed += 1;
      }
    }
  }
  void clamp;
  return { changed: opaque ? changed / opaque : 0, blue: isBlue };
}
