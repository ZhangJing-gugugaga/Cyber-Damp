const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,width:1140,height:920,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const errors=[];w.webContents.on('console-message',(_e,details)=>{if(details.level==='error')errors.push(details.message)});
 await w.loadFile(path.join(__dirname,'index.html'));
 await w.webContents.executeJavaScript('new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(window.previewReady){clearInterval(t);resolve(true)}else if(++n>100){clearInterval(t);reject(new Error("image timeout"))}},30)})');
 fs.mkdirSync(path.join(__dirname,'review'),{recursive:true});
 const stages=[];
 for(const p of [0,.17,.32,.46,.58,.74,.84,1]){
  await w.webContents.executeJavaScript(`window.preview.seek(${p})`);
  await new Promise(r=>setTimeout(r,70));
  const shot=await w.webContents.capturePage();fs.writeFileSync(path.join(__dirname,'review',`stage-${Math.round(p*100)}.png`),shot.toPNG());
  const state=await w.webContents.executeJavaScript('({...window.preview.getState(),coverage:window.preview.measureCoverage()})');
  if(state.coverage.ratio>.55)errors.push('Coverage proxy exceeds 55% at '+p);
  stages.push(state);
 }
 await w.webContents.executeJavaScript('document.getElementById("intro").click()');
 await new Promise(r=>setTimeout(r,4400));
 const intro=await w.webContents.executeJavaScript('window.preview.getState()');
 if(intro.playing||Math.abs(intro.progress-.76)>.001)errors.push('Intro did not finish at mature stage');
 const report={stages,intro,errors};fs.writeFileSync(path.join(__dirname,'review','checks.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));app.exit(errors.length?1:0);
}).catch(e=>{console.error(e);app.exit(1)});
