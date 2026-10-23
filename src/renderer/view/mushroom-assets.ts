import { Assets, Rectangle, Texture } from 'pixi.js';
import atlasUrl from '../assets/mushrooms-atlas.png?url';
import propsUrl from '../assets/household-atlas.png?url';
import boleteUrl from '../assets/bolete-intact.png?url';
import fanPartsUrl from '../assets/fan-parts.png?url';
import shyFramesUrl from '../assets/pvz-shy-frames.png?url';
import lavaFramesUrl from '../assets/pvz-lava-frames.png?url';
import { PVZ_FRAMES } from '../assets/pvz-frames';
import type { MushroomSpecies } from '../../shared/types/file-runtime';

const textures = new Map<string, Texture>();
const animated = new Map<string, { frames: Texture[]; ends: number[]; duration: number }>();

/** Trim each atlas cell at load time so its stem, not transparent padding,
 * anchors on the top visible pixel of the native icon. */
export async function loadMushroomAssets(): Promise<void> {
  Assets.setPreferences({ preferWorkers: false, preferCreateImageBitmap: false });
  await Promise.all([
    loadAtlas(atlasUrl, ['oyster', null, null, null]),
    loadFrames('shy', shyFramesUrl),
    loadFrames('lava', lavaFramesUrl),
    loadAtlas(propsUrl, ['fan', 'box', 'clip', 'thermometer']),
    loadAtlas(boleteUrl, ['bolete'], 1),
    loadAtlas(fanPartsUrl, ['fan-base', 'fan-cage', 'fan-rotor', null]),
  ]);
  const thermometer = textures.get('thermometer');
  if (thermometer) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const f = thermometer.frame;
    c.getContext('2d')?.drawImage(thermometer.source.resource as HTMLImageElement, f.x, f.y, f.width, f.height, 10, 0, 10, 32);
    document.documentElement.style.setProperty('--hygrometer-cursor', `url("${c.toDataURL()}") 15 26, progress`);
  }
}

async function loadFrames(species: 'shy' | 'lava', url: string): Promise<void> {
  const atlas = await Assets.load<Texture>(url), data = PVZ_FRAMES[species];
  let duration = 0;
  const ends = data.durations.map(ms => duration += ms);
  const frames = data.durations.map((_ms, index) => new Texture({ source: atlas.source,
    frame: new Rectangle(index % data.columns * (data.width + 2 * data.padding) + data.padding,
      Math.floor(index / data.columns) * (data.height + 2 * data.padding) + data.padding, data.width, data.height) }));
  animated.set(species, { frames, ends, duration });
  textures.set(species, frames[0]);
}

/** Uses scene time so pause/hidden freeze the original animation too. */
export function mushroomFrame(species: MushroomSpecies, seconds: number): Texture | undefined {
  const clip = animated.get(species);
  if (!clip) return textures.get(species);
  const ms = ((seconds * 1000) % clip.duration + clip.duration) % clip.duration;
  return clip.frames[clip.ends.findIndex(end => ms < end)];
}

async function loadAtlas(url: string, names: (string | null)[], columns = 2): Promise<void> {
  const atlas = await Assets.load<Texture>(url);
  const image = atlas.source.resource as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to inspect mushroom atlas alpha');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const halfW = Math.floor(atlas.width / columns), halfH = Math.floor(atlas.height / Math.ceil(names.length / columns));
  names.forEach((name, i) => {
    if (!name) return;
    const left = i % columns * halfW, top = Math.floor(i / columns) * halfH;
    let x0 = left + halfW, x1 = left, y0 = top + halfH, y1 = top;
    for (let y = top; y < top + halfH; y++) for (let x = left; x < left + halfW; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    textures.set(name, new Texture({ source: atlas.source, frame: new Rectangle(x0, y0, x1 - x0 + 1, y1 - y0 + 1) }));
  });
}

export function propTexture(name: string): Texture | undefined { return textures.get(name); }

export function mushroomTexture(species: MushroomSpecies): Texture | undefined {
  return textures.get(species === 'enoki' ? 'oyster' : species);
}
