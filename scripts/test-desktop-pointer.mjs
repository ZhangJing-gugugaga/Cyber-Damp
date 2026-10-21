/** Exercise the production controller with event targets and read-only native probes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';

function fixture() {
  const listeners = new Map();
  let nativeCursor;
  const opened = [], picked = [];
  const sprites = new Map(['a', 'b'].map((id, index) => {
    const sprite = { node: { id, x: 30 + index * 100, y: 30, kind: 'file' },
      container: { position: { x: 30 + index * 100, y: 30, set(x, y) { this.x = x; this.y = y; } } },
      hit(x, y) { return x >= this.node.x && x <= this.node.x + 48 && y >= 30 && y <= 78; },
      setSelection(selected, hovered, focused) { this.feedback = { selected, hovered, focused }; },
      setScatterAngle() {}, setWring() {}, previewPin() {} };
    return [id, sprite];
  }));
  const fileAt = (map, x, y) => [...map.values()].find(sprite => sprite.hit(x, y));
  const window = { innerWidth: 1000, innerHeight: 800,
    addEventListener(name, cb) { const list = listeners.get(name) ?? []; list.push(cb); listeners.set(name, list); },
    damp: { window: { getInputSettings: async () => ({ doubleClickMs: 500 }), onCursor(cb) { nativeCursor = cb; } } } };
  const dependencies = {
    './click-through': { ClickThrough: class { update() {} } },
    './gestures': { CircleWring: class { active = false; start() {} cancel() {} }, FULL_TURN: Math.PI * 2 },
    './fx-burst': { splashBurst() {} },
    './hit-tests': { EDGE_ZONE: 24, fileAt, mushroomAt: () => null, nearestRopePoint: () => null,
      worldHitAt: (deps, x, y) => !!fileAt(deps.sprites, x, y) },
    '../app/events': { emitAction() {} }, '../app/telemetry': { trackFirst() {} },
  };
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync('src/renderer/input/pointer-controller.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports, require: id => { assert.ok(dependencies[id], id); return dependencies[id]; },
    window, document: { documentElement: { classList: { toggle() {} } } }, performance });
  const deps = { sprites, runtime: { locked: false, byId: new Map(['a', 'b'].map(id => [id, { runtime: { humidity: 0, state: 'idle' } }])), markState() {} },
    ropes: { releaseFile() {}, canSpawn: () => false }, getTool: () => 'hand', domHit: () => false,
    onOpen: id => opened.push(id), onPick: id => picked.push(id), sfx: {}, ropePreview() {} };
  new exports.PointerController(deps);
  const event = (name, x, options = {}) => {
    for (const cb of listeners.get(name) ?? []) cb({ button: 0, clientX: x, clientY: 50, timeStamp: 100,
      ctrlKey: false, shiftKey: false, ...options });
  };
  const click = (x, options) => { event('pointerdown', x, options); event('pointerup', x, options); };
  return { sprites, deps, event, click, opened, picked, probe: value => nativeCursor({ x: 800, y: 400, leftDown: false, desktopActive: true, ...value }) };
}

test('single selection, Ctrl toggling and ordinary double click use the existing open path', () => {
  const f = fixture(); f.click(40);
  assert.equal(f.sprites.get('a').feedback.selected, true); assert.equal(f.opened.length, 0);
  f.click(140, { ctrlKey: true });
  assert.equal(f.sprites.get('a').feedback.selected, true); assert.equal(f.sprites.get('b').feedback.selected, true);
  f.click(40, { ctrlKey: true }); assert.equal(f.sprites.get('a').feedback.selected, false);
  f.click(40, { timeStamp: 700 }); f.click(40, { timeStamp: 900 });
  assert.deepEqual(f.opened, ['a']);
});

test('blank desktop clears on a native press edge, while another application only mutes focus', () => {
  const f = fixture(); f.click(40);
  f.probe({ leftDown: true, desktopActive: false });
  assert.deepEqual(f.sprites.get('a').feedback, { selected: true, hovered: false, focused: false });
  f.probe({ leftDown: false }); f.probe({ leftDown: true });
  assert.equal(f.sprites.get('a').feedback.selected, false);
});

test('a completed drag cancels double click and visible mushrooms take the harvest path', () => {
  const f = fixture(); f.event('pointerdown', 40);
  f.event('pointermove', 60); f.event('pointerup', 60);
  f.click(60, { timeStamp: 200 }); assert.deepEqual(f.opened, []);
  f.deps.mushroomHit = () => 'a'; f.click(60, { timeStamp: 300 });
  assert.deepEqual(f.picked, ['a']); assert.deepEqual(f.opened, []);
});

test('detached lava harvest cannot bypass the shovel requirement', () => {
  let cuts = 0;
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync('src/renderer/app/harvest-controller.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports, require: id => id.endsWith('/special-mushrooms')
    ? { cutMushroom() { cuts++; return null; } } : {} });
  const runtime = { byId: new Map([['lava', { runtime: { mushroom: { species: 'lava', growth: 1 } } }]]), owned: [], locked: false };
  const context = { deps: { runtime, shrooms: new Map() }, detached: [] };
  assert.equal(exports.HarvestController.prototype.pick.call(context, 'lava'), true);
  assert.equal(cuts, 0);
  runtime.owned.push('pvz-shovel');
  assert.equal(exports.HarvestController.prototype.pick.call(context, 'lava'), true);
  assert.equal(cuts, 1);
});
