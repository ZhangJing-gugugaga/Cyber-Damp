import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';

function fixture() {
  let worker, timeout, cleared=0;
  class Worker {
    constructor(file, options) { this.file=file; this.options=options; this.handlers={}; this.terminated=0; worker=this; }
    once(name, callback) { this.handlers[name]=callback; }
    terminate() { this.terminated++; return Promise.resolve(); }
  }
  const module={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/desktop/shell-icons.ts','utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
    {exports:module,__dirname:'fixture',Error,require:id=>id==='node:worker_threads'?{Worker}:path,
      setTimeout:callback=>{timeout=callback;return 1;},clearTimeout:()=>{cleared++;}});
  return {module,get worker(){return worker;},timeout:()=>timeout(),get cleared(){return cleared;}};
}

test('icon worker returns matching batch including null artwork for async fallback, and stops worker', async () => {
  const f=fixture(), requests=[{path:'folder'},{path:'missing'}];
  const pending=f.module.queryShellIcons(requests); const icons=[{pixels:Buffer.alloc(4),width:1,height:1},null];
  f.worker.handlers.message({ok:true,icons});
  assert.equal(await pending,icons); assert.equal(f.worker.options.workerData,requests);
  assert.equal(f.worker.terminated,1); assert.equal(f.cleared,1);
  f.timeout(); f.worker.handlers.exit(); assert.equal(f.worker.terminated,1);
});

test('timeout, crash, early exit and malformed batch reject without synchronous extraction', async () => {
  for(const fail of [f=>f.timeout(),f=>f.worker.handlers.error(new Error('crash')),
    f=>f.worker.handlers.exit(),f=>f.worker.handlers.message({ok:true,icons:[]}),
    f=>f.worker.handlers.message({ok:false,error:'COM failed'})]) {
    const f=fixture(), pending=f.module.queryShellIcons([{path:'folder'}]);
    fail(f); await assert.rejects(pending); assert.equal(f.worker.terminated,1);
  }
});
