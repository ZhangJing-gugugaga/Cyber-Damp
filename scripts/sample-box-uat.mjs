// Read-only sampling during native input; never alters the game or sends input.
import fs from 'node:fs';
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = pages.find(p => p.type === 'page' && p.url.includes('index.html'));
if (!page) throw new Error('Cyber Damp is not running');
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
ws.addEventListener('message', e => {
  const message = JSON.parse(e.data);
  const resolve = pending.get(message.id);
  if (resolve) { pending.delete(message.id); resolve(message); }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once:true}); ws.addEventListener('error', reject, {once:true}); });
const output = process.argv[2] ?? 'logs/material-uat/box-pose-samples.json';
const duration = Math.min(60000, Math.max(1000, Number(process.argv[3] ?? 30000)));
const samples = [];
const start = performance.now();
try {
  while (performance.now() - start < duration) {
    const next = ++id;
    const reply = new Promise(resolve => pending.set(next, resolve));
    ws.send(JSON.stringify({id:next,method:'Runtime.evaluate',params:{
      expression:'({time:performance.now(),boxes:window.__CD_INSPECT__?.().boxes})',returnByValue:true,
    }}));
    const result = await Promise.race([reply,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Read-only inspection timed out')),2000))]);
    if (result.error || result.result?.exceptionDetails) throw new Error(JSON.stringify(result));
    samples.push(result.result.result.value);
    await new Promise(resolve => setTimeout(resolve,33));
  }
} finally { ws.close(); }
const pouring = samples.flatMap(s => (s.boxes ?? []).filter(b => b.pouring));
const maxDegrees = Math.max(0,...pouring.map(b => b.angle * 180 / Math.PI));
fs.writeFileSync(output,JSON.stringify({samples,maxDegrees,pouringSamples:pouring.length},null,2));
console.log(JSON.stringify({samples:samples.length,maxDegrees,pouringSamples:pouring.length,last:samples.at(-1)}));
