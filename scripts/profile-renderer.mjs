// Read-only Chromium CPU sampling for diagnosing the production renderer.
import fs from 'node:fs';
const pages = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = pages.find(p => p.url.includes('index.html'));
if (!page) throw new Error('Scene unavailable');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let serial = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const resolve = pending.get(message.id);
  if (resolve) { pending.delete(message.id); resolve(message.result); }
});
const send = (method, params = {}) => new Promise(resolve => {
  const id = ++serial; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params }));
});
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 1000 });
await send('Profiler.start');
await new Promise(resolve => setTimeout(resolve, 20000));
const { profile } = await send('Profiler.stop');
await send('Profiler.disable');
socket.close();
fs.writeFileSync('logs/mildew-native/revision-2/renderer.cpuprofile', JSON.stringify(profile));
const samples = new Map();
for (const id of profile.samples) samples.set(id, (samples.get(id) || 0) + 1);
console.log(profile.nodes.map(n => ({ name: n.callFrame.functionName, url: n.callFrame.url,
  line: n.callFrame.lineNumber, samples: samples.get(n.id) || 0 })).sort((a, b) => b.samples - a.samples).slice(0, 20));
