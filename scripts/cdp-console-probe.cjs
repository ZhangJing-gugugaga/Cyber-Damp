/* CDP 控制台抓取：列出所有 target 并收集指定页面的 console/异常消息 */
const port = process.argv[2] || '9223';
const filter = process.argv[3] || 'care';
const seconds = Number(process.argv[4] || 8);

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  console.log('TARGETS:', list.map((t) => `${t.type}:${t.title}:${t.url.slice(0, 80)}`).join('\n  '));
  const targets = list.filter((t) => t.type === 'page' && t.url.includes(filter));
  for (const target of targets) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const messages = [];
    await new Promise((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
        setTimeout(resolve, seconds * 1000);
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
          messages.push(`[${msg.params.type}] ${text}`);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          messages.push(`[exception] ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ''}`);
        } else if (msg.method === 'Log.entryAdded') {
          messages.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
        }
      };
      ws.onerror = () => resolve();
    });
    console.log(`\n=== ${target.url} ===`);
    console.log(messages.length ? messages.join('\n') : '(no console messages captured)');
    ws.close();
  }
  process.exit(0);
}
main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
