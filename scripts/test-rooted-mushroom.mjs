import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pixi from 'pixi.js';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/renderer/view/rooted-mushroom-art.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
  { exports, require: id => { assert.equal(id, 'pixi.js'); return pixi; } });
function fixture() {
  return new exports.RootedMushroomArt(new pixi.Texture({ source: new pixi.TextureSource({ width: 100, height: 160 }) }));
}
const vertices = art => art.geometry.getBuffer('aPosition').data;

test('anger bends upper vertices while every root-row vertex remains fixed', () => {
  const art = fixture();
  art.updateShape(1, 0, 0); const rest = Array.from(vertices(art));
  let movedTop = false;
  for (let frame = 0; frame < 240; frame++) {
    art.updateShape(1, frame / 60, 1);
    const current = vertices(art);
    for (let i = 140; i < current.length; i += 2) {
      assert.equal(current[i], rest[i]); assert.equal(current[i + 1], 160);
    }
    movedTop ||= Math.abs(current[0] - rest[0]) > 1;
  }
  assert.equal(movedTop, true);
  art.destroy();
});

test('growth is not uniform image scaling and always keeps the root at the same point', () => {
  const art = fixture(); art.updateShape(.45, 0, 0);
  const points = vertices(art);
  const widthRatio = (points[12] - points[0]) / 100;
  const heightRatio = (160 - points[1]) / 160;
  assert.ok(Math.abs(widthRatio - heightRatio) > .1);
  assert.equal(points[147], 160);
  art.destroy();
});

test('alpha lookup follows deformed triangles back to the original UVs', () => {
  const art = fixture(); art.updateShape(1, 1.3, 1);
  const positions = vertices(art), uvs = art.geometry.getBuffer('aUV').data, indices = art.geometry.getIndex().data;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 2, b = indices[i + 1] * 2, c = indices[i + 2] * 2;
    const point = { x: (positions[a] + positions[b] + positions[c]) / 3,
      y: (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3 };
    const uv = art.sourceUV(point); assert.ok(uv);
    assert.ok(Math.abs(uv.u - (uvs[a] + uvs[b] + uvs[c]) / 3) < 1e-5);
    assert.ok(Math.abs(uv.v - (uvs[a + 1] + uvs[b + 1] + uvs[c + 1]) / 3) < 1e-5);
  }
  assert.equal(art.sourceUV({ x: -50, y: 20 }), null);
  art.destroy();
});

test('opening clock starts on its first animation update and excludes explicit pauses', () => {
  let now = 10000, finished = 0, reveal = 0;
  const module = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/renderer/app/opening.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: module, performance: { now: () => now }, console: { info() {} } });
  const runtime = { locked: true }, sprite = { setIntro() {}, setIntroGrowth(value) { reveal = value; }, finishIntro() {} };
  const opening = new module.Opening({ runtime, atmosphere: {}, sprites: new Map([['file', sprite]]), shrooms: new Map(), onFinish() { finished++; } });
  now = 14000; assert.equal(opening.update(0), false); assert.equal(reveal, 0);
  now = 17000; opening.update(0); const held = reveal; assert.ok(held > 0 && held < 1);
  opening.setPaused(true); now = 27000; opening.update(0); assert.equal(reveal, held);
  opening.setPaused(false); now = 27999; assert.equal(opening.update(0), false); assert.equal(runtime.locked, true);
  now = 28000; assert.equal(opening.update(0), true); assert.equal(runtime.locked, false); assert.equal(reveal, 1); assert.equal(finished, 1);
});
