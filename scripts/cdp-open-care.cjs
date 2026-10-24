const port = process.argv[2] || '9232';
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const capsule = list.find((t) => t.type === 'page' && t.url.includes('capsule'));
  const ws = new WebSocket(capsule.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  const pending = new Map(); let id = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  await send('Runtime.evaluate', { expression: 'window.damp.management.open()' });
  await new Promise(r => setTimeout(r, 2500));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
