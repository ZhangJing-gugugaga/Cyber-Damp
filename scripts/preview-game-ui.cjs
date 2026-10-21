// Independent design previews, using the same Chromium capture path as build-brand-icon.cjs.
// These fixtures are not production desktop or portable-package acceptance evidence.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  const outputArg = process.argv.find(arg => arg.startsWith('--output='));
  const output = path.resolve(outputArg ? outputArg.slice('--output='.length) : 'logs/game-ui-preview'); fs.mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 720, height: 760,
    webPreferences: { sandbox: true, offscreen: true } });
  let frame, frameSerial = 0;
  win.webContents.on('paint', (_event, _dirty, image) => { frame = image; frameSerial++; });
  async function capture(destination) {
    const serial = frameSerial; win.webContents.invalidate();
    for (let attempt = 0; attempt < 100 && frameSerial === serial; attempt++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(frame && frameSerial > serial, 'No fresh Chromium paint frame');
    fs.writeFileSync(destination, frame.toPNG());
  }
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  for (const layout of ['cabinet', 'inventory']) for (const page of ['shop', 'settings', 'care']) {
    await win.loadFile(path.resolve('dist/renderer/manage.html'), { query: { preview: '1', layout, page } });
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      let attempts=0;const timer=setInterval(()=>{
        if(document.querySelectorAll('#shop .item-slot').length===10 && !document.querySelector('i[data-lucide]')){clearInterval(timer);resolve(true)}
        else if(++attempts>100){clearInterval(timer);reject(new Error('Preview did not finish rendering'))}
      },50);
    })`);
    const result = await win.webContents.executeJavaScript(`({layout:document.body.dataset.layout,
      page:document.querySelector('[role=tabpanel]:not([hidden])').id,
      slots:document.querySelectorAll('.item-slot').length,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth})`);
    assert.equal(result.horizontalOverflow, false);
    await capture(path.join(output, `${layout}-${page}.png`));
    console.log(JSON.stringify(result));
  }
  if (process.argv.includes('--effects')) {
    win.setSize(1120, 880);
    await win.loadURL('http://127.0.0.1:5173/effects.html');
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      let attempts=0;const timer=setInterval(()=>{
        if(document.querySelector('#scene canvas') && document.querySelectorAll('#presets button').length===12 && window.__CD_MATERIAL_REVIEW__){clearInterval(timer);resolve(true)}
        else if(++attempts>200){clearInterval(timer);reject(new Error('Effect library did not render'))}
      },100);
    })`);
    const presets = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#presets button'),b=>b.dataset.id)`);
    for (const preset of presets) {
      await win.webContents.executeJavaScript(`document.querySelector('[data-id="${preset}"]').click()`);
      for (const progress of [0, 500, 1000]) {
        await win.webContents.executeJavaScript(`(()=>{const range=document.querySelector('#progress');range.value=${progress};range.dispatchEvent(new Event('input'))})()`);
        await new Promise(resolve => setTimeout(resolve, 180));
        await capture(path.join(output, `effect-${preset}-${progress}.png`));
        if (preset.startsWith('mold-') || preset.startsWith('care-')) {
          for (const pixels of [48, 60, 96, 128]) {
          const measurements = await win.webContents.executeJavaScript(`window.__CD_MATERIAL_REVIEW__(${pixels})`);
          for (const [index, sample] of measurements.samples.entries()) if (sample) {
            for (const layer of ['source', 'colonies', 'fungi', 'union']) {
              fs.writeFileSync(path.join(output, `mask-${preset}-${progress}-${pixels}-${index}-${layer}.png`), Buffer.from(sample[layer].split(',')[1], 'base64'));
              delete sample[layer];
            }
          }
          fs.writeFileSync(path.join(output, `mask-${preset}-${progress}-${pixels}.json`), JSON.stringify(measurements, null, 2));
          assert.ok(measurements.samples.every(sample => !sample || sample.ratio <= .90), `Mildew coverage exceeds 90%: ${preset}`);
          }
        }
      }
      console.log(`effect preview: ${preset}`);
      if (process.argv.includes('--motion')) {
        const base64 = await win.webContents.executeJavaScript(`(async()=>{
          document.querySelector('[data-id="${preset}"]').click();
          const canvas=document.querySelector('#scene canvas'),stream=canvas.captureStream(24);
          const type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
          const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:1500000}),chunks=[];
          recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
          const stopped=new Promise(resolve=>recorder.onstop=resolve);
          recorder.start();
          const started=performance.now();
          for(let tick=0;tick<150;tick++){
            await new Promise(resolve=>setTimeout(resolve,200));
            if(performance.now()-started>=8300 && document.querySelector('#progress-value').textContent==='100%')break;
          }
          if(document.querySelector('#progress-value').textContent!=='100%')throw new Error('Motion did not reach its stable endpoint');
          await new Promise(resolve=>setTimeout(resolve,600));recorder.stop();await stopped;
          stream.getTracks().forEach(track=>track.stop());
          return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type}))});
        })()`);
        fs.writeFileSync(path.join(output, `effect-${preset}.webm`), Buffer.from(base64, 'base64'));
        console.log(`motion recorded: ${preset}`);
      }
    }
  }
  if (process.argv.includes('--specials')) {
    win.setSize(1020, 720); await win.loadURL('http://127.0.0.1:5173/specials.html');
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{
      if(window.__CD_SPECIAL_REVIEW__){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(new Error('Special preview did not initialize'))}
    },100)})`);
    await capture(path.join(output, 'special-idle.png'));
    await win.webContents.executeJavaScript('document.querySelector("#anger").click()');
    await new Promise(resolve => setTimeout(resolve, 1800));
    await capture(path.join(output, 'special-near.png'));
    await win.webContents.executeJavaScript('document.querySelector("#restart").click()');
    await new Promise(resolve => setTimeout(resolve, 1800));
    await capture(path.join(output, 'special-growth.png'));
    console.log(await win.webContents.executeJavaScript('window.__CD_SPECIAL_REVIEW__()'));
  }
  assert.deepEqual(errors, []);
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
