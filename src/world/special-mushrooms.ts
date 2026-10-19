/** Special fungi are logical surrogate state; real files are never changed. */
import { GB } from '../shared/constants';
import type { ExtCategory, FileKind } from '../shared/types/file-node';
import type { FileRuntime, MushroomState } from '../shared/types/file-runtime';

export const BOLETE_ADJACENCY_DISTANCE = 80;
export const SPECIAL_GROW_SECONDS = 8;
export const BOLETE_COOK_SECONDS = 3;
export const BOLETE_OXIDIZE_SECONDS = 0.5;
export const HALLUCINATION_SECONDS = 8;
export const LAVA_MIN_BYTES = GB;
export const LAVA_COUNTDOWN_SECONDS = 12;
export const LAVA_CRATER_DIAMETER = 200;
export const LAVA_BLAST_RADIUS = 180;

export interface SpecialMushroomFile {
  id: string;
  category: ExtCategory;
  kind: FileKind;
  sizeBytes: number;
  /** Current desktop icon centre, not the cell's top-left. */
  x: number;
  y: number;
  runtime: FileRuntime;
}
export interface HungMushroomFile { id: string; ropeId: string; s: number }
export interface BoletePair { imageId: string; documentId: string }
export type SpecialMushroomEvent =
  | { type: 'sprout'; id: string; species: 'bolete' | 'lava' }
  | { type: 'explosion'; id: string; x: number; y: number; craterDiameter: number; radius: number;
      impulses: { id: string; vx: number; vy: number }[] };

function validDt(dt: number): boolean { return Number.isFinite(dt) && dt > 0; }

/** Consecutive pins only: another hanger between the two blocks hybridisation. */
export function findBoletePairs(files: readonly SpecialMushroomFile[], hung: readonly HungMushroomFile[]): BoletePair[] {
  const byId = new Map(files.map((file) => [file.id, file]));
  const ropes = new Map<string, HungMushroomFile[]>();
  for (const pin of hung) {
    if (!Number.isFinite(pin.s) || !byId.has(pin.id)) continue;
    const pins = ropes.get(pin.ropeId) ?? []; pins.push(pin); ropes.set(pin.ropeId, pins);
  }
  const result: BoletePair[] = [];
  for (const pins of ropes.values()) {
    pins.sort((a, b) => a.s - b.s || a.id.localeCompare(b.id));
    for (let i = 1; i < pins.length; i++) {
      const left = byId.get(pins[i - 1].id)!, right = byId.get(pins[i].id)!;
      if (pins[i].s - pins[i - 1].s > BOLETE_ADJACENCY_DISTANCE || left.id === right.id) continue;
      if (left.kind !== 'file' || right.kind !== 'file' || left.runtime.state !== 'hung' || right.runtime.state !== 'hung') continue;
      const image = left.category === 'image-video' ? left : right.category === 'image-video' ? right : null;
      const document = left.category === 'doc-code' ? left : right.category === 'doc-code' ? right : null;
      if (image && document) result.push({ imageId: image.id, documentId: document.id });
    }
  }
  return result;
}

/** Mutates only logical runtime material. The caller applies returned physical impulses. */
export function tickSpecialMushrooms(
  files: readonly SpecialMushroomFile[], hung: readonly HungMushroomFile[], dtSec: number,
): SpecialMushroomEvent[] {
  if (!validDt(dtSec)) return [];
  const events: SpecialMushroomEvent[] = [];
  const byId = new Map(files.map((file) => [file.id, file]));
  for (const file of files) {
    const rt = file.runtime;
    if (file.kind !== 'recycle' && Number.isFinite(file.sizeBytes) && file.sizeBytes >= LAVA_MIN_BYTES
      && rt.stage === 'moldy' && rt.mold > 0.6 && rt.state !== 'burnt'
      && rt.mushroom?.species !== 'lava' && rt.mushroom?.species !== 'shy') {
      rt.mushroom = { species: 'lava', growth: 0 };
      events.push({ type: 'sprout', id: file.id, species: 'lava' });
    }
  }
  for (const pair of findBoletePairs(files, hung)) {
    const rt = byId.get(pair.documentId)!.runtime;
    if (rt.state === 'burnt' || rt.mushroom && !['oyster', 'enoki'].includes(rt.mushroom.species)) continue;
    rt.mushroom = { species: 'bolete', growth: 0 };
    events.push({ type: 'sprout', id: pair.documentId, species: 'bolete' });
  }
  const exploding: SpecialMushroomFile[] = [];
  for (const file of files) {
    const m = file.runtime.mushroom;
    if (!m || m.species !== 'bolete' && m.species !== 'lava') continue;
    const untilMature = Math.max(0, 1 - m.growth) * SPECIAL_GROW_SECONDS;
    m.growth = Math.min(1, m.growth + dtSec / SPECIAL_GROW_SECONDS);
    if (m.species === 'lava' && m.growth >= 1) {
      m.lavaSeconds = Math.max(0, (m.lavaSeconds ?? LAVA_COUNTDOWN_SECONDS) - Math.max(0, dtSec - untilMature));
      if (m.lavaSeconds === 0) exploding.push(file);
    }
  }
  for (const file of exploding) events.push(explodeLava(file, files));
  return events;
}

