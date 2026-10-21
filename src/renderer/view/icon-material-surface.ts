import type { Sprite } from 'pixi.js';
import type { MaterialFilter } from './shaders/material-filter';

/** Alpha sampling is restricted to the Shell icon, never the underlying document. */
export class IconMaterialSurface {
  private readonly pixels: Uint8ClampedArray | null;
  private bottom = { u: 0.5, v: 1 };
  readonly pigmentColor: number;

  constructor(private readonly icon: Sprite | null, private readonly material: MaterialFilter) {
    let pixels: Uint8ClampedArray | null = null;
    if (icon) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          ctx.drawImage(icon.texture.source.resource as CanvasImageSource, 0, 0, 64, 64);
          pixels = ctx.getImageData(0, 0, 64, 64).data;
        } catch { /* Non-raster fallback cannot reliably receive an alpha-clipped stain. */ }
      }
    }
    this.pixels = pixels;
    const palette: number[] = [];
    if (pixels) {
      // Find the lowest visible central pixel (native icons include transparent margins).
      outer: for (let y = 63; y >= 0; y--) for (let dx = 0; dx <= 12; dx++) {
        for (const x of [32 - dx, 32 + dx]) {
          if (pixels[(y * 64 + x) * 4 + 3] > 128) {
            this.bottom = { u: (x + 0.5) / 64, v: (y + 1) / 64 }; break outer;
          }
        }
      }
      for (let i = 0; i < pixels.length; i += 28) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (pixels[i + 3] > 200 && Math.max(r, g, b) - Math.min(r, g, b) > 75) palette.push((r << 16) | (g << 8) | b);
      }
    }
    this.pigmentColor = palette[Math.floor(palette.length * 0.37)] ?? 0x2a91cd;
  }

  get dripOrigin(): { x: number; y: number } | null {
    if (!this.icon) return null;
    return this.icon.toGlobal({ x: this.bottom.u * this.icon.texture.orig.width, y: this.bottom.v * this.icon.texture.orig.height });
  }

  /** Reuse the cached native-alpha sample to attach roots to actual icon pixels. */
  nearestOpaque(u: number, v: number): { u: number; v: number } | null {
    if (!this.pixels) return null;
    let distance = Infinity, nearest: { u: number; v: number } | null = null;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (this.pixels[(y * 64 + x) * 4 + 3] <= 128) continue;
      const px = (x + .5) / 64, py = (y + .5) / 64, d = (px - u) ** 2 + (py - v) ** 2;
      if (d < distance) { distance = d; nearest = { u: px, v: py }; }
    }
    return nearest;
  }

  hit(x: number, y: number): { u: number; v: number } | null {
    if (!this.icon || !this.pixels) return null;
    const local = this.icon.toLocal({ x, y });
    const u = local.x / this.icon.texture.orig.width, v = local.y / this.icon.texture.orig.height;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
    return this.pixels[(Math.floor(v * 64) * 64 + Math.floor(u * 64)) * 4 + 3] > 128 ? { u, v } : null;
  }

  addStain(u: number, v: number, color: number): void { this.material.addPaintStain(u, v, color); }
  clearStains(): void { this.material.clearPaintStains(); }
}
