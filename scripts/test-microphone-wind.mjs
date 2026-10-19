/** Pure/mock validation only. Never requests access to a real microphone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const output = path.resolve('logs/microphone-wind-tests/compiled');
await fs.mkdir(output, { recursive: true });
const compile = spawnSync(process.execPath, [
  'node_modules/typescript/bin/tsc', 'src/renderer/audio/microphone-wind.ts',
  '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node',
  '--lib', 'ES2022,DOM', '--skipLibCheck', '--strict', '--outDir', output,
], { encoding: 'utf8' });
assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
const require = createRequire(import.meta.url);
const { MicrophoneWind } = require(path.join(output, 'microphone-wind.js'));
const { BreathEnvelope } = require(path.join(output, 'breath-envelope.js'));

function advance(envelope, rms, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) envelope.step(rms, 1 / 60);
  return envelope.strength;
}

test('adaptive RMS gate ignores quiet room noise and low background changes', () => {
  const envelope = new BreathEnvelope();
  assert.equal(advance(envelope, 0.003, 1), 0);
  assert.equal(envelope.ready, true);
  assert.equal(advance(envelope, 0.006, 8), 0);
  assert.equal(advance(envelope, 0.003, 2), 0);
});

test('breath gets a fast bounded attack, sustained gust and smooth release', () => {
  const envelope = new BreathEnvelope();
  advance(envelope, 0.003, 1);
  assert.ok(advance(envelope, 0.08, 0.12) > 0.7);
  assert.ok(advance(envelope, 0.08, 2) > 0.95);
  assert.ok(advance(envelope, 0.003, 0.1) > 0.5, 'Release should not snap to zero');
  assert.ok(advance(envelope, 0.003, 0.5) < 0.2);
  assert.equal(envelope.step(NaN, 1 / 60), 0);
  envelope.reset();
  assert.equal(envelope.ready, false);
  assert.equal(envelope.strength, 0);
});

async function mockedInput(run, getUserMedia = null) {
  const contexts = [];
  let signal = 0.003;
  let requests = 0;
  class Track extends EventTarget {
    readyState = 'live'; muted = false; stops = 0;
    stop() { this.stops++; this.readyState = 'ended'; }
  }
  const track = new Track();
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class AudioNodeMock {
    connections = []; disconnects = 0;
    connect(node) { this.connections.push(node); return node; }
    disconnect() { this.disconnects++; }
  }
  class AudioContextMock {
    state = 'suspended'; destination = {}; nodes = []; closes = 0;
    constructor() { contexts.push(this); }
    async resume() { this.state = 'running'; }
    async close() { this.closes++; this.state = 'closed'; }
    createMediaStreamSource() { const node = new AudioNodeMock(); this.nodes.push(node); return node; }
    createBiquadFilter() { const node = new AudioNodeMock(); node.frequency = { value: 0 }; node.Q = { value: 0 }; this.nodes.push(node); return node; }
    createAnalyser() {
      const node = new AudioNodeMock();
      node.getFloatTimeDomainData = (samples) => { node.lastSamples = samples; samples.fill(signal); };
      this.nodes.push(node);
      return node;
    }
  }
  const old = new Map(['window', 'navigator', 'AudioContext'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const windowMock = new EventTarget();
  windowMock.AudioContext = AudioContextMock;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: AudioContextMock });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async (constraints) => {
    requests++;
    assert.equal(constraints.video, false);
    assert.equal(constraints.audio.autoGainControl, false);
    return getUserMedia ? getUserMedia(stream) : stream;
  } } } });
  const mic = new MicrophoneWind();
  try { await run({ mic, track, stream, contexts, windowMock, setSignal: (level) => { signal = level; }, requests: () => requests }); }
  finally {
    mic.dispose();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('construction and disabling are inert: no device request or AudioContext', async () => {
  await mockedInput(async ({ mic, contexts, requests }) => {
    assert.equal(mic.state, 'disabled');
    assert.equal(mic.update(1 / 60), 0);
    await mic.setEnabled(false);
    assert.equal(requests(), 0);
    assert.equal(contexts.length, 0);
  });
});

test('audio-only opt-in calibrates then exposes wind, wipes samples, and releases all resources', async () => {
  await mockedInput(async ({ mic, track, contexts, setSignal }) => {
    assert.equal(await mic.setEnabled(true), true);
    assert.equal(mic.state, 'calibrating');
    for (let i = 0; i < 60; i++) mic.update(1 / 60);
    assert.equal(mic.state, 'ready');
    assert.equal(mic.strength, 0);
    setSignal(0.15);
    for (let i = 0; i < 12; i++) mic.update(1 / 60);
    assert.ok(mic.strength > 0.9 && mic.strength <= 1);
    const context = contexts[0];
    const analyser = context.nodes.at(-1);
    assert.ok(analyser.lastSamples.every((sample) => sample === 0));
    assert.equal(analyser.connections.length, 0, 'No speaker/output connection');
    await mic.setEnabled(false);
    assert.equal(mic.state, 'disabled');
    assert.equal(mic.strength, 0);
    assert.equal(track.stops, 1);
    assert.equal(context.closes, 1);
    assert.ok(context.nodes.every((node) => node.disconnects === 1));
  }, null);
});

test('permission rejection and unsupported capture leave zero wind without throwing', async () => {
  await mockedInput(async ({ mic, contexts }) => {
    assert.equal(await mic.setEnabled(true), false);
    assert.equal(mic.state, 'denied');
    assert.equal(mic.enabled, false);
    assert.equal(mic.update(1), 0);
    assert.equal(contexts[0].closes, 1);
    await mic.setEnabled(false);
    navigator.mediaDevices.getUserMedia = undefined;
    assert.equal(await mic.setEnabled(true), false);
    assert.equal(mic.state, 'unavailable');
    assert.equal(mic.strength, 0);
  }, async () => { throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }); });
});

test('disable during a pending permission request stops any stream granted later', async () => {
  let grant;
  const permission = new Promise((resolve) => { grant = resolve; });
  await mockedInput(async ({ mic, track, stream, contexts, requests }) => {
    const pending = mic.setEnabled(true);
    assert.equal(mic.state, 'requesting');
    assert.equal(mic.setEnabled(true), pending);
    assert.equal(requests(), 1);
    await mic.setEnabled(false);
    assert.equal(mic.strength, 0);
    grant(stream);
    assert.equal(await pending, false);
    assert.equal(mic.state, 'disabled');
    assert.equal(track.stops, 1);
    assert.equal(contexts[0].closes, 1);
  }, () => permission);
});

test('hardware disconnect and page unload immediately stop input and force zero wind', async () => {
  await mockedInput(async ({ mic, track, contexts }) => {
    await mic.setEnabled(true);
    track.dispatchEvent(new Event('ended'));
    assert.equal(mic.state, 'unavailable');
    assert.equal(mic.strength, 0);
    assert.equal(track.stops, 1);
    assert.equal(contexts[0].closes, 1);
  }, null);
  await mockedInput(async ({ mic, track, contexts, windowMock }) => {
    await mic.setEnabled(true);
    windowMock.dispatchEvent(new Event('pagehide'));
    assert.equal(mic.state, 'disabled');
    assert.equal(mic.enabled, false);
    assert.equal(track.stops, 1);
    assert.equal(contexts[0].closes, 1);
    assert.equal(await mic.setEnabled(true), false);
  }, null);
});
