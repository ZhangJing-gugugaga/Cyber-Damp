import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GB } from '../dist/test/shared/constants.js';
import { validateSave } from '../dist/test/shared/save/save-schema.js';
import { pickSpecies } from '../dist/test/world/mushroom-species.js';
import { seedMoldyMushroom } from '../dist/test/world/file-seed.js';
import {
  findBoletePairs, tickSpecialMushrooms, heatSpecialMushroom, cutMushroom,
  tickCutMushroom, boleteCutColor, mushroomSaleEffect, lavaCountdown,
} from '../dist/test/world/special-mushrooms.js';

function file(id, over = {}) {
  const { runtime = {}, ...node } = over;
  return { id, category: 'doc-code', kind: 'file', sizeBytes: 128, x: 0, y: 0,
    ...node, runtime: { id, humidity: 0.9, mold: 0.9, char: 0, stage: 'moldy', state: 'hung',
      mushroom: null, ...runtime } };
}
const pin = (id, s, ropeId = 'rope-a') => ({ id, s, ropeId });

test('hybrid requires image and document consecutive on the same rope within80 pixels', () => {
  const files = [file('image', { category: 'image-video' }), file('doc'), file('middle', { category: 'audio' })];
  assert.deepEqual(findBoletePairs(files, [pin('image', 0), pin('doc', 80)]), [{ imageId: 'image', documentId: 'doc' }]);
  assert.deepEqual(findBoletePairs(files, [pin('image', 0), pin('doc', 80.001)]), []);
  assert.deepEqual(findBoletePairs(files, [pin('image', 0), pin('doc', 72, 'rope-b')]), []);
  assert.deepEqual(findBoletePairs(files, [pin('image', 0), pin('middle', 36), pin('doc', 72)]), []);
  files[1].runtime.state = 'idle';
  assert.deepEqual(findBoletePairs(files, [pin('image', 0), pin('doc', 72)]), []);
});

test('adjacency transforms ordinary document fungi once and protects shy species', () => {
  const files = [file('image', { category: 'image-video' }), file('doc', { runtime: { mushroom: { species: 'enoki', growth: 1 } } })];
  const pins = [pin('image', 0), pin('doc', 72)];
  assert.deepEqual(tickSpecialMushrooms(files, pins, 0.1), [{ type: 'sprout', id: 'doc', species: 'bolete' }]);
  assert.equal(files[1].runtime.mushroom.species, 'bolete');
  tickSpecialMushrooms(files, pins, 7.9);
  assert.equal(files[1].runtime.mushroom.growth, 1);
  assert.deepEqual(tickSpecialMushrooms(files, pins, 1), []);
  files[1].runtime.mushroom = { species: 'shy', growth: 1 };
  tickSpecialMushrooms(files, pins, 1);
  assert.equal(files[1].runtime.mushroom.species, 'shy');
  assert.equal(pickSpecies('doc-code', 0.1), 'enoki');
  assert.equal(pickSpecies('image-video', 0.1), 'oyster');
});

test('cut oxidises in0.5s; raw sale hallucination lasts8s; three seconds cooking removes that effect', () => {
  const attached = { species: 'bolete', growth: 1 };
  const cut = cutMushroom(attached);
  assert.ok(cut);
  assert.equal(boleteCutColor(cut), 0xf0d28a);
  tickCutMushroom(cut, 0.25);
  assert.notEqual(boleteCutColor(cut), 0xf0d28a);
  assert.notEqual(boleteCutColor(cut), 0x173ab4);
  tickCutMushroom(cut, 0.25);
  assert.equal(boleteCutColor(cut), 0x173ab4);
  assert.equal(attached.cutAgeSeconds, undefined, 'cut item must not alias attached state');
  assert.deepEqual(mushroomSaleEffect(cut), { type: 'hallucination', seconds: 8 });
  assert.equal(heatSpecialMushroom(cut, 2.99), false);
  assert.ok(mushroomSaleEffect(cut));
  assert.equal(heatSpecialMushroom(cut, 0.02), true);
  assert.equal(mushroomSaleEffect(cut), null);
  assert.equal(cutMushroom({ species: 'bolete', growth: 0.99 }), null);
  assert.equal(mushroomSaleEffect({ species: 'oyster', growth: 1 }), null);
});

