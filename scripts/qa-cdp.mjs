/**
 * QA 驱动（开发/验收用，不参与打包）：通过 CDP 向运行中的 Electron 渲染层派发真实鼠标/键盘事件，
 * 并抓取页面截图与求值表达式结果。用于透明置顶窗无法被系统截图工具捕获时的功能/视觉验证。
 *
 * 用法：node scripts/qa-cdp.mjs '<JSON steps>'
 * steps: {type:"move",x,y} | {type:"click",x,y} | {type:"circle",cx,cy,r} | {type:"drag",x1,y1,x2,y2}
 *        | {type:"key",combo:"Ctrl+Shift+D"} | {type:"wait",ms} | {type:"shot",path}
 *        | {type:"eval",expr} | {type:"quit"}
 */
import fs from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 20; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch {
      /* 调试端口尚未就绪 */
    }
    await sleep(300);
  }
  throw new Error('未找到 Electron 调试目标');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('open', () => resolve({ send, close: () => ws.close() }));
    ws.addEventListener('error', reject);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    });
    function send(method, params = {}) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
  });
}

const KEYS = {
  ctrl: 2,
  shift: 8,
  alt: 1,
  meta: 4,
};

async function keyCombo(cdp, combo) {
  const parts = combo.split('+');
  const key = parts.pop();
  let modifiers = 0;
  for (const p of parts) modifiers |= KEYS[p.toLowerCase()] ?? 0;
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    modifiers,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    modifiers,
  });
}

async function mouse(cdp, type, x, y, buttons, clickCount = 0) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons,
    clickCount,
    pointerType: 'mouse',
  });
}

async function run(steps) {
  const t = await target();
  const cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Page.enable').catch(() => {});
  await cdp.send('Runtime.enable').catch(() => {});
  for (const s of steps) {
    if (s.type === 'move') {
      await mouse(cdp, 'mouseMoved', s.x, s.y, 0);
    } else if (s.type === 'click') {
      await mouse(cdp, 'mouseMoved', s.x, s.y, 0);
      await mouse(cdp, 'mousePressed', s.x, s.y, 1, 1);
      await sleep(40);
      await mouse(cdp, 'mouseReleased', s.x, s.y, 0, 1);
    } else if (s.type === 'drag') {
      await mouse(cdp, 'mouseMoved', s.x1, s.y1, 0);
      await mouse(cdp, 'mousePressed', s.x1, s.y1, 1, 1);
      const steps2 = 12;
      for (let i = 1; i <= steps2; i++) {
        await mouse(cdp, 'mouseMoved', s.x1 + ((s.x2 - s.x1) * i) / steps2, s.y1 + ((s.y2 - s.y1) * i) / steps2, 1);
        await sleep(12);
      }
      await sleep(40);
      await mouse(cdp, 'mouseReleased', s.x2, s.y2, 0, 1);
    } else if (s.type === 'circle') {
      // 拧干：按下后绕圆心顺时针画满一圈（超过 2π 留余量）
      await mouse(cdp, 'mouseMoved', s.cx, s.cy, 0);
      await mouse(cdp, 'mousePressed', s.cx, s.cy, 1, 1);
      const n = 32;
      for (let i = 1; i <= n; i++) {
        const a = (i / n) * Math.PI * 2 * 1.08;
        await mouse(cdp, 'mouseMoved', s.cx + Math.cos(a) * s.r, s.cy + Math.sin(a) * s.r, 1);
        await sleep(14);
      }
      await sleep(40);
      await mouse(cdp, 'mouseReleased', s.cx + s.r, s.cy, 0, 1);
    } else if (s.type === 'key') {
      await keyCombo(cdp, s.combo);
    } else if (s.type === 'wait') {
      await sleep(s.ms);
    } else if (s.type === 'shot') {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(s.path, Buffer.from(data, 'base64'));
      console.log(`[shot] ${s.path}`);
    } else if (s.type === 'eval') {
      const r = await cdp.send('Runtime.evaluate', { expression: s.expr, returnByValue: true, awaitPromise: true });
      console.log(`[eval] ${JSON.stringify(r.result?.value ?? r.result)}`);
    } else if (s.type === 'quit') {
      await cdp.send('Runtime.evaluate', { expression: 'window.damp?.app.quit()', awaitPromise: true });
    }
  }
  cdp.close();
}

let raw = process.argv[2];
if (raw && raw.startsWith('@')) raw = fs.readFileSync(raw.slice(1), 'utf8');
if (!raw) {
  console.error('usage: node scripts/qa-cdp.mjs <json-steps|@steps-file>');
  process.exit(1);
}
run(JSON.parse(raw)).catch((err) => {
  console.error('[qa-cdp] 失败:', err);
  process.exit(1);
});