function explodeLava(source: SpecialMushroomFile, files: readonly SpecialMushroomFile[]): Extract<SpecialMushroomEvent, { type: 'explosion' }> {
  const impulses: { id: string; vx: number; vy: number }[] = [];
  for (const file of files) {
    if (file.kind === 'recycle') continue;
    const dx = file.x - source.x, dy = file.y - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance > LAVA_BLAST_RADIUS) continue;
    const rt = file.runtime;
    rt.char = Math.max(rt.char, 0.9); rt.dryness = Math.max(rt.dryness ?? 0, 0.8);
    rt.humidity = 0; rt.heatSeconds = 0; rt.state = 'burnt'; rt.mushroom = null;
    const speed = 280 + (1 - distance / LAVA_BLAST_RADIUS) * 420;
    const nx = distance > 0.001 ? dx / distance : 0;
    const ny = distance > 0.001 ? dy / distance : -1;
    impulses.push({ id: file.id, vx: nx * speed, vy: ny * speed - 360 });
  }
  return { type: 'explosion', id: source.id, x: source.x, y: source.y,
    craterDiameter: LAVA_CRATER_DIAMETER, radius: LAVA_BLAST_RADIUS, impulses };
}

/** Cooking accumulates before or after cutting, and survives save/load on attached fungi. */
export function heatSpecialMushroom(m: MushroomState | null, dtSec: number, strength = 1): boolean {
  if (!m || m.species !== 'bolete' || !validDt(dtSec) || !Number.isFinite(strength)) return false;
  m.cooking = Math.min(1, (m.cooking ?? 0) + dtSec * Math.min(1, Math.max(0, strength)) / BOLETE_COOK_SECONDS);
  return m.cooking >= 1;
}

/** The detached item is a copy; caller removes the original from its file. */
export function cutMushroom(m: MushroomState | null): MushroomState | null {
  if (!m || m.growth < 1) return null;
  const cut = { ...m };
  delete cut.lavaSeconds;
  if (cut.species === 'bolete') cut.cutAgeSeconds = 0;
  return cut;
}

export function tickCutMushroom(m: MushroomState, dtSec: number): void {
  if (m.species === 'bolete' && m.cutAgeSeconds !== undefined && validDt(dtSec)) {
    m.cutAgeSeconds = Math.min(BOLETE_OXIDIZE_SECONDS, m.cutAgeSeconds + dtSec);
  }
}

export function boleteCutColor(m: MushroomState): number {
  const t = Math.min(1, Math.max(0, (m.cutAgeSeconds ?? 0) / BOLETE_OXIDIZE_SECONDS));
  const pale = [0xf0, 0xd2, 0x8a], blue = [0x17, 0x3a, 0xb4];
  return pale.map((value, i) => Math.round(value + (blue[i] - value) * t)).reduce((rgb, value) => rgb * 256 + value, 0);
}

export function mushroomSaleEffect(m: MushroomState): { type: 'hallucination'; seconds: number } | null {
  return m.species === 'bolete' && m.growth >= 1 && (m.cooking ?? 0) < 1
    ? { type: 'hallucination', seconds: HALLUCINATION_SECONDS } : null;
}

export function lavaCountdown(m: MushroomState): number | null {
  return m.species === 'lava' && m.growth >= 1 ? m.lavaSeconds ?? LAVA_COUNTDOWN_SECONDS : null;
}
