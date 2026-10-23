/** On-demand review only. Reuses Pixi extraction, current filters and path masks. */
import { Container, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import type { MaterialFilter } from './shaders/material-filter';

export function measureMaterialCoverage(renderer: Renderer, artwork: Container, icon: Sprite,
  material: MaterialFilter, masks: { pixels: number; source: HTMLCanvasElement; colonies: HTMLCanvasElement; fungi: HTMLCanvasElement }, size: number) {
  const pixels = masks.pixels;
  const canvas = () => { const value = document.createElement('canvas'); value.width = value.height = pixels; return value; };
  const rgba = (value: HTMLCanvasElement) => value.getContext('2d')!.getImageData(0, 0, pixels, pixels).data;
  const original = rgba(masks.source), colonies = rgba(masks.colonies), fungi = rgba(masks.fungi);
  const encoded = canvas(), context = encoded.getContext('2d')!, image = context.createImageData(pixels, pixels);
  for (let i = 0; i < original.length; i += 4) {
    image.data[i] = colonies[i + 3]; image.data[i + 1] = fungi[i + 3]; image.data[i + 2] = original[i + 3]; image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = Texture.from(encoded), root = new Container(), layer = new Container(), sprite = new Sprite(texture);
  layer.position.copyFrom(artwork.position); layer.pivot.copyFrom(artwork.pivot); layer.scale.copyFrom(artwork.scale);
  layer.skew.copyFrom(artwork.skew); layer.rotation = artwork.rotation;
  sprite.position.copyFrom(icon.position); sprite.anchor.copyFrom(icon.anchor); sprite.pivot.copyFrom(icon.pivot);
  sprite.width = icon.width; sprite.height = icon.height; sprite.rotation = icon.rotation;
  // Insert the diagnostic shader only if the live chain has no material pass.
  const filters = icon.filters ? Array.from(icon.filters) : [];
  sprite.filters = filters.includes(material) ? filters : [material, ...filters];
  root.addChild(layer); layer.addChild(sprite);
  const capture = () => renderer.extract.canvas({ target: root,
    frame: new Rectangle(icon.x, icon.y, size, size), resolution: pixels / size, antialias: true });
  let data: Uint8ClampedArray, projected: Uint8ClampedArray;
  try {
    material.setCoverageReview(1);
    data = capture().getContext('2d')!.getImageData(0, 0, pixels, pixels).data;
    material.setCoverageReview(2);
    projected = capture().getContext('2d')!.getImageData(0, 0, pixels, pixels).data;
  } finally {
    material.setCoverageReview(0); root.destroy({ children: true }); texture.destroy(true);
  }
  const channel = (values: Uint8ClampedArray, index: number) => {
    const value = canvas(), ctx = value.getContext('2d')!, result = ctx.createImageData(pixels, pixels);
    for (let i = 0; i < values.length; i += 4) {
      result.data[i] = result.data[i + 1] = result.data[i + 2] = 255;
      result.data[i + 3] = values[i + 3] ? values[i + index] : 0;
    }
    ctx.putImageData(result, 0, 0); return value;
  };
  const union = canvas(), ctx = union.getContext('2d')!, result = ctx.createImageData(pixels, pixels);
  let total = 0, covered = 0, projectedVisible = 0;
  for (let i = 0; i < original.length; i += 4) {
    if (projected[i + 3] && projected[i] >= 128) projectedVisible++;
    if (original[i + 3] < 128) continue;
    total++;
    if (data[i + 3] && (data[i] >= 13 || data[i + 1] >= 13 || data[i + 2] >= 13)) {
      covered++; result.data[i] = result.data[i + 1] = result.data[i + 2] = result.data[i + 3] = 255;
    }
  }
  ctx.putImageData(result, 0, 0);
  return { scope: 'mildew-fungi-scorch-crease-after-deformation' as const, pixels, total, covered, ratio: total ? covered / total : 0,
    projectedVisible, areaRatio: total ? projectedVisible / total : 0, scale: { x: artwork.scale.x, y: artwork.scale.y },
    source: masks.source, colonies: channel(data, 0), fungi: channel(data, 1), material: channel(data, 2), projected: channel(projected, 0), union };
}
