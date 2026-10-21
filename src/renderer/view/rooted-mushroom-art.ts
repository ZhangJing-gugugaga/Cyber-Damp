import { MeshPlane, pointInTriangle, type Texture } from 'pixi.js';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, n: number) => { const k = clamp((n - a) / (b - a)); return k * k * (3 - 2 * k); };

/** Reuses Pixi 8.21 MeshPlane's indexed geometry and vertex buffer update API.
 * https://github.com/pixijs/pixijs/blob/v8.21.0/src/scene/mesh-plane/MeshPlane.ts
 * Only the rooted growth/anger displacement is project-specific. */
export class RootedMushroomArt extends MeshPlane {
  private readonly rest: Float32Array;
  constructor(texture: Texture) {
    super({ texture, verticesX: 7, verticesY: 11 });
    this.autoResize = false;
    this.pivot.set(texture.width / 2, texture.height);
    this.rest = new Float32Array(this.geometry.getBuffer('aPosition').data);
  }

  updateShape(growth: number, time: number, anger: number): void {
    const { width, height } = this.texture;
    const stem = .035 + .965 * smooth(0, .85, growth);
    const cap = .08 + .92 * smooth(.25, 1, growth);
    const sway = Math.sin(time * (1.7 + anger * 2.5)) * (.012 + anger * .035);
    const breath = Math.sin(time * (2.1 + anger * 3.5)) * (.008 + anger * .10);
    const buffer = this.geometry.getBuffer('aPosition'), vertices = buffer.data;
    for (let i = 0; i < this.rest.length; i += 2) {
      const x = this.rest[i], y = this.rest[i + 1], upper = 1 - y / height, weight = upper * upper;
      const opening = (1 - weight) * (.3 + .7 * stem) + weight * cap;
      vertices[i] = width / 2 + (x - width / 2) * opening * (1 + breath * weight) + width * sway * weight * growth;
      vertices[i + 1] = height - (height - y) * stem * (1 + breath * weight * .25);
    }
    buffer.update();
  }

  /** Map the actual deformed triangle back to texture UV for alpha hit testing. */
  sourceUV(point: { x: number; y: number }): { u: number; v: number } | null {
    const vertices = this.geometry.getBuffer('aPosition').data;
    const uvs = this.geometry.getBuffer('aUV').data, indices = this.geometry.getIndex().data;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 2, b = indices[i + 1] * 2, c = indices[i + 2] * 2;
      const ax = vertices[a], ay = vertices[a + 1], bx = vertices[b], by = vertices[b + 1], cx = vertices[c], cy = vertices[c + 1];
      if (!pointInTriangle(point.x, point.y, ax, ay, bx, by, cx, cy)) continue;
      const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(denominator) < 1e-8) continue;
      const wa = ((by - cy) * (point.x - cx) + (cx - bx) * (point.y - cy)) / denominator;
      const wb = ((cy - ay) * (point.x - cx) + (ax - cx) * (point.y - cy)) / denominator, wc = 1 - wa - wb;
      return { u: uvs[a] * wa + uvs[b] * wb + uvs[c] * wc, v: uvs[a + 1] * wa + uvs[b + 1] * wb + uvs[c + 1] * wc };
    }
    return null;
  }
}
