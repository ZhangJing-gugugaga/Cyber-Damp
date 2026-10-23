import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';

function fixture() {
  const windows=[], quit=[];
  class BrowserWindow {
    constructor(options) { this.options=options; this.events={}; this.sent=[]; this.shown=0; this.dead=false;
      this.webContents={send:(...args)=>this.sent.push(args),setWindowOpenHandler(){}}; windows.push(this); }
    setMenuBarVisibility() {} once(name,cb) { this.events[name]=cb; } on(name,cb) { this.events[name]=cb; }
    loadFile() { return Promise.resolve(); } isDestroyed() { return this.dead; }
    showInactive() { this.shown++; } destroy() { this.dead=true; this.events.closed?.(); }
  }
  const module={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/window/startup-window.ts','utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
    {exports:module,__dirname:'fixture',process:{uptime:()=>1},console:{info(){},warn(){}},require:id=>id==='electron'
      ?{BrowserWindow,app:{once:(_name,cb)=>quit.push(cb)}}:path});
  return {module,windows,quit,status:{ready:false,paused:false,hidden:false,shortcut:'Control+Alt+M'}};
}

test('loading feedback shows without focus, follows actual stages and closes only after scene readiness', () => {
  const f=fixture(); f.module.openStartupWindow(f.status,'preload.js');
  const w=f.windows[0]; assert.equal(w.options.show,false); assert.equal(w.options.frame,false);
  f.module.updateStartupWindow({...f.status,startupStage:'materials'});
  w.events['ready-to-show'](); assert.equal(w.shown,1);
  assert.equal(w.sent.at(-1)[1].startupStage,'materials'); assert.equal(w.dead,false);
  f.module.updateStartupWindow({...f.status,ready:true}); assert.equal(w.dead,true);
});

test('rapid readiness, failure and quitting never leave or flash a late loading window', () => {
  for(const state of [{ready:true},{displayError:'Desktop unavailable'}]) {
    const f=fixture(); f.module.openStartupWindow(f.status,'preload.js'); const w=f.windows[0];
    f.module.updateStartupWindow({...f.status,...state}); w.events['ready-to-show']();
    assert.equal(w.dead,true); assert.equal(w.shown,0);
  }
  const f=fixture(); f.module.openStartupWindow(f.status,'preload.js'); f.quit[0]();
  assert.equal(f.windows[0].dead,true);
});
