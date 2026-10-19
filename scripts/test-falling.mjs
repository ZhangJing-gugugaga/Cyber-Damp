import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFallingBody, stepFallingBody, scatterAngle } from '../dist/test/world/falling-file.js';

const bounds = { width: 800, cellWidth: 100, floorTop: 430 };

test('falling icons rebound visibly twice and settle only on the third contact', () => {
  const body = createFallingBody('rope-file', { x: 300, y: 100 }, { vx: 70, vy: 0 });
  const peaks = [Infinity, Infinity];
  const contacts = [];
  let lastBounces = 0;
  for (let i = 0; i < 600 && !body.settled; i++) {
    stepFallingBody(body, 1 / 120, bounds);
    if (body.bounces !== lastBounces) {
      contacts.push(body.bounces);
      assert.equal(body.settled, false, 'a rebound must stay in the falling animation');
      assert.ok(body.vy < 0);
      lastBounces = body.bounces;
    }
    if (body.bounces) peaks[body.bounces - 1] = Math.min(peaks[body.bounces - 1], body.y);
  }
  assert.deepEqual(contacts, [1, 2]);
  assert.ok(bounds.floorTop - peaks[0] >= 40, 'first rebound must be visible');
  assert.ok(bounds.floorTop - peaks[1] >= 8, 'second rebound must remain visible');
  assert.ok(peaks[1] > peaks[0], 'second rebound must be lower');
  assert.equal(body.settled, true);
  assert.equal(body.y, bounds.floorTop);
  assert.equal(body.vx, 0);
  assert.equal(body.vy, 0);
  assert.equal(body.angle, scatterAngle('rope-file'));
});

test('fast explosion throws remain inside viewport bounds until resting', () => {
  for (const vx of [-4200, 4200]) {
    const body = createFallingBody(`blast-${vx}`, { x: vx, y: 900 }, { vx, vy: -1700 });
    for (let i = 0; i < 600 && !body.settled; i++) {
      stepFallingBody(body, 1 / 60, bounds);
      assert.ok(body.x >= 0 && body.x <= 700);
      assert.ok(body.y >= 0 && body.y <= 430);
      assert.ok(Number.isFinite(body.angle));
    }
    assert.equal(body.bounces, 2);
    assert.equal(body.settled, true);
  }
});

test('scatter pose is stable per file, varied between files, and ignores invalid time', () => {
  const a = createFallingBody('a', { x: 0, y: 0 }, { vx: 0, vy: 0 });
  const before = { ...a };
  for (const dt of [0, -1, NaN, Infinity]) stepFallingBody(a, dt, bounds);
  assert.deepEqual(a, before);
  assert.equal(scatterAngle('a'), scatterAngle('a'));
  assert.notEqual(scatterAngle('a'), scatterAngle('b'));
  assert.ok(Math.abs(scatterAngle('a')) <= 0.17);
});
