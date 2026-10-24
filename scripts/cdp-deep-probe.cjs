/* CDP 深度探针：reload 抓加载期 CSP/资源错误；打开护理台并抓其加载期错误与 computedStyle */
const port = process.argv[2] || '9231';

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    const events = [];
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res) => {
          const mid = ++id;
          pending.set(mid, res);
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      events,
      close: () => ws.close(),
    });
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? msg.error); pending.delete(msg.id); }
      else if (msg.method) events.push(msg);
    };
    ws.onerror = (err) => reject(new Error('ws error'));
  });
}

async function collect(cdp, label, ms) {
  await new Promise((r) => setTimeout(r, ms));
  const interesting = cdp.events.filter((m) =>
    (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
    || m.method === 'Runtime.exceptionThrown' || m.method === 'Log.entryAdded');
  console.log(`\n=== ${label} ===`);
  if (!interesting.length) console.log('(clean)');
  for (const m of interesting) {
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log(`[console.${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    } else if (m.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', m.params.exceptionDetails.text, (m.params.exceptionDetails.exception?.description ?? '').slice(0, 300));
    } else {
      console.log(`[log.${m.params.entry.level}]`, (m.params.entry.text + ' ' + (m.params.entry.url ?? '')).slice(0, 300));
    }
  }
  cdp.events.length = 0;
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const capsule = list.find((t) => t.type === 'page' && t.url.includes('capsule'));
  const cap = await connect(capsule.webSocketDebuggerUrl);
  await cap.send('Runtime.enable'); await cap.send('Log.enable'); await cap.send('Page.enable');
  await cap.send('Page.reload');
  await collect(cap, 'capsule.html (after reload)', 4000);
  // 打开护理台
  await cap.send('Runtime.evaluate', { expression: 'window.damp.management.open()' });
  await new Promise((r) => setTimeout(r, 3500));
  const list2 = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const care = list2.find((t) => t.type === 'page' && t.url.includes('care'));
  if (!care) { console.log('\nNO CARE TARGET'); cap.close(); process.exit(1); }
  const cw = await connect(care.webSocketDebuggerUrl);
  await cw.send('Runtime.enable'); await cw.send('Log.enable');
  await collect(cw, 'care.html (loaded)', 2500);
  // computedStyle 验证样式是否生效
  const style = await cw.send('Runtime.evaluate', {
    expression: `(() => { const app = document.getElementById('app'); const tab = document.querySelector('.tab'); const cs = app ? getComputedStyle(app) : null; const ts = tab ? getComputedStyle(tab) : null; return JSON.stringify({ appBg: cs?.background?.slice(0,60) ?? null, appBorderRadius: cs?.borderRadius ?? null, tabPadding: ts?.padding ?? null, sheets: document.styleSheets.length, bodyFont: getComputedStyle(document.body).fontFamily.slice(0,40) }); })()`,
    returnByValue: true,
  });
  console.log('\n=== care computedStyle ===\n', style.result?.value ?? JSON.stringify(style));
  cap.close(); cw.close();
  process.exit(0);
}
main().catch((e) => { console.error('probe error:', e.message); process.exit(1); });
