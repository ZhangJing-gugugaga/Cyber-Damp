import koffi from 'koffi';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const u = koffi.load('user32.dll');
const find=u.func('void *FindWindowW(str16 cls,str16 title)');
const child=u.func('void *FindWindowExW(void *p,void *after,str16 cls,str16 title)');
const visible=u.func('bool IsWindowVisible(void *h)');
const processId=u.func('uint32 GetWindowThreadProcessId(void *h,_Out_ uint32 *id)');
const proto=koffi.proto('bool __stdcall RestoreEnumProc(void *h,intptr_t data)');
const enumerate=u.func('bool EnumWindows(RestoreEnumProc *cb,intptr_t data)');
let view=child(find('Progman',null),null,'SHELLDLL_DefView',null);
if(!view){const cb=koffi.register(h=>{const v=child(h,null,'SHELLDLL_DefView',null);if(v){view=v;return false}return true},koffi.pointer(proto));enumerate(cb,0);koffi.unregister(cb);}
assert.ok(view,'Explorer DefView must exist');
const list=child(view,null,'SysListView32',null);
const overlay=child(view,null,'Chrome_WidgetWin_1','回南天 Cyber Damp');
assert.ok(overlay,'Only kill the attached Cyber Damp test instance');
assert.equal(visible(list),false,'Native icons must be hidden before the test');
const ids=[0];processId(overlay,ids);
const normal = process.argv[2] === 'normal';
let socket;
if (normal) {
  const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
  const target=targets.find(t=>t.type==='page'&&t.url.includes('index.html'));
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
}
const start=performance.now();
if(normal) socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'void window.damp.app.quit()'}}));
else process.kill(ids[0],'SIGKILL');
while(!visible(list)&&performance.now()-start<2000) await new Promise(r=>setTimeout(r,5));
const elapsed=performance.now()-start;
socket?.close();
const record={test:normal?'normal-quit':'forced-process-termination',pid:ids[0],restored:visible(list),elapsedMs:Math.round(elapsed),pass:visible(list)&&elapsed<500};
fs.writeFileSync(process.argv[3] ?? `logs/native-uat/${normal?'normal':'forced'}-exit.json`,JSON.stringify(record,null,2));
console.log(JSON.stringify(record));
if (!record.restored) u.func('bool ShowWindow(void *h,int cmd)')(list,5);
assert.equal(record.pass,true,'Native desktop must reappear within 500ms');
// Icon restoration precedes Electron/Chromium teardown. Do not let a following
// launch race the old instance's port, single-instance lock or GPU cache.
const alive = () => { try { process.kill(ids[0],0); return true; } catch { return false; } };
const exitDeadline = performance.now()+10000;
while(alive() && performance.now()<exitDeadline) await new Promise(r=>setTimeout(r,25));
assert.equal(alive(),false,'The tested root process must exit before another instance starts');
