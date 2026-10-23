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
    webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  async function capture(destination) {
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    // Wait for presentation too: capturePage can otherwise return the previous
    // document's bitmap while the new DOM already reports the expected page.
    win.webContents.invalidate();
    await new Promise(resolve => setTimeout(resolve, 180));
    const image = await win.webContents.capturePage();
    const frame = image.toPNG();
    assert.ok(frame.length > 24 && frame.subarray(1, 4).toString() === 'PNG', 'Empty or invalid PNG frame');
    fs.writeFileSync(destination, frame);
  }
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  async function waitForShop() {
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      let attempts=0;const timer=setInterval(()=>{
        if(document.querySelectorAll('#shop .item-slot').length===10 && !document.querySelector('i[data-lucide]')){clearInterval(timer);resolve(true)}
        else if(++attempts>100){clearInterval(timer);reject(new Error('Preview did not finish rendering'))}
      },50);
    })`);
  }
  for (const layout of ['cabinet', 'inventory', 'workbench']) for (const page of ['shop', 'settings', 'care']) {
    await win.loadFile(path.resolve('dist/renderer/manage.html'), { query: { preview: '1', layout, page } });
    await waitForShop();
    const result = await win.webContents.executeJavaScript(`({layout:document.body.dataset.layout,
      page:document.querySelector('[role=tabpanel]:not([hidden])').id,
      slots:document.querySelectorAll('.item-slot').length,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth})`);
    assert.equal(result.horizontalOverflow, false);
    await capture(path.join(output, `${layout}-${page}.png`));
    console.log(JSON.stringify(result));
  }
  if (process.argv.includes('--window-fit')) {
    const results = [];
    for (const [width, height] of [[720, 760], [560, 500], [640, 600], [800, 650]]) for (const feedback of [false, true]) {
      win.setSize(width, height);
      await win.loadFile(path.resolve('dist/renderer/manage.html'), { query: { preview: '1', shell: '1', page: 'shop' } });
      await waitForShop();
      if (feedback) await win.webContents.executeJavaScript(`document.querySelector('#feedback').textContent='已领取道具。可以继续选择其他物品，或返回桌面。'`);
      const result = await win.webContents.executeJavaScript(`(()=>{
        const rect=document.querySelector('.purchase').getBoundingClientRect();
        return {width:innerWidth,height:innerHeight,button:{top:rect.top,bottom:rect.bottom,height:rect.height},
          verticalOverflow:document.documentElement.scrollHeight>innerHeight+1,
          actionVisible:rect.top>=0 && rect.bottom<=innerHeight && !!document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('.purchase')};
      })()`);
      assert.ok(result.actionVisible && !result.verticalOverflow && result.button.height >= 35, JSON.stringify(result));
      results.push({ ...result, feedback });
      await capture(path.join(output, `window-fit-${width}-${height}-${feedback}.png`));
    }
    fs.writeFileSync(path.join(output, 'window-fit.json'), JSON.stringify(results, null, 2));
    console.log(`window-fit checks: ${results.length}`);
  }
  if (process.argv.includes('--shop-art')) {
    win.setSize(720, 760);
    await win.loadFile(path.resolve('dist/renderer/manage.html'), { query: { preview: '1', page: 'shop' } });
    await waitForShop();
    const ids = await win.webContents.executeJavaScript(`[...document.querySelectorAll('#shop [data-item]')].map(el=>el.dataset.item)`);
    const results = [];
    for (const id of ids) {
      const result = await win.webContents.executeJavaScript(`(()=>{
        const slot=document.querySelector('#shop [data-item='+${JSON.stringify(id)}+']');
        slot.scrollIntoView({block:'nearest'}); slot.click();
        const detail=document.querySelector('#item-detail'), rect=detail.getBoundingClientRect();
        const action=detail.querySelector('.purchase'), button=action.getBoundingClientRect();
        return {id:${JSON.stringify(id)},title:detail.querySelector('h3').textContent,
          expectedTitle:slot.querySelector('span').textContent, action:action.textContent,
          selected:slot.getAttribute('aria-pressed'),
          actionVisible:button.top>=rect.top && button.bottom<=innerHeight && button.height>=35};
      })()`);
      assert.equal(result.title, result.expectedTitle);
      assert.equal(result.selected, 'true'); assert.ok(result.actionVisible, JSON.stringify(result));
      await capture(path.join(output, `shop-prop-${id}.png`)); results.push(result);
    }
    fs.writeFileSync(path.join(output, 'shop-art.json'), JSON.stringify(results, null, 2));
    console.log(`shop prop selection and captures: ${results.length}`);
    const repeat = await win.webContents.executeJavaScript(`(async()=>{
      const purchases=[];
      for(const id of ['spray-1','box-1']){
        document.querySelector('#shop [data-item='+id+']').click();
        for(let n=0;n<2;n++){
          const buy=document.querySelector('.purchase');
          if(buy.disabled)throw new Error(id+' cannot be bought again');
          buy.click();await new Promise(resolve=>setTimeout(resolve,20));
          purchases.push({id,wallet:document.querySelector('#wallet').textContent,disabled:buy.disabled});
        }
      }
      return purchases;
    })()`);
    assert.equal(repeat.length, 4); assert.equal(repeat.at(-1).wallet, '80 币');
    assert.ok(repeat.every(x=>!x.disabled), JSON.stringify(repeat));
    fs.writeFileSync(path.join(output, 'repeat-consumables.json'), JSON.stringify(repeat, null, 2));
    console.log('two purchases per consumable remain available; balance 180 -> 80');
  }
  if (process.argv.includes('--settings')) {
    win.setSize(720, 760);
    await win.loadFile(path.resolve('dist/renderer/manage.html'), { query: { preview: '1', page: 'settings' } });
    await waitForShop();
    const result = await win.webContents.executeJavaScript(`(async()=>{
      const sfx=document.querySelector('#sfx-toggle'),mic=document.querySelector('#microphone-toggle');
      const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
      const initiallyOff=mic.getAttribute('aria-checked')==='false';
      sfx.click(); await settle(); const muted=sfx.getAttribute('aria-checked')==='false';
      const legacyMuted=document.querySelector('.settings-panel .sfx-toggle').getAttribute('aria-checked')==='false';
      document.querySelector('[data-veil="low"]').click(); await settle();
      const veil=document.documentElement.dataset.veil;
      mic.click(); await settle();
      return {initiallyOff,muted,legacyMuted,veil,unavailable:mic.getAttribute('aria-checked')==='false'&&document.querySelector('#microphone-status').textContent.includes('可用麦克风')};
    })()`);
    assert.ok(result.initiallyOff && result.muted && result.legacyMuted && result.unavailable && result.veil === 'low', JSON.stringify(result));
    fs.writeFileSync(path.join(output, 'settings-controls.json'), JSON.stringify(result, null, 2));
    await capture(path.join(output, 'settings-controls.png'));
    // Exercise the real synthesis code with browser OfflineAudioContext only:
    // no microphone permission, live AudioContext or speaker output.
    const ts = require('typescript');
    const synthesis = ts.transpileModule(fs.readFileSync('src/renderer/audio/sfx.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const audio = await win.webContents.executeJavaScript(`(async()=>{
      const exports={};${synthesis}
      const previous=window.AudioContext;let context;
      try {
        window.AudioContext=class extends OfflineAudioContext {constructor(){super(1,96000,48000);context=this}resume(){return Promise.resolve()}};
        const sfx=new exports.Sfx();sfx.setRain(1);sfx.setEnabled(false);
        const buffer=await context.startRendering();let peak=0;
        for(const sample of buffer.getChannelData(0).subarray(48000))peak=Math.max(peak,Math.abs(sample));
        return {scope:'offline-audio-not-audible-uat',mutedPeak:peak};
      } finally {window.AudioContext=previous}
    })()`);
    fs.writeFileSync(path.join(output, 'offline-audio-mute.json'), JSON.stringify(audio, null, 2));
    assert.ok(audio.mutedPeak < 1e-7, `Rain resumed after muting: ${audio.mutedPeak}`);
    console.log('settings reuse and offline rain mute checks passed');
  }
  if (process.argv.includes('--selection')) {
    win.setSize(1120, 880); await win.loadURL('http://127.0.0.1:5173/effects.html');
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{
      if(window.__CD_MATERIAL_SELECTION_REVIEW__){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Selection preview unavailable'))}
    },50)})`);
    const result = await win.webContents.executeJavaScript('window.__CD_MATERIAL_SELECTION_REVIEW__()');
    assert.deepEqual(result.before, result.after); assert.equal(result.hitMovedIcon, true);
    assert.deepEqual(result.movedBy, { x: 120, y: 80 });
    fs.writeFileSync(path.join(output, 'selection-local-bounds.json'), JSON.stringify(result, null, 2));
    console.log('selection bounds stay local while the surrogate moves');
  }
  if (process.argv.includes('--effects') || process.argv.includes('--composite')) {
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
        const rendered = await win.webContents.executeJavaScript('window.__CD_MATERIAL_FRAME__()');
        assert.equal(rendered.progress, progress / 1000);
        fs.writeFileSync(path.join(output, `canvas-${preset}-${progress}.png`), Buffer.from(rendered.png.split(',')[1], 'base64'));
        await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await capture(path.join(output, `effect-${preset}-${progress}.png`));
        if (process.argv.includes('--composite')) for (const pixels of [48, 60, 96, 128]) {
          const measurements = await win.webContents.executeJavaScript(`window.__CD_MATERIAL_COMPOSITE_REVIEW__(${pixels}, ${pixels === 48})`);
          assert.equal(measurements.progress, progress / 1000, 'Captured progress differs from the requested state');
          assert.ok(measurements.sceneUnchanged, 'Measurement changed the rendered scene');
          for (const [index, sample] of measurements.samples.entries()) if (sample) {
            for (const layer of ['source', 'colonies', 'fungi', 'material', 'projected', 'union']) {
              fs.writeFileSync(path.join(output, `composite-${preset}-${progress}-${pixels}-${index}-${layer}.png`), Buffer.from(sample[layer].split(',')[1], 'base64'));
              delete sample[layer];
            }
          }
          fs.writeFileSync(path.join(output, `composite-${preset}-${progress}-${pixels}.json`), JSON.stringify(measurements, null, 2));
          assert.ok(measurements.samples.every(sample => sample && sample.total > 0 && sample.ratio <= .90), `Composite coverage exceeds 90%: ${preset}`);
        }
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
      await win.webContents.executeJavaScript('document.querySelector("#shovel").click()');
      await new Promise(resolve => setTimeout(resolve, 500));
      await capture(path.join(output, 'special-shovel.png'));
      await win.webContents.executeJavaScript('document.querySelector("#shovel").click()');
    await win.webContents.executeJavaScript('document.querySelector("#restart").click()');
    await new Promise(resolve => setTimeout(resolve, 1800));
    await capture(path.join(output, 'special-growth.png'));
    console.log(await win.webContents.executeJavaScript('window.__CD_SPECIAL_REVIEW__()'));
  }
  assert.deepEqual(errors, []);
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
