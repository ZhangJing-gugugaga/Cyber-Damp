const port = process.argv[2] || '9232';
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const care = list.find((t) => t.type === 'page' && t.url.includes('care'));
  const ws = new WebSocket(care.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.send(JSON.stringify({ id: 1, method: 'Page.bringToFront' }));
  await new Promise(r => setTimeout(r, 800));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
