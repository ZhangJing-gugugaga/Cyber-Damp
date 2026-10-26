import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';

function run(file, globals) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, console, ...globals });
  return exports;
}

test('current preload exposes care and capsule without desktop takeover or whole-save replacement', async () => {
  let api;
  const calls = [];
  run('src/preload/index.ts', { require: () => ({
    contextBridge: { exposeInMainWorld(name, value) { assert.equal(name, 'damp'); api = value; } },
    ipcRenderer: { invoke(...args) { calls.push(args); return Promise.resolve(); } },
  }) });
  assert.deepEqual(Object.keys(api).sort(), ['app', 'management', 'native', 'wallpaper', 'weather', 'window']);
  // v1.15：v0.2 玩法与壁纸通道都是具名、类型化的单一操作，没有整档写或任意文件能力
  assert.deepEqual(Object.keys(api.wallpaper).sort(), ['setEnabled', 'status', 'wipe']);
  for (const name of ['careProgressV2', 'careCompleteV2', 'harvestV2', 'plantSpore', 'cancelPlant', 'setOverlayVariant']) {
    assert.equal(typeof api.native[name], 'function', name);
  }
  const v2Calls = calls.length;
  await api.native.careCompleteV2('object');
  await api.native.setOverlayVariant('B');
  await api.wallpaper.setEnabled(true);
  assert.deepEqual(calls.slice(v2Calls).map((c) => c[0]), ['native:careCompleteV2', 'native:setOverlayVariant', 'wallpaper:setEnabled']);
  // 载荷对象来自 vm 上下文（跨 realm），按 JSON 比较
  assert.equal(JSON.stringify(calls.slice(v2Calls).map((c) => c[1])), JSON.stringify([{ objectId: 'object' }, { variant: 'B' }, { on: true }]));
  calls.length = 0;
  await api.native.careProgress('object', 0.4, 'mask');
  await api.window.setIgnoreMouseEvents(false);
  await api.app.quit();
  assert.equal(calls[0][0], 'native:careProgress');
  assert.equal(calls[0][1].objectId, 'object');
  assert.equal(calls[0][1].mask, 'mask');
  assert.equal(calls[1][0], 'window:setIgnoreMouseEvents');
  assert.equal(calls[1][1].ignore, false);
  assert.equal(calls[2][0], 'app:quit');
  assert.equal(api.app.desktopReady, undefined);
  assert.equal(api.management.publish, undefined);
});

test('public IPC controls the sending window and denies unknown senders', async () => {
  const handlers = new Map(), accepted = {}, unknown = {}, switches = [];
  let weatherCalls = 0, quits = 0;
  const module = run('src/main/ipc/register-handlers.ts', { require(id) {
    if (id === 'electron') return {
      ipcMain: { handle: (name, cb) => handlers.set(name, cb) },
      app: { getVersion: () => 'fixture', quit: () => { quits++; } },
      BrowserWindow: { fromWebContents(sender) {
        assert.equal(sender, accepted);
        return { setIgnoreMouseEvents: (ignore, options) => switches.push([ignore, options.forward]) };
      } },
    };
    if (id.includes('native-handlers')) return { isAllowedSender: sender => sender === accepted };
    if (id.includes('weather-service')) return {
      getWeather: async () => { weatherCalls++; return { status: 'ok' }; }, searchCities: async () => [],
    };
    return { trackEvent() {} };
  } });
  module.registerHandlers();
  handlers.get('window:setIgnoreMouseEvents')({ sender: unknown }, { ignore: false });
  assert.equal(switches.length, 0);
  handlers.get('window:setIgnoreMouseEvents')({ sender: accepted }, { ignore: false, forward: true });
  assert.deepEqual(switches, [[false, true]]);
  const payload = { cityId: 'city', label: 'City', latitude: 30, longitude: 110 };
  assert.equal((await handlers.get('weather:current')({ sender: unknown }, payload)).status, 'unavailable');
  await handlers.get('weather:current')({ sender: accepted }, payload);
  assert.equal(weatherCalls, 1);
  handlers.get('app:quit')({ sender: unknown });
  assert.equal(quits, 0);
  handlers.get('app:quit')({ sender: accepted });
  assert.equal(quits, 1);
  for (const retired of ['desktop:scan', 'desktop:open', 'save:write', 'app:desktopReady', 'icon:applyState']) {
    assert.equal(handlers.has(retired), false, retired);
  }
});

test('startup uses native components even with retired flags and exit retains icon restoration', async () => {
  const events = new Map(), calls = [];
  const app = {
    requestSingleInstanceLock: () => true,
    commandLine: { appendSwitch() {} },
    on: (name, cb) => events.set(name, cb),
    whenReady: () => Promise.resolve(), quit() {},
  };
  run('src/main/index.ts', {
    __dirname: 'fixture/main', process: { env: { CD_LEGACY: '1', CD_QA: '1', CD_NO_ATTACH: '1' } },
    require(id) {
      if (id === 'electron') return { app };
      if (id === 'node:path') return path;
      if (id.includes('register-handlers')) return { registerHandlers: () => calls.push('public-ipc') };
      if (id.includes('event-log')) return { trackEvent() {} };
      if (id.includes('management-window')) return {
        installManagement: () => calls.push('management'), openManagement: () => calls.push('open'),
        setNativeTrayActions: () => calls.push('tray'), managementWebContents: () => null,
      };
      if (id.includes('capsule-window')) return { createCapsuleWindow: () => ({ setVisible() {} }) };
      if (id.includes('icon-mutate')) return {
        reconcilePendingEntries: () => ({ settled: 0, dropped: 0 }),
        restoreAllIconReferences: () => { calls.push('restore'); return []; },
      };
      if (id.includes('native-handlers')) return {
        registerNativeHandlers: () => calls.push('native-ipc'), bootstrapNativeMode: async () => calls.push('bootstrap'),
        scanForNative: async () => calls.push('scan'), latestCycleCandidates: () => [],
      };
      if (id.includes('native-event-scheduler')) return { runNativeEventCycle: async () => calls.push('cycle') };
      if (id.includes('resident-watch')) return { installResidentWatch: () => calls.push('resident-watch') };
      if (id.includes('wallpaper-handlers')) return { registerWallpaperHandlers: () => calls.push('wallpaper-ipc') };
      throw new Error(`Unexpected retired startup dependency: ${id}`);
    },
  });
  await Promise.resolve();
  assert.ok(calls.includes('bootstrap'));
  assert.ok(calls.includes('tray'));
  assert.ok(calls.includes('resident-watch'), '常驻跨日/唤醒必须接线');
  assert.ok(calls.includes('wallpaper-ipc'), 'v1.15 壁纸组必须注册（未接入前如实拒绝开启）');
  events.get('second-instance')();
  assert.equal(calls.at(-1), 'open');
  events.get('before-quit')();
  assert.equal(calls.at(-1), 'restore');
});
