// Observer only: no input, game mutation, clock replacement, or screenshots.
import fs from 'node:fs';
import path from 'node:path';
const port=Number(process.argv[2] || 9333), seconds=Number(process.argv[3] || 300);
const destination=path.resolve(process.argv[4] || 'logs/mildew-native/baseline/frames.jsonl');
const pages=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page=pages.find(p=>p.type==='page' && p.url.includes('index.html'));
if (!page) throw Error('Product page unavailable');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let id=0;const requests=new Map();
ws.addEventListener('message',event=>{const m=JSON.parse(event.data);const request=requests.get(m.id);if(request){requests.delete(m.id);m.error?request.reject(Error(JSON.stringify(m.error))):request.resolve(m.result);}});
const send=(method,params)=>new Promise((resolve,reject)=>{const n=++id;requests.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
fs.mkdirSync(path.dirname(destination),{recursive:true});
const output=fs.createWriteStream(destination,{flags:'wx'});
try {
  // Self-contained observer is removed when finished; game state is untouched.
  const response=await send('Runtime.evaluate',{expression:`(() => new Promise(resolve => {
    const frames=[]; const started=performance.now(); let previous=started;
    function observe(now){ frames.push({at:now,intervalMs:now-previous,visibility:document.visibilityState}); previous=now;
      if(now-started >= ${seconds*1000}) resolve({timeOrigin:performance.timeOrigin,started,finished:now,frames}); else requestAnimationFrame(observe);
    } requestAnimationFrame(observe);
  }))()`,awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
  const result=response.result.value;
  output.write(JSON.stringify({type:'metadata',timeOrigin:result.timeOrigin,started:result.started,finished:result.finished,method:'requestAnimationFrame intervals; presentation/GPU timings not measured'})+'\n');
  for(const frame of result.frames)output.write(JSON.stringify(frame)+'\n');
  const intervals=result.frames.slice(1).map(f=>f.intervalMs).sort((a,b)=>a-b);
  const q=p=>intervals[Math.min(intervals.length-1,Math.floor(intervals.length*p))];
  console.log(JSON.stringify({destination,seconds:(result.finished-result.started)/1000,frames:intervals.length,p95:q(.95),p99:q(.99),max:intervals.at(-1)}));
} finally {await new Promise(resolve=>output.end(resolve));ws.close();}
