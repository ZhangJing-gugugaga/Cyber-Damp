const port = process.argv[2] || '9234';
const expr = process.argv[3];
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const care = list.find((t) => t.type === 'page' && t.url.includes('care'));
  const ws = new WebSocket(care.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  const pending = new Map(); let id = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  console.log(JSON.stringify(r, null, 2).slice(0, 800));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
