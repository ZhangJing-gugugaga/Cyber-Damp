// Read-only supporting evidence alongside native desktop video.
import fs from 'node:fs';
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const target = targets.find(t => t.type === 'page' && t.url.includes('index.html'));
if (!target) throw new Error('No running Cyber Damp renderer');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once:true}); ws.addEventListener('error', reject, {once:true}); });
let next = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  const callback = pending.get(m.id);
  if (callback) { pending.delete(m.id); callback(m); }
});
const samples = [];
const started = performance.now();
try {
  while (performance.now() - started < 6000) {
    const id = ++next;
    const result = new Promise(resolve => pending.set(id, resolve));
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:'window.__CD_INSPECT__?.().fan', returnByValue:true}}));
    const message = await Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('Read-only sample timed out')), 2000))]);
    const pose = message.result?.result?.value;
    if (!pose) throw new Error('No fan pose in running inspection view');
    samples.push({seconds:(performance.now()-started)/1000, ...pose});
    await new Promise(resolve => setTimeout(resolve, 50));
  }
} finally { ws.close(); }
const summary = {
  samples:samples.length,
  baseWidths:[...new Set(samples.map(s=>s.baseWidth))],
  baseHeights:[...new Set(samples.map(s=>s.baseHeight))],
  headScaleRange:[Math.min(...samples.map(s=>s.headScaleX)), Math.max(...samples.map(s=>s.headScaleX))],
  rotorAngleRange:[Math.min(...samples.map(s=>s.rotorAngle)), Math.max(...samples.map(s=>s.rotorAngle))],
};
fs.writeFileSync(process.argv[2] ?? 'logs/material-uat/fan-fixed-pose.json', JSON.stringify({summary,samples},null,2));
console.log(JSON.stringify(summary));
