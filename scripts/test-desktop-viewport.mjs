import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { unionScreenRects, projectShellGeometry } = createRequire(import.meta.url)('../dist/test/shared/desktop-viewport.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('all-monitor viewport retains left/upper negative origins and physical gaps', () => {
  assert.deepEqual(unionScreenRects([{ x: 0, y: 0, width: 1920, height: 1040 },
    { x: -2560, y: -400, width: 2560, height: 1400 }, { x: 2000, y: 0, width: 1200, height: 1920 }]),
  { x: -2560, y: -400, width: 5760, height: 2320 });
  assert.throws(() => unionScreenRects([]));
});

test('mixed-DPI Shell artwork and labels project through one physical viewport without moving icons', () => {
  const viewport = { x: -2560, y: -400, width: 4480, height: 1440 };
  for (const canvasScale of [1, 1.25, 1.5, 2]) for (const nativeScale of [1, 1.25, 1.5, 2]) {
    const size = 48 * nativeScale;
    const icon = { x: -2100, y: -100, width: size + 30, height: size + 8 };
    const label = { x: -2110, y: icon.y + icon.height, width: 110 * nativeScale, height: 28 * nativeScale };
    const copy = structuredClone({ icon, label });
    const geometry = projectShellGeometry(icon, label, 48, nativeScale, viewport, canvasScale);
    close(geometry.x * canvasScale + viewport.x, icon.x + 15);
    close(geometry.y * canvasScale + viewport.y, icon.y + 8);
    close(geometry.size * canvasScale, size);
    close(geometry.labelX * canvasScale + viewport.x, label.x);
    close(geometry.labelWidth * canvasScale, label.width);
    close(12 * geometry.labelScale * canvasScale, 12 * nativeScale);
    assert.deepEqual({ icon, label }, copy);
  }
});

test('single-display 125% retains the existing 48-DIP icon size; invalid projection fails rather than regrids', () => {
  const icon = { x: 0, y: 0, width: 94, height: 64 }, label = { x: 5, y: 64, width: 84, height: 32 };
  const viewport = { x: 0, y: 0, width: 1920, height: 1040 };
  const result = projectShellGeometry(icon, label, 48, 1.25, viewport, 1.25);
  assert.equal(result.size, 48); assert.equal(result.labelScale, 1);
  assert.throws(() => projectShellGeometry(icon, label, 256, 1.25, viewport, 1.25));
  assert.throws(() => projectShellGeometry(icon, label, 48, 1.25, viewport, NaN));
});
