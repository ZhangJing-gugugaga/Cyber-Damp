import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

test('detached young mushrooms keep their growth stage while animating', () => {
  const module = {}, shown = [];
  vm.runInNewContext(compile('src/renderer/app/harvest-controller.ts'), { exports: module,
    require: id => id.endsWith('special-mushrooms') ? { tickCutMushroom() {} } : {} });
  const controller = Object.create(module.HarvestController.prototype);
  controller.deps = { runtime: { locked: false } }; controller.time = 0;
  controller.hallucination = { update() {} };
  controller.detached = [{ item: { species: 'lava', growth: .4 }, view: { update(growth) { shown.push(growth); }, container: {} },
    cutFace: { clear() {} }, falling: false }];
  controller.update(.1);
  assert.deepEqual(shown, [.4]);
  assert.equal(controller.detached[0].item.growth, .4);
});

test('pointer harvest explains the missing shovel before either special harvest path', () => {
  const module = {}, messages = []; let specialCalls = 0;
  vm.runInNewContext(compile('src/renderer/app/game-actions.ts'), { exports: module, require: () => ({}) });
  const runtime = { owned: [], byId: new Map(['shy', 'lava'].map(species => [species, { runtime: { mushroom: { species, growth: .2 } } }])),
    pickMushroom() { throw Error('Must not sell a special mushroom without the shovel'); } };
  const actions = module.createGameActions({ runtime, toast: { tip(message) { messages.push(message); } },
    harvestSpecial() { specialCalls++; return true; } });
  actions.pickMushroom('shy'); actions.pickMushroom('lava');
  assert.equal(specialCalls, 0);
  assert.equal(messages.length, 2);
  for (const message of messages) assert.match(message, /PVZ铲子/);
  runtime.owned.push('pvz-shovel'); actions.pickMushroom('lava');
  assert.equal(specialCalls, 1);
});

test('failed startup shortcut is visible and the same combination can be retried without removing another binding', async () => {
  let available = false, registrations = 0, created = 0, managedWindow, escapeCallback;
  const handlers = new Map(), removed = [], module = {};
  const sent = [], scene = { webContents: { send(...args) { sent.push(args); } } };
  class Tray { setToolTip() {} on() {} setContextMenu() {} }
  class BrowserWindow {
    constructor(options) { created++; managedWindow = this; this.options=options; this.handlers={}; this.visible=true; this.minimized=false; this.webContents = { setWindowOpenHandler() {}, send() {} }; }
    setMenuBarVisibility() {} once() {} on(name, handler) { this.handlers[name]=handler; } loadFile() { return Promise.resolve(); }
    show() { this.visible=true; } hide() { this.visible=false; } focus() {} isDestroyed() { return false; }
    isMinimized() { return this.minimized; } minimize() { this.minimized=true; } restore() { this.minimized=false; }
    close() { this.handlers.close({preventDefault(){}}); }
  }
  const electron = { app: { getPath: () => 'fixture', on() {} }, Tray, BrowserWindow, nativeImage: { createFromPath: () => ({}) },
    globalShortcut: { register(key, callback) { registrations++; if(key==='Escape') escapeCallback=callback; return available; }, unregister(value) { removed.push(value); } },
    ipcMain: { handle(name, handler) { handlers.set(name, handler); }, on() {} },
    Menu: { buildFromTemplate: value => value }, powerMonitor: { on() {} } };
  vm.runInNewContext(compile('src/main/window/management-window.ts'), { exports: module, __dirname: 'fixture', console: { warn() {} },
    require: id => id === 'electron' ? electron : id === 'node:path' ? path : id === 'node:fs' ? {
      readFileSync() { throw Error('first run'); }, writeFileSync() {},
    } : id.endsWith('/management') ? { STARTUP_STAGES: ['launch','graphics','desktop','materials','takeover'] }
      : id === './startup-window' ? { updateStartupWindow() {}, openStartupWindow() {} } : {} });
  module.installManagement(() => scene, 'preload.js');
  const stageCommand=handlers.get('management:command');
  assert.equal((await stageCommand({sender:{}},{action:'startup-stage',value:'desktop'})).ok,false);
  assert.equal((await stageCommand({sender:scene.webContents},{action:'startup-stage',value:'invalid'})).ok,false);
  assert.equal((await stageCommand({sender:scene.webContents},{action:'startup-stage',value:'desktop'})).ok,true);
  assert.equal(handlers.get('management:get')().status.startupStage,'desktop');
  module.markSceneReady(); assert.equal(created,0,'Automatic startup must not open a management prompt');
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
  const sender = scene.webContents;
  assert.equal((await handlers.get('management:command')({ sender: {} }, { action: 'microphone', value: 'on' })).ok, false);
  assert.equal((await handlers.get('management:command')({ sender }, { action: 'microphone', value: 'yes' })).ok, false);
  assert.equal((await handlers.get('management:command')({ sender }, { action: 'veil', value: 'unknown' })).ok, false);
  assert.equal((await handlers.get('management:command')({ sender }, { action: 'microphone', value: 'off' })).ok, true);
  assert.equal(sent.at(-1)[1].action, 'microphone'); assert.equal(sent.at(-1)[1].value, 'off');
  const command=handlers.get('management:command');
  assert.equal((await command({sender:scene.webContents},{action:'window-close'})).ok,false);
  assert.equal((await command({sender:{}},{action:'window-minimize'})).ok,false);
  assert.equal(managedWindow.visible,true);
  assert.equal((await command({sender:managedWindow.webContents},{action:'window-minimize'})).ok,true);
  assert.equal(managedWindow.minimized,true);
  module.openManagement(); assert.equal(managedWindow.minimized,false);
  assert.equal((await command({sender:managedWindow.webContents},{action:'window-close'})).ok,true);
  assert.equal(managedWindow.visible,false); assert.equal(read().paused,false); assert.equal(read().hidden,false);
  assert.equal(managedWindow.options.frame,false); assert.equal(managedWindow.options.transparent,true);
  assert.equal((await command({sender:managedWindow.webContents},{action:'tool-mode',value:'on'})).ok,false);
  available=true;
  await command({sender:scene.webContents},{action:'tool-mode',value:'on'});
  module.syncToolEscape(false); assert.equal(escapeCallback,undefined);
  module.syncToolEscape(true); assert.equal(typeof escapeCallback,'function');
  module.syncToolEscape(false); assert.equal(removed.at(-1),'Escape');
  module.syncToolEscape(true); escapeCallback();
  assert.equal(sent.at(-1)[1].action,'cancel-tool');
});

