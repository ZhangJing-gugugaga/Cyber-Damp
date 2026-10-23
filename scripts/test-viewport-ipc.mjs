import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  const handlers = new Map(), notices = [], errors = []; let scale = 1.25, hidden = 0, restored = 0;
  const contents = { async executeJavaScript(source) { assert.doesNotMatch(source,/requestAnimationFrame/,'Hidden geometry queries must not wait for a throttled paint'); return { scaleFactor: 2, width: 960, height: 540 }; }, send(channel, value) { notices.push({ channel, value }); } };
  const win = { webContents: contents, isDestroyed: () => false, hide() {} };
  const electron = { ipcMain: { handle(name, handler) { handlers.set(name, handler); } }, app: {}, shell: {},
    screen: { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1.25 }] },
    dialog: { async showMessageBox() {} } };
  const dependencies = {
    electron, 'node:path': path,
    '../window/create-overlay-window': { getOverlayCanvasScale: () => scale, setOverlayCanvasScale(_win, value) { scale = value; },
      isOverlayReady: () => false, waitForOverlayFirstFrame: async () => true, revealDesktopOverlay: () => true },
    '../native/win32-desktop': { attachOverlayToDesktop: () => true, hideDesktopIcons: async () => { hidden++; return true; },
      overlayScreenRect: () => ({ x: 0, y: 0, width: 1920, height: 1080 }), suspendDesktopHost() {}, startDesktopHostMonitor() {},
      restoreDesktop() { restored++; } },
    '../desktop/native-desktop-scan': { scanNativeDesktop: async () => [] },
    '../window/management-window': { waitForStartupPrompt: async () => {}, markSceneReady() {}, isSceneHidden: () => false,
      async reportDisplayError(message) { errors.push(message); } },
  };
  const module = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/ipc/register-handlers.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: module, require: id => dependencies[id] ?? {}, process: { env: {}, uptime: () => 0 }, performance, setTimeout, clearTimeout, console: { info() {}, warn() {}, error() {} } });
  module.registerHandlers(() => win, () => contents);
  const invoke = (channel, value, sender = contents) => handlers.get(channel)({ sender }, value);
  return { invoke, notices, errors, hidden: () => hidden, restored: () => restored };
}

test('native icons stay visible until the current scene rescans and acknowledges its post-parent DPI', async () => {
  const f = fixture(); await f.invoke('desktop:scan', { scaleFactor: 1.25, width: 1536, height: 864 });
  const ready = f.invoke('app:desktopReady');
  await new Promise(resolve => setImmediate(resolve));
  const request = f.notices.find(notice => notice.channel === 'system:displayChanged').value;
  assert.equal(f.hidden(), 0);
  assert.equal(f.invoke('app:viewportReady', { requestId: request.requestId + 1, ok: true }).ok, false);
  assert.equal(f.invoke('app:viewportReady', { requestId: request.requestId, ok: true }, {}).ok, false);
  assert.equal(f.hidden(), 0);
  await f.invoke('desktop:scan', { scaleFactor: 2, width: 960, height: 540 });
  assert.equal(f.invoke('app:viewportReady', { requestId: request.requestId, ok: true }).ok, true);
  assert.equal((await ready).ok, true); assert.equal(f.hidden(), 1); assert.equal(f.errors.length, 0);
});

test('a failed post-parent refresh restores instead of hiding the original desktop', async () => {
  const f = fixture(); await f.invoke('desktop:scan', { scaleFactor: 1.25, width: 1536, height: 864 });
  const ready = f.invoke('app:desktopReady'); await new Promise(resolve => setImmediate(resolve));
  const request = f.notices.find(notice => notice.channel === 'system:displayChanged').value;
  assert.equal(f.invoke('app:viewportReady', { requestId: request.requestId, ok: false }).ok, false);
  assert.equal((await ready).ok, false); assert.equal(f.hidden(), 0); assert.ok(f.restored() > 0); assert.ok(f.errors.length > 0);
});
