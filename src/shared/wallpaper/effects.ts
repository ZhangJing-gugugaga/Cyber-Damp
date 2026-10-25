/**
 * 壁纸天气效果纯像素合成（R9 v0.2；Task 14）
 *
 * 零 Win32/零 DOM：输入原壁纸 RGBA 像素 + 天气条件，输出合成副本；
 * 同一输入得到同一输出（噪声由 seed 的稳定哈希决定）。员工 2 把输出写入
 * %APPDATA%/cyber-damp/wallpaper/ 副本后设为壁纸；本模块绝不触碰原壁纸文件。
 *
 * 规则（参数表/R9）：
 * - 雾层随湿度单调增强（40% 起雾，95% 封顶），警报期 ×1.35 强化；
 * - 降水码出现水痕（不分级）；雾 45/48 加重雾层；
 * - 墙角霉斑 0–3 档只在警报期增长（等级由 damp-alert 模块维护）；
 * - 晴天低湿时雾层自然减弱（强度公式本身单调）；
 * - 擦雾掩码（care-mask 编码，1=已擦净）内的格子不上雾。
 */
import type { WallpaperEffectInput } from '../types/gameplay';
import { PRECIPITATION_CODES } from '../types/native';
import { decodeCareMask, CARE_MASK_CELLS } from '../care-mask';

export interface ComposeWallpaperInput extends WallpaperEffectInput {
  /** 原壁纸 RGBA 像素（长度 = width*height*4）；不改写该缓冲 */
  base: Uint8ClampedArray;
}

export interface ComposeWallpaperOutput {
  rgba: Uint8ClampedArray;
  /** 实际雾层强度 0..1（诊断/预览显示用） */
  fogLevel: number;
  /** 是否绘制了水痕 */
  hasStreaks: boolean;
}

/** 雾层强度：湿度单调，天气加成，警报强化；封顶 0.85。 */
export function fogLevelFor(input: Pick<WallpaperEffectInput, 'humidityPct' | 'weatherCode' | 'alertActive'>): number {
  const humidityPart = Math.max(0, Math.min(1, (input.humidityPct - 40) / 55)) * 0.45;
  let level = humidityPart;
  if (input.weatherCode === 45 || input.weatherCode === 48) level += 0.2;
  else if (PRECIPITATION_CODES.has(input.weatherCode)) level += 0.12;
  if (input.alertActive) level *= 1.35;
  return Math.min(0.85, level);
}

/** 稳定像素噪声：同 seed 同坐标同值（0..1）。块状（4px）以省性能。 */
function noise2(seed: number, x: number, y: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x * 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (y * 0x27d4eb2f), 0x165667b1) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}


/**
 * 合成壁纸效果副本（纯函数；不修改 base）。
 * 性能：1920×1080 纯 JS 单次合成在测试环境毫秒级～几十毫秒，可接受（R9"每天次数有限"）。
 */
export function composeWallpaperEffect(input: ComposeWallpaperInput): ComposeWallpaperOutput {
  const { width, height, seed } = input;
  const out = new Uint8ClampedArray(input.base);
  const fogLevel = fogLevelFor(input);
  const hasStreaks = PRECIPITATION_CODES.has(input.weatherCode);
  const wiped = input.fogMask ? decodeCareMask(input.fogMask) : null;
  const cellW = width / 64;
  const cellH = height / 64;
  const fogColor = [232, 240, 246] as const;
  const streakColor = [198, 214, 230] as const;
  const moldColor = [58, 70, 46] as const;
  const minDim = Math.min(width, height);
  const moldRadius = (input.cornerMoldStage / 3) * 0.22 * minDim;
  const corners: Array<[number, number]> = [
    [0, 0], [width, 0], [0, height], [width, height],
  ];
  const streakCount = hasStreaks ? Math.floor(width / 90) : 0;
  const streaks: Array<{ x: number; w: number; a: number }> = [];
  for (let k = 0; k < streakCount; k += 1) {
    streaks.push({
      x: Math.floor(noise2(seed + 101, k, 7) * width),
      w: 2 + Math.floor(noise2(seed + 202, k, 13) * 3),
      a: 0.08 + noise2(seed + 303, k, 17) * 0.1,
    });
  }
  for (let y = 0; y < height; y += 1) {
    const ny = Math.floor(y / 4);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (input.base[i + 3] === 0) continue;
      let r = input.base[i];
      let g = input.base[i + 1];
      let b = input.base[i + 2];
      // 1) 水痕（降水）：确定性竖条
      if (hasStreaks) {
        for (const s of streaks) {
          if (x >= s.x && x < s.x + s.w) {
            const taper = 0.7 + 0.3 * noise2(seed + 404, x, ny);
            r = r * (1 - s.a * taper) + streakColor[0] * s.a * taper;
            g = g * (1 - s.a * taper) + streakColor[1] * s.a * taper;
            b = b * (1 - s.a * taper) + streakColor[2] * s.a * taper;
          }
        }
      }
      // 2) 雾层：湿度单调 + 噪声起伏；擦净格跳过
      if (fogLevel > 0) {
        const cell = Math.min(63, Math.floor(y / cellH)) * 64 + Math.min(63, Math.floor(x / cellW));
        const wipedHere = wiped ? wiped[cell] === 1 : false;
        if (!wipedHere && cell < CARE_MASK_CELLS) {
          const n = 0.72 + 0.28 * noise2(seed, Math.floor(x / 4), ny);
          const fog = Math.min(0.9, fogLevel * n);
          r = r * (1 - fog) + fogColor[0] * fog;
          g = g * (1 - fog) + fogColor[1] * fog;
          b = b * (1 - fog) + fogColor[2] * fog;
        }
      }
      // 3) 墙角霉斑（仅警报期等级 > 0）
      if (moldRadius > 0) {
        for (const [cx, cy] of corners) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < moldRadius) {
            const falloff = 1 - dist / moldRadius;
            const blotch = noise2(seed + 505, Math.floor(x / 3), Math.floor(y / 3));
            if (blotch > 0.42 - falloff * 0.2) {
              const a = 0.38 * falloff * (input.cornerMoldStage / 3);
              r = r * (1 - a) + moldColor[0] * a;
              g = g * (1 - a) + moldColor[1] * a;
              b = b * (1 - a) + moldColor[2] * a;
            }
          }
        }
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = input.base[i + 3];
    }
  }
  return { rgba: out, fogLevel, hasStreaks };
}
