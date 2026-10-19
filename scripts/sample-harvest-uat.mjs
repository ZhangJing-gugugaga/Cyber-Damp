// Read-only observations while Windows-MCP supplies the actual input.
import fs from 'node:fs';
const pages=await(await fetch('http://127.0.0.1:9222/json')).json();
const page=pages.find(p=>p.type==='page'&&p.url.includes('index.html'));
if(!page)throw new Error('No Cyber Damp renderer');
const ws=new WebSocket(page.webSocketDebuggerUrl);
const pending=new Map(); let next=0;
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);const done=pending.get(m.id);if(done){pending.delete(m.id);done(m);}});
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
const start=performance.now(),samples=[];
const duration=Math.min(60,Math.max(1,Number(process.argv[3]??35)));
try {
  while(performance.now()-start<duration*1000){
    const id=++next;let timer;
    const reply=new Promise((resolve,reject)=>{pending.set(id,resolve);timer=setTimeout(()=>reject(new Error('Read-only harvest sample timed out')),2000);});
    ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:'(()=>{const s=window.__CD_INSPECT__?.();return s?{time:performance.now(),coins:s.coins,tool:s.tool,harvest:s.harvest,files:s.files.filter(f=>f.name.startsWith("Cyber Damp UAT-")),input:s.input,effect:{wallpaperDisplay:document.querySelector(".hallucination-wallpaper")?.style.display,hudFilter:document.getElementById("ui-root")?.style.filter,scale:document.querySelector("#cd-desktop-ripple feDisplacementMap")?.getAttribute("scale")}}:null})()',returnByValue:true}}));
    let result;try{result=await reply;}finally{clearTimeout(timer);pending.delete(id);}
    const value=result.result?.result?.value;if(!value)throw new Error('Inspection unavailable');
    samples.push(value);await new Promise(r=>setTimeout(r,33));
  }
} finally {ws.close();}
fs.writeFileSync(process.argv[2]??'logs/ink-cook-uat/harvest-pose.json',JSON.stringify(samples,null,2));
console.log(JSON.stringify({samples:samples.length,coins:[...new Set(samples.map(s=>s.coins))],maxCooking:Math.max(0,...samples.flatMap(s=>(s.harvest??[]).map(h=>h.cooking))),last:samples.at(-1)?.harvest}));
