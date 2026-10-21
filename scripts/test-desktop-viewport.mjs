import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const { unionScreenRects, projectShellGeometry } = createRequire(import.meta.url)('../dist/test/shared/desktop-viewport.js');
const { buildFileNodes } = createRequire(import.meta.url)('../dist/test/world/desktop-layout.js');
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

function refreshFixture() {
  const module = {}, ack = [], errors = [], busy = [], ready = []; let trigger, finished, attaches = 0;
  const done = new Promise(resolve => { finished = resolve; });
  const entities = ['idle', 'hung'].map(id => ({ node: { id, x: 300, y: 200 }, runtime: { state: id, humidity: .4, mold: .7, dryCare: true } }));
  const runtime = { locked: false, coins: 123, entities, byId: new Map(entities.map(entity => [entity.node.id, entity])) };
  let entries = entities.map(({ node }, i) => ({ id: node.id, name: 'fixture', kind: 'file', realPath: '', mtime: 0,
    geometry: { x: 100 + i * 100, y: 80, size: 48, labelX: 90, labelY: 140, labelWidth: 84, labelHeight: 28 } }));
  class FileSprite { constructor(node) { this.node = node; this.container = {}; } setPinned(value) { this.pinned = value; } finishIntro() {} }
  const api = { system: { onDisplayChanged(cb) { trigger = cb; } },
    app: { async desktopReady() { attaches++; return { ok: true }; }, async viewportReady(result) { ack.push(JSON.parse(JSON.stringify(result))); return { ok: true }; } },
    management: { async command(value) { errors.push(value); return { ok: true }; } } };
  const js = ts.transpileModule(fs.readFileSync('src/renderer/app/display-refresh.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports: module, console: { error() {} }, requestAnimationFrame: cb => queueMicrotask(cb),
    window: { damp: api, devicePixelRatio: 1.5, innerWidth: 2400, innerHeight: 900 },
    require: id => id === './desktop-bridge' ? { loadDesktopEntries: async () => entries }
      : id === '../../world/desktop-layout' ? { buildFileNodes } : { FileSprite } });
  const sprites = new Map(entities.map(({ node }) => [node.id, { container: { destroy() {} } }]));
  module.installDisplayRefresh({ app: { renderer: { resolution: 1, resize() {} } }, runtime, sprites,
    textures: new Map(), layer: { addChild() {} }, ropes: { setViewport() {} }, before() {}, opening: () => null,
    busy(value) { busy.push(value); if (!value) finished(); }, ready(value) { ready.push(value); } });
  return { runtime, sprites, ack, errors, busy, ready, done, trigger: value => trigger(value), attaches: () => attaches,
    changeEntries(value) { entries = value; } };
}

test('display refresh replaces views while preserving care, coins and hung positions', async () => {
  const f = refreshFixture(), care = JSON.stringify(f.runtime.entities.map(entity => entity.runtime));
  f.trigger({ width: 2400, height: 900 }); await f.done;
  assert.equal(f.runtime.coins, 123); assert.equal(JSON.stringify(f.runtime.entities.map(entity => entity.runtime)), care);
  assert.equal(f.runtime.byId.get('idle').node.x, 82); assert.equal(f.runtime.byId.get('hung').node.x, 300);
  assert.deepEqual(f.busy, [true, false]); assert.equal(f.attaches(), 1); assert.deepEqual(f.ready, [true]);
  assert.equal(f.runtime.locked, false);
});

test('post-parent DPI request acknowledges the rebuild without recursively awaiting desktopReady', async () => {
  const f = refreshFixture(); f.trigger({ width: 2400, height: 900, requestId: 42 }); await f.done;
  assert.deepEqual(f.ack, [{ requestId: 42, ok: true }]); assert.equal(f.attaches(), 0);
});

test('concurrent desktop item changes fail closed instead of dropping or regridding files', async () => {
  const f = refreshFixture(); f.changeEntries([]); f.trigger({ width: 2400, height: 900 }); await f.done;
  assert.deepEqual(f.ready, [false]); assert.equal(f.attaches(), 0); assert.equal(f.errors.at(-1).action, 'display-error');
  assert.equal(f.runtime.entities.length, 2); assert.equal(f.runtime.coins, 123); assert.equal(f.runtime.locked, false);
});
