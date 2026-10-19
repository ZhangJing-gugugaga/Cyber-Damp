import type { FileRuntime } from '../shared/types/file-runtime';

export const HOT_AIR_GRACE_SECONDS = 5;
const unit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** Same sustained exposure clock for a held hairdryer and a faulty hot clip. */
export function heatFile(rt: FileRuntime, dtSec: number): void {
  if (rt.state === 'burnt' || !Number.isFinite(dtSec) || dtSec <= 0) return;
  const before = Number.isFinite(rt.heatSeconds) ? Math.max(0, rt.heatSeconds || 0) : 0;
  rt.heatSeconds = before + dtSec;
  rt.humidity = unit(rt.humidity - dtSec * 0.25);
  const scorching = Math.max(0, rt.heatSeconds - HOT_AIR_GRACE_SECONDS)
    - Math.max(0, before - HOT_AIR_GRACE_SECONDS);
  rt.char = unit(rt.char + scorching * 0.42);
  if (rt.char > 0.6) rt.state = 'burnt';
}

export function stopHeating(rt: FileRuntime): void { rt.heatSeconds = 0; }

/** A dry climate works on desktop files as well as clothesline files. */
export function updateDesiccation(rt: FileRuntime, humidity: number, dtSec: number): void {
  const dry = rt.dryness || 0;
  const dryClimate = humidity < 0.35;
  // In a dry climate the file tends toward 90% of ambient humidity. A fixed
  // 25% gate made a 29% desert day permanently unable to desiccate old files.
  const dryLimit = dryClimate ? 0.35 : 0.25;
  if (rt.humidity > 0.5) rt.dryness = unit(dry - dtSec / 5);
  else if (rt.humidity < dryLimit && (rt.state === 'hung' || dryClimate)) rt.dryness = unit(dry + dtSec / 30);
}

/** Stable, file-specific scorch positions. The real name/path never changes. */
export function scorchedCharacters(name: string, id: string, char: number): Array<{ glyph: string; carbon: boolean }> {
  const displayName = name.replace(/\.(lnk|url)$/i, '');
  const chars = Array.from(displayName);
  const dot = displayName.lastIndexOf('.');
  const stem = Array.from(dot > 0 ? displayName.slice(0, dot) : displayName).length;
  const eligible = Array.from({ length: stem }, (_, i) => i).filter((i) => !/\s/u.test(chars[i]));
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const count = char > 0.65 ? 2 : char > 0.3 ? 1 + ((hash >>> 3) & 1) : 0;
  const chosen = new Set<number>();
  for (let i = 0; i < count && eligible.length; i++) {
    const index = (hash >>> 0) % eligible.length;
    chosen.add(eligible.splice(index, 1)[0]);
    hash = Math.imul(hash ^ (i + 73), 16777619);
  }
  return chars.map((glyph, i) => ({ glyph: chosen.has(i) ? '█' : glyph, carbon: chosen.has(i) }));
}
