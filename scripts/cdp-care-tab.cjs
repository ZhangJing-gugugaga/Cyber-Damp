const port = process.argv[2] || '9232';
const tabName = process.argv[3] || 'care';
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
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.tab[data-tab="${tabName}"]').click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 900));
  const check = await cdp.send('Runtime.evaluate', { expression: `(() => { const imgs=[...document.querySelectorAll('img')]; const page=document.getElementById('page-${tabName}'); return JSON.stringify({active: getComputedStyle(page).display, w: page.getBoundingClientRect().width, broken: imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src.slice(-48)).filter(s=>s)}); })()`, returnByValue: true });
  console.log(check.result?.value);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  require('node:fs').writeFileSync(`logs/csp-probe/tab-${tabName}.png`, Buffer.from(shot.data, 'base64'));
  console.log('shot saved');
  cdp.close(); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
