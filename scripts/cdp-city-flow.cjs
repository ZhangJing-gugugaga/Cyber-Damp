/* 选城市全流程验证：搜索 → 设定 → 状态 → 胶囊天气 */
const port = process.argv[2] || '9234';
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
async function evalOn(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const care = list.find((t) => t.type === 'page' && t.url.includes('care'));
  const capsule = list.find((t) => t.type === 'page' && t.url.includes('capsule'));
  const cw = await connect(care.webSocketDebuggerUrl);
  const cp = await connect(capsule.webSocketDebuggerUrl);
  // 1. 搜索城市（此前被 CSP 之外的场景门禁拦成 invalid-request）
  const search = await evalOn(cw, 'window.damp.weather.searchCity("杭州")');
  console.log('searchCity:', JSON.stringify(search).slice(0, 160));
  const okSearch = search && search.ok && search.options.length > 0;
  // 2. 设定城市
  const hangzhou = search.options[0];
  const setLocation = await evalOn(cw, `window.damp.native.setLocation({ cityId: "${hangzhou.id}", label: "${hangzhou.name}", latitude: ${hangzhou.latitude}, longitude: ${hangzhou.longitude} })`);
  console.log('setLocation:', JSON.stringify(setLocation));
  // 3. 状态里应有 location；capsule 取数应 ok
  await new Promise((r) => setTimeout(r, 4000));
  const status = await evalOn(cw, 'window.damp.native.status().then(s => JSON.stringify({ location: s.location, todayStatus: s.todayStatus }))');
  console.log('status:', status);
  const weather = await evalOn(cp, 'window.damp.weather.current((await window.damp.native.status()).location).then(r => JSON.stringify({ status: r.status, temp: r.snapshot?.temperatureC, hum: r.snapshot?.humidityPct, code: r.snapshot?.weatherCode, usable: r.usableForEvents }))');
  console.log('capsule weather:', weather);
  const pass = okSearch && setLocation?.ok && weather && JSON.parse(weather).status === 'ok';
  console.log(pass ? 'CITY-FLOW PASS' : 'CITY-FLOW FAIL');
  cw.close(); cp.close();
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
