// Read-only Shell artwork extraction. Does not open or modify the source folder.
const {app, screen}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.whenReady().then(()=>{
 const {extractShellIconImage}=require('../../dist/main/native/win32-icons');
 const source=path.join(app.getPath('desktop'),'work');
 if(!fs.statSync(source).isDirectory()) throw Error('Expected desktop work folder');
 const icon=extractShellIconImage(source);
 if(!icon || icon.isEmpty()) throw Error('Shell artwork unavailable');
 fs.writeFileSync(path.join(__dirname,'icon.png'),icon.toPNG());
 let size=null;
 try { const koffi=require('koffi'); const shell=koffi.load('shell32.dll');
 // The persisted desktop IconSize is read separately; no Shell layout mutations.
 const {execFileSync}=require('node:child_process');
 const raw=execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\Shell\\Bags\\1\\Desktop','/v','IconSize'],{encoding:'utf8',windowsHide:true});
 const match=raw.match(/IconSize\s+REG_DWORD\s+(0x[\da-f]+)/i); if(match)size=parseInt(match[1],16);
 }catch{}
 const meta={label:'work',source:'Windows Desktop / work (Shell icon, read only)',sourcePixels:icon.getSize(),iconSize:size || 48,sizeVerified:!!size,displayScale:screen.getPrimaryDisplay().scaleFactor};
 fs.writeFileSync(path.join(__dirname,'meta.js'),'window.ICON_META='+JSON.stringify(meta)+';');
 console.log(JSON.stringify(meta)); app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