test('management reuses settings hooks, publishes pending media state and ignores stale permission results after disabling', async () => {
  const module = {}, published = [], calls = []; let onCommand, resolveEnable;
  const prefs = { sfx: true, veil: '', microphoneEnabled: false, microphoneState: 'disabled' };
  const settings = { preferences: () => ({ ...prefs }), setSfx(on) { prefs.sfx = on; calls.push('sfx'); },
    setVeil(value) { prefs.veil = value; calls.push('veil'); },
    setMicrophone(on) { calls.push(on ? 'enable' : 'disable'); prefs.microphoneEnabled = on; prefs.microphoneState = on ? 'requesting' : 'disabled';
      return on ? new Promise(resolve => { resolveEnable = resolve; }) : Promise.resolve(false); } };
  const runtime = { coins: 0, owned: [], equipped: {}, entities: [], byId: new Map() };
  vm.runInNewContext(compile('src/renderer/app/management-bridge.ts'), { exports: module, require: () => ({}),
    window: { damp: { management: { publish: value => published.push(value), onStatus() {}, onCommand: cb => { onCommand = cb; } } }, addEventListener() {} }, setInterval: () => 1, clearInterval() {} });
  module.connectManagement({}, runtime, {}, new Map(), { settings });
  assert.deepEqual(calls, []); assert.equal(published.at(-1).preferences.microphoneEnabled, false);
  await onCommand({ action: 'sfx', value: 'off' }); assert.equal(prefs.sfx, false);
  await onCommand({ action: 'veil', value: 'high' }); assert.equal(prefs.veil, 'high');
  const pending = onCommand({ action: 'microphone', value: 'on' });
  assert.equal(published.at(-1).preferences.microphoneState, 'requesting');
  await onCommand({ action: 'microphone', value: 'off' }); const feedback = published.at(-1).feedback.sequence;
  resolveEnable(false); await pending;
  assert.equal(published.at(-1).feedback.sequence, feedback); assert.equal(published.at(-1).preferences.microphoneEnabled, false);
  assert.deepEqual(calls, ['sfx', 'veil', 'enable', 'disable']);
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
