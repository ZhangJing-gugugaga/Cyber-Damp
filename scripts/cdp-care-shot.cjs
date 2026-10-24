/* care 窗口体检：图片加载/布局/滚动条 + 截图 */
const port = process.argv[2] || '9232';
const out = process.argv[3] || 'logs/csp-probe/care-window.png';

async function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res) => {
          const mid = ++id;
          pending.set(mid, res);
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
    });
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? msg.error); pending.delete(msg.id); }
    };
    ws.onerror = () => reject(new Error('ws error'));
  });
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const care = list.find((t) => t.type === 'page' && t.url.includes('care'));
  if (!care) { console.error('NO CARE TARGET'); process.exit(1); }
  const cdp = await connect(care.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const imgs = [...document.querySelectorAll('img')];
      const app = document.getElementById('app');
      return JSON.stringify({
        totalImgs: imgs.length,
        broken: imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src.slice(-48)),
        appRect: app.getBoundingClientRect().toJSON(),
        pageScrollX: document.documentElement.scrollWidth > window.innerWidth,
        pageScrollY: document.documentElement.scrollHeight > window.innerHeight,
        tabBarHeight: document.getElementById('tabs').getBoundingClientRect().height,
        titlebarHeight: document.getElementById('titlebar').getBoundingClientRect().height,
        listWidth: document.getElementById('object-list').getBoundingClientRect().width,
        stageWidth: document.getElementById('canvas-wrap').getBoundingClientRect().width,
      });
    })()`,
    returnByValue: true,
  });
  console.log(result.result?.value ?? JSON.stringify(result));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  require('node:fs').writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('shot ->', out);
  cdp.close();
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
