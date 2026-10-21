const browser = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const socket = new WebSocket(browser.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
socket.addEventListener('message', event => {
  const reply = JSON.parse(event.data);
  if (reply.id !== 1) return;
  console.log(JSON.stringify(reply.result?.gpu ?? reply.error, null, 2)); socket.close();
});
socket.send(JSON.stringify({ id: 1, method: 'SystemInfo.getInfo' }));
