/** CDP eval on an arbitrary target: node cdp-any.cjs <port> <match> <expression> */
const [, , portArg, match, expression] = process.argv;
const port = portArg || '9222';

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && t.url.includes(match));
  if (!target) { console.error('NO_TARGET ' + match); process.exit(2); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.value ?? r, null, 0));
  ws.close();
  setTimeout(() => process.exit(0), 100);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
