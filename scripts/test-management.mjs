import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

test('failed startup shortcut is visible and the same combination can be retried without removing another binding', async () => {
  let available = false, registrations = 0, created = 0;
  const handlers = new Map(), removed = [], module = {};
  class Tray { setToolTip() {} on() {} setContextMenu() {} }
  class BrowserWindow {
    constructor() { created++; this.webContents = { setWindowOpenHandler() {}, send() {} }; }
    setMenuBarVisibility() {} on() {} loadFile() { return Promise.resolve(); } show() {} focus() {} isDestroyed() { return false; }
  }
  const electron = { app: { getPath: () => 'fixture', on() {} }, Tray, BrowserWindow, nativeImage: { createFromPath: () => ({}) },
    globalShortcut: { register() { registrations++; return available; }, unregister(value) { removed.push(value); } },
    ipcMain: { handle(name, handler) { handlers.set(name, handler); }, on() {} },
    Menu: { buildFromTemplate: value => value }, powerMonitor: { on() {} } };
  vm.runInNewContext(compile('src/main/window/management-window.ts'), { exports: module, __dirname: 'fixture', console: { warn() {} },
    require: id => id === 'electron' ? electron : id === 'node:path' ? path : id === 'node:fs' ? {
      readFileSync() { throw Error('first run'); }, writeFileSync() {},
    } : {} });
  module.installManagement(() => null, 'preload.js');
  const read = () => handlers.get('management:get')().status;
  assert.match(read().shortcutError, /未能注册/);
  available = true;
  assert.equal((await handlers.get('management:command')({}, { action: 'shortcut', value: read().shortcut })).ok, true);
  assert.equal(read().shortcutError, undefined); assert.equal(registrations, 2); assert.deepEqual(removed, []);
  const old = read().shortcut; available = false;
  assert.equal((await handlers.get('management:command')({}, { action: 'shortcut', value: 'Control+Alt+X' })).ok, false);
  assert.equal(read().shortcut, old); assert.deepEqual(removed, []);
  assert.equal((await handlers.get('management:command')({}, { action: 'navigate', value: 'file:///arbitrary' })).ok, false);
  await handlers.get('management:command')({}, { action: 'navigate', value: 'shop' });
  assert.equal(read().page, 'shop');
  await handlers.get('management:command')({}, { action: 'navigate', value: 'settings' });
  assert.equal(read().page, 'settings'); assert.equal(created, 1);
});

test('management publishes actual care and failed harvest outcomes through its existing snapshot', () => {
  const module = {}, published = []; let onCommand;
  const entity = { node: { id: 'file', name: 'fixture' }, runtime: { humidity: .8, mold: .7, char: 0, mushroom: { species: 'lava', growth: 1 } } };
  const runtime = { coins: 0, owned: [], equipped: {}, entities: [entity], byId: new Map([['file', entity]]), now: 1234, sprayCharges: 0 };
  const api = { publish(value) { published.push(value); }, onStatus() {}, onCommand(cb) { onCommand = cb; } };
  vm.runInNewContext(compile('src/renderer/app/management-bridge.ts'), { exports: module,
    require: () => ({ getItem: () => ({ name: '道具', price: 10 }) }),
    window: { damp: { management: api }, addEventListener() {} }, setInterval: () => 1, clearInterval() {} });
  module.connectManagement({}, runtime, { flushNow() {}, flush() {} }, new Map(), { onBuy() {}, pickMushroom() {} });
  onCommand({ action: 'harvest', id: 'file' });
  assert.equal(published.at(-1).feedback.ok, false); assert.match(published.at(-1).feedback.message, /铲子/);
  onCommand({ action: 'dry', id: 'file' });
  assert.equal(entity.runtime.mold, .7); assert.equal(entity.runtime.dryCare, true); assert.equal(published.at(-1).feedback.ok, true);
  onCommand({ action: 'wash', id: 'file' });
  assert.equal(entity.runtime.mold, 0); assert.equal(entity.runtime.mushroom, null); assert.equal(entity.runtime.refreshedAt, 1234);
  onCommand({ action: 'buy', id: 'item' }); assert.equal(published.at(-1).feedback.ok, false); assert.match(published.at(-1).feedback.message, /余额/);
  onCommand({ action: 'dry', id: 'missing' }); assert.equal(published.at(-1).feedback.ok, false);
  assert.equal(published.at(-1).feedback.sequence, 5);
});
