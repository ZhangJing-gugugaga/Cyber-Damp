// Read-only supporting trace for real native hanging/break scenarios.
import fs from 'node:fs';
const duration = Math.min(60, Math.max(1, Number(process.argv[3] ?? 40)));
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = pages.find(p => p.type === 'page' && p.url.includes('index.html'));
if (!page) throw new Error('No active Cyber Damp renderer');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject) => { ws.addEventListener('open',resolve,{once:true}); ws.addEventListener('error',reject,{once:true}); });
let seq=0;
const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);const done=pending.get(m.id);if(done){pending.delete(m.id);done(m);}});
const samples=[];
const start=performance.now();
try {
  while(performance.now()-start < duration*1000) {
    const id=++seq;
    let timer;
    const result=new Promise((resolve,reject)=>{
      pending.set(id,resolve);
      timer=setTimeout(()=>reject(new Error('Read-only rope sample timed out')),2000);
    });
    ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:'(()=>{const s=window.__CD_INSPECT__?.();return s?{ropes:s.ropes,ropePhysics:s.ropePhysics,files:s.files.filter(f=>f.name.startsWith("CDR-")),input:s.input}:null})()',returnByValue:true}}));
    let message;
    try { message=await result; } finally {clearTimeout(timer);pending.delete(id);}
    const value=message.result?.result?.value;
    if(!value) throw new Error('Inspection state unavailable');
    samples.push({seconds:(performance.now()-start)/1000,...value});
    await new Promise(resolve=>setTimeout(resolve,50));
  }
} finally {ws.close();}
fs.writeFileSync(process.argv[2] ?? 'logs/rope-uat/pose-samples.json',JSON.stringify(samples,null,2));
console.log(JSON.stringify({samples:samples.length,seconds:samples.at(-1)?.seconds,ropeCounts:[...new Set(samples.map(s=>s.ropes.length))]}));
