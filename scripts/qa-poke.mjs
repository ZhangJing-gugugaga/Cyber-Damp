/**
 * QA 蜗牛戳击定位（开发/验收用）：沿地面扫描指针，靠 WS_EX_TRANSPARENT 跳变定位蜗牛后点击。
 * 用法：node scripts/qa-poke.mjs
 */
import fs from 'node:fs';
import koffi from 'koffi';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const user32 = koffi.load('user32.dll');
const FindWindowW = user32.func('void *FindWindowW(str16 className, str16 windowName)');
const GetWindowLongW = user32.func('long GetWindowLongW(void *hWnd, int nIndex)');
const WS_EX_TRANSPARENT = 0x20;
const hwnd = FindWindowW(null, '回南天 Cyber Damp');
function clickThrough() {
  return (GetWindowLongW(hwnd, -20) & WS_EX_TRANSPARENT) !== 0;
}

const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
if (!page) throw new Error('未找到调试目标');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});
const send = (method, params = {}) => {
  const mid = ++id;
  return new Promise((res, rej) => {
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
};
const mouse = (type, x, y, buttons = 0, clickCount = 0) =>
  send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons,
    clickCount,
    pointerType: 'mouse',
  });

let found = null;
for (let pass = 0; pass < 3 && !found; pass++) {
  for (let x = 100; x <= 1450; x += 8) {
    await mouse('mouseMoved', x, 800);
    await sleep(45);
    if (!clickThrough()) {
      found = x;
      break;
    }
  }
  if (!found) await sleep(400);
}

if (found === null) {
  console.log(JSON.stringify({ poked: false }));
} else {
  await mouse('mousePressed', found, 800, 1, 1);
  await sleep(50);
  await mouse('mouseReleased', found, 800, 0, 1);
  await sleep(250);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/laotie_nb666/AppData/Local/Temp/cd-poke.png', Buffer.from(data, 'base64'));
  console.log(JSON.stringify({ poked: true, x: found }));
}
ws.close();
