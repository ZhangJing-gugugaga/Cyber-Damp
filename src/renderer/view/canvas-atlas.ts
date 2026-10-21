import { Rectangle, Texture } from 'pixi.js';

interface Page { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: Texture; cell: number; used: Set<number> }
const pages: Page[] = [];

/** Pack animated icon canvases so one frame uploads a few atlas pages rather
 * than synchronizing a separate WebGL texture for every desktop icon. */
export function allocateCanvasRegion(size: number) {
  const cell = 2 ** Math.ceil(Math.log2(size));
  let page = pages.find(candidate => candidate.cell === cell && candidate.used.size < 16);
  if (!page) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = cell * 4;
    page = { canvas, context: canvas.getContext('2d')!, texture: Texture.from(canvas), cell, used: new Set() };
    pages.push(page);
  }
  const owner = page;
  let slot = 0; while (owner.used.has(slot)) slot++;
  owner.used.add(slot);
  const x = slot % 4 * cell, y = Math.floor(slot / 4) * cell;
  const texture = new Texture({ source: owner.texture.source, frame: new Rectangle(x, y, size, size) });
  let destroyed = false;
  return {
    texture,
    update(canvas: HTMLCanvasElement) {
      if (destroyed) return;
      owner.context.clearRect(x, y, cell, cell);
      owner.context.drawImage(canvas, x, y);
      owner.texture.source.update();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; texture.destroy(false); owner.used.delete(slot);
      if (owner.used.size === 0) { owner.texture.destroy(true); pages.splice(pages.indexOf(owner), 1); }
    },
  };
}
