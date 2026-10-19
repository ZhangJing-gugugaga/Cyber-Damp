// Read-only CDP diagnostics. Never sends input or changes game state.
import fs from 'node:fs';
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = pages.find(p => p.type === 'page' && p.url.includes('index.html'));
if (!page) throw new Error('No running Cyber Damp page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
const output = process.argv[2] ?? 'logs/material-uat/renderer-events.jsonl';
let nextId = 0;
const printed = new Set();
ws.addEventListener('message', e => {
  const event = JSON.parse(e.data);
  if (!['Log.entryAdded', 'Runtime.consoleAPICalled', 'Runtime.exceptionThrown'].includes(event.method)) return;
  fs.appendFileSync(output, JSON.stringify({ receivedAt: Date.now(), ...event }) + '\n');
  const signature = event.method === 'Log.entryAdded' ? event.params.entry.text
    : JSON.stringify(event.params.args ?? event.params.exceptionDetails ?? event.params);
  if (!printed.has(signature)) { printed.add(signature); console.log(JSON.stringify(event)); }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
for (const method of ['Log.enable', 'Runtime.enable']) ws.send(JSON.stringify({ id: ++nextId, method }));
setTimeout(() => ws.close(), Number(process.argv[3] ?? 60000));
