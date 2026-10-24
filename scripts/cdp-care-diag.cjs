const port = process.argv[2] || '9232';
async function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.onopen = () => resolve({ send(m, p) { return new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p })); }); }, close: () => ws.close() });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); } };
    ws.onerror = () => reject(new Error('ws error'));
  });
}
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const care = list.find((t) => t.type === 'page' && t.url.includes('care'));
  const cdp = await connect(care.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  const r = await cdp.send('Runtime.evaluate', { expression: `(() => {
    const pages = [...document.querySelectorAll('.page')].map(p => ({ id: p.id, display: getComputedStyle(p).display, w: p.getBoundingClientRect().width }));
    const list = document.getElementById('object-list');
    const cs = list ? getComputedStyle(list) : null;
    return JSON.stringify({ pages, listDisplay: cs?.display, listWidth: cs?.width, activeTab: document.querySelector('.tab.active')?.textContent, err: window.__careBootError ?? null });
  })()`, returnByValue: true });
  console.log(r.result?.value);
  cdp.close(); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
