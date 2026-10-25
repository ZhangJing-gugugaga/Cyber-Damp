import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';

// 分块并行契约：请求按 8 个一块并行提取；失败/卡死的块按 null 回退，
// 不 reject、不拖死其余块（实测桌面存在图标提取无限挂起的快捷方式）。
// 断言只比长度/元素/同一性：模块数组来自独立 vm 上下文，deepEqual 按原型比较必炸。
function fixture() {
  const workers = [];
  const timers = new Map();
  let seq = 0;
  class Worker {
    constructor(file, options) { this.file = file; this.options = options; this.handlers = {}; this.terminated = 0; workers.push(this); }
    once(name, callback) { this.handlers[name] = callback; }
    terminate() { this.terminated += 1; return Promise.resolve(); }
  }
  const module = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/desktop/shell-icons.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: module, __dirname: 'fixture', Error, require: id => (id === 'node:worker_threads' ? { Worker } : path),
      setTimeout: (cb) => { const id = ++seq; timers.set(id, cb); return id; },
      clearTimeout: (id) => timers.delete(id) });
  return {
    module, workers,
    fireTimeout: (id) => { const cb = timers.get(id); timers.delete(id); cb?.(); },
    timerCount: () => timers.size,
  };
}

test('单块成功：返回对应图标（含 null 回退项）并终止 worker', async () => {
  const f = fixture(), requests = [{ path: 'folder' }, { path: 'missing' }];
  const pending = f.module.queryShellIcons(requests);
  assert.equal(f.workers.length, 1);
  assert.equal(f.workers[0].options.workerData.length, requests.length);
  assert.equal(f.workers[0].options.workerData[0], requests[0]);
  assert.equal(f.workers[0].options.workerData[1], requests[1]);
  const icons = [{ pixels: Buffer.alloc(4), width: 1, height: 1 }, null];
  f.workers[0].handlers.message({ ok: true, icons });
  const out = await pending;
  assert.equal(out.length, 2);
  assert.equal(out[0], icons[0]);
  assert.equal(out[1], null);
  assert.equal(f.workers[0].terminated, 1);
  assert.equal(f.timerCount(), 0);
});

test('单块失败（超时/崩溃/早退/畸形结果）按 null 回退，不再 reject', async () => {
  for (const fail of [f => f.fireTimeout(1), f => f.workers[0].handlers.error(new Error('crash')),
    f => f.workers[0].handlers.exit(), f => f.workers[0].handlers.message({ ok: true, icons: [] }),
    f => f.workers[0].handlers.message({ ok: false, error: 'COM failed' })]) {
    const f = fixture(), pending = f.module.queryShellIcons([{ path: 'a' }, { path: 'b' }]);
    fail(f);
    const out = await pending;
    assert.equal(out.length, 2);
    assert.equal(out[0], null);
    assert.equal(out[1], null);
    assert.equal(f.workers[0].terminated, 1);
  }
});

test('分块并行：卡死的一块只作废自己，其余块结果保留', async () => {
  const f = fixture();
  const requests = Array.from({ length: 10 }, (_, i) => ({ path: `item${i}` }));
  const pending = f.module.queryShellIcons(requests);
  assert.equal(f.workers.length, 2, '10 项应分成 8+2 两块');
  assert.equal(f.workers[0].options.workerData.length, 8);
  assert.equal(f.workers[1].options.workerData.length, 2);
  const icons = Array.from({ length: 8 }, () => ({ pixels: Buffer.alloc(4), width: 1, height: 1 }));
  f.workers[0].handlers.message({ ok: true, icons });
  f.fireTimeout(2); // 第二块超时（timer id 顺序：块1=1，块2=2）
  const result = await pending;
  assert.equal(result.length, 10);
  for (let i = 0; i < 8; i += 1) assert.ok(result[i], `第 ${i} 项应保留`);
  assert.equal(result[8], null);
  assert.equal(result[9], null);
});

test('空请求不启动任何 worker', async () => {
  const f = fixture();
  const out = await f.module.queryShellIcons([]);
  assert.equal(out.length, 0);
  assert.equal(f.workers.length, 0);
});
