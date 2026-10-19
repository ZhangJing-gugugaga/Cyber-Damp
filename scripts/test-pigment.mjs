import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dripClock, advancePaintDrop } from '../dist/test/world/pigment-drips.js';

test('held wet files drip at two seconds; release resets rather than leaking an idle drip', () => {
  let elapsed = 0;
  for (let i = 0; i < 119; i++) {
    const next = dripClock(elapsed, true, 1 / 60);
    assert.equal(next.emit, false); elapsed = next.elapsed;
  }
  const firstDrop = dripClock(elapsed, true, 1 / 60);
  assert.equal(firstDrop.emit, true);
  assert.equal(dripClock(firstDrop.elapsed, true, 1 / 60).emit, false, 'floating-point rounding must not double drip');
  assert.deepEqual(dripClock(1.9, false, 0.2), { elapsed: 0, emit: false });
  assert.equal(dripClock(0, true, 0.2).emit, false);
});

test('fast pigment crosses the nearest opaque document edge without tunnelling or self-staining', () => {
  const drop = { sourceId: 'image', x: 50, y: 0, vx: 0, vy: 500, color: 0xff0088 };
  const seen = [];
  const impact = advancePaintDrop(drop, 0.2, [
    { id: 'image', hit: () => ({ u: 0.5, v: 0 }) },
    { id: 'far', hit: (x, y) => y >= 75 && y < 77 ? { u: x / 100, v: 0.1 } : null },
    { id: 'near', hit: (x, y) => { seen.push(y); return y >= 24 && y < 26 ? { u: x / 100, v: 0.2 } : null; } },
  ]);
  assert.deepEqual(impact, { id: 'near', u: 0.5, v: 0.2 });
  assert.ok(drop.y >= 24 && drop.y < 26);
  assert.ok(seen.length > 1);
});

test('transparent pixels do not receive or stop pigment', () => {
  const drop = { sourceId: 'image', x: 0, y: 0, vx: 100, vy: 0, color: 0x00aaff };
  const hit = advancePaintDrop(drop, 0.1, [{ id: 'document', hit: () => null }]);
  assert.equal(hit, null);
  assert.equal(drop.x, 10);
  assert.ok(drop.y > 0);
});