test('lava needs at least1GiB and neglect; maturity never starts a countdown', () => {
  const files = [file('large', { sizeBytes: GB }), file('small', { sizeBytes: GB - 1 }),
    file('fresh', { sizeBytes: 2 * GB, runtime: { stage: 'fresh' } }),
    file('folder', { kind: 'dir', sizeBytes: GB }),
    file('recycle', { kind: 'recycle', sizeBytes: 5 * GB })];
  tickSpecialMushrooms(files, [], 7.9);
  assert.equal(files[0].runtime.mushroom.species, 'lava');
  assert.equal(files[1].runtime.mushroom, null);
  assert.equal(files[2].runtime.mushroom, null);
  assert.equal(files[3].runtime.mushroom.species, 'lava');
  assert.equal(files[4].runtime.mushroom, null);
  assert.equal(lavaCountdown(files[0].runtime.mushroom), null);
  tickSpecialMushrooms(files, [], 0.2);
  assert.equal(lavaCountdown(files[0].runtime.mushroom), null);
});

test('legacy lava fuse is discarded without explosion, scorching or impulses', () => {
  const source = file('lava', { sizeBytes: GB, x: 200, y: 200,
    runtime: { mushroom: { species: 'lava', growth: 1, lavaSeconds: 0.1 } } });
  const near = file('near', { x: 380, y: 200 });
  const far = file('far', { x: 380.01, y: 200 });
  const recycle = file('recycle', { x: 200, y: 200, kind: 'recycle' });
  const files = [source, near, far, recycle];
  const events = tickSpecialMushrooms(files, [], 0.1);
  assert.deepEqual(events, []);
  assert.equal(source.runtime.mushroom.lavaSeconds, undefined);
  assert.equal(source.runtime.mushroom.species, 'lava');
  assert.equal(near.runtime.char, 0);
  assert.equal(near.runtime.state, 'hung');
  assert.equal(near.runtime.humidity, .9);
  assert.equal(far.runtime.char, 0);
  assert.equal(recycle.runtime.char, 0);
  assert.deepEqual(tickSpecialMushrooms(files, [], 100), [], 'burnt source cannot respawn / explode repeatedly');
  const reloaded = { ...JSON.parse(JSON.stringify(near.runtime)), state: 'burnt' };
  seedMoldyMushroom(reloaded, 'doc-code', near.id);
  assert.equal(reloaded.mushroom, null, 'startup seeding must not resurrect fungi on persisted burnt files');
  const heatBurnt = file('heat', { runtime: { state: 'burnt', char: 0.8 } }).runtime;
  seedMoldyMushroom(heatBurnt, 'doc-code', 'heat');
  assert.equal(heatBurnt.mushroom, null);
});

function saveWith(mushroom) {
  return { schemaVersion: 1, savedAt: 0,
    player: { coins: 0, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'guangzhou', migratedOn: '' },
    files: [{ id: 'file', humidity: 0.5, mold: 0.9, char: 0, state: 'idle', mushroom }],
    ropes: [], stats: { harvested: 0, earned: 0, playedMs: 0 } };
}

test('legacy saves load; special timers persist and malformed species/progress are rejected', () => {
  assert.ok(validateSave(saveWith({ species: 'oyster', growth: 1 })));
  const original = saveWith({ species: 'lava', growth: 1, lavaSeconds: 6.2 });
  const loaded = validateSave(JSON.parse(JSON.stringify(original)));
  assert.equal(loaded.files[0].mushroom.lavaSeconds, 6.2);
  const restored = file('restored', { sizeBytes: GB, runtime: { mushroom: loaded.files[0].mushroom } });
  tickSpecialMushrooms([restored], [], 1);
  assert.equal(lavaCountdown(restored.runtime.mushroom), null, 'legacy fuse must never resume');
  assert.equal(restored.runtime.mushroom.lavaSeconds, undefined);
  assert.ok(validateSave(saveWith({ species: 'bolete', growth: 1, cooking: 0.6, cutAgeSeconds: 0.25 })));
  for (const mushroom of [
    { species: 'unknown', growth: 1 }, { species: 'lava', growth: 1, lavaSeconds: 12.1 },
    { species: 'lava', growth: 1, lavaSeconds: -1 }, { species: 'bolete', growth: 1, cooking: 1.1 },
    { species: 'bolete', growth: 1, cutAgeSeconds: 0.51 }, { species: 'bolete', growth: 1, cooking: NaN },
  ]) assert.equal(validateSave(saveWith(mushroom)), null);
});
