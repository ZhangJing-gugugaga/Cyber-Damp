/**
 * 原生 IPC 失败传播与重复结算探针（真实路径：preload → ipcMain → native-handlers → save-store）。
 *
 * 不触碰桌面：存档位于临时 userData，对象为存档内的虚拟记录（无扫描、无图标写入）。
 * 覆盖：余额不足、重复购买、无成熟菇、重复采摘、干净对象护理、旧进度回执、
 * 新手奖励重复发放、写盘失败（不扣币/不发奖励/不改状态）及恢复后重试。
 *
 * 运行（需先 npm run build）：node_modules/.bin/electron scripts/uat-ipc-failure.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-ipc-fail-'));
app.setPath('userData', dataDir);
const savePath = path.join(dataDir, 'save.json');
const readSave = () => JSON.parse(fs.readFileSync(savePath, 'utf8'));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

function nativeObject(id, damage) {
  return {
    id, realPath: `C:\\CD-ipc-probe\\${id}`, kind: 'dir', displayName: id, originalMtime: 1,
    damage, careProgress: 0, moldImmuneUntil: 0, lastAdvanceAt: 0,
  };
}

function freshSave(coins) {
  return {
    schemaVersion: 3,
    savedAt: Date.now(),
    player: { coins, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'changsha', migratedOn: '2026-10-25' },
    files: [],
    ropes: [],
    stats: { harvested: 0, earned: 0, playedMs: 0 },
    native: {
      init: { status: 'legacy-initialized' },
      dailyEvents: {},
      objects: {
        dirty: nativeObject('dirty', { family: 'damp', stage: 1, mushroom: 'none' }),
        clean: nativeObject('clean', { family: 'damp', stage: 0, mushroom: 'none' }),
        ripe: nativeObject('ripe', { family: 'mold', stage: 0, mushroom: 'mature' }),
      },
      lastSnapshot: null,
    },
  };
}

app.whenReady().then(async () => {
  fs.writeFileSync(savePath, JSON.stringify(freshSave(3)), 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(root, 'dist/preload/index.js'), contextIsolation: true, sandbox: false },
  });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const { registerNativeHandlers } = require(path.join(root, 'dist/main/ipc/native-handlers.js'));
  registerNativeHandlers(() => win.webContents);

  const call = (expr) => win.webContents.executeJavaScript(`window.damp.${expr}`);
  const coins = () => readSave().player.coins;
  const owned = () => readSave().player.owned;

  try {
    // 1. 余额不足：失败且不扣币、不持有
    const poor = await call('native.buy("big-sponge")');
    check('余额不足购买返回失败', poor.ok === false && poor.message === '菇币不足', JSON.stringify(poor));
    check('余额不足时存档不变', coins() === 3 && owned().length === 0, `coins=${coins()}`);

    // 2. 无成熟菇采摘：失败，不加币
    const noMature = await call('native.harvest("dirty")');
    check('无成熟菇采摘返回失败', noMature.ok === false, JSON.stringify(noMature));
    check('无成熟菇采摘不加币', coins() === 3);

    // 3. 干净对象护理：失败，不改损伤
    const cleanCare = await call('native.careComplete("clean")');
    check('干净对象护理返回失败', cleanCare.ok === false, JSON.stringify(cleanCare));

    // 4. 旧进度回执迟到：对干净对象的进度回执被拒绝，不写入 careProgress
    const late = await call('native.careProgress("clean", 0.6, "AAAA")');
    check('干净对象的旧进度回执被拒绝', late.ok === false);
    check('旧回执未写入存档', readSave().native.objects.clean.careProgress === 0);

    // 5. 正常进度写入
    const progress = await call('native.careProgress("dirty", 0.4, "AAAA")');
    check('污渍对象进度正常写入', progress.ok === true && readSave().native.objects.dirty.careProgress === 0.4);

    // 6. 完成护理：成功一次，免疫窗口写入；再次完成失败
    const done = await call('native.careComplete("dirty")');
    const afterDone = readSave().native.objects.dirty;
    check('完成护理成功并清零损伤', done.ok === true && afterDone.damage.stage === 0, JSON.stringify(done));
    check('完成护理写入 240h 免疫', afterDone.moldImmuneUntil > Date.now() + 239 * 3600e3);
    const again = await call('native.careComplete("dirty")');
    check('重复完成护理失败且不重复结算', again.ok === false);

    // 7. 采摘：成功一次结算 4 币；重复采摘失败不再加币
    const harvest1 = await call('native.harvest("ripe")');
    check('成熟菇采摘成功并结算 4 币', harvest1.ok === true && harvest1.coins === 4 && coins() === 7, JSON.stringify(harvest1));
    const harvest2 = await call('native.harvest("ripe")');
    check('重复采摘失败且不重复加币', harvest2.ok === false && coins() === 7, JSON.stringify(harvest2));

    // 8. 新手奖励：一次性；重复完成不重发
    const ob1 = await call('native.onboardingDone()');
    check('新手奖励发放 24 币', ob1.ok === true && coins() === 31, `coins=${coins()}`);
    const ob2 = await call('native.onboardingDone()');
    check('重复完成引导不重发奖励', ob2.ok === true && coins() === 31);

    // 9. 购买成功：扣币并立即持有；重复购买失败不扣款
    const buy1 = await call('native.buy("care-mat")');
    check('购买护理垫成功扣 8 币', buy1.ok === true && coins() === 23 && owned().includes('care-mat'));
    const buy2 = await call('native.buy("care-mat")');
    check('重复购买失败且不扣款', buy2.ok === false && coins() === 23 && owned().length === 1, JSON.stringify(buy2));

    // 10. 写盘失败：保存失败时不扣币、不持有、界面收到失败
    fs.mkdirSync(`${savePath}.tmp`); // 让 tmp 写入失败，模拟保存失败
    const failBuy = await call('native.buy("big-sponge")');
    check('写盘失败时购买返回失败', failBuy.ok === false, JSON.stringify(failBuy));
    check('写盘失败时不扣币不持有', coins() === 23 && !owned().includes('big-sponge'));
    fs.rmSync(`${savePath}.tmp`, { recursive: true, force: true });

    // 11. 恢复后同一操作可成功，且只结算一次
    const retry = await call('native.buy("big-sponge")');
    check('恢复写盘后重试成功且只扣一次', retry.ok === true && coins() === 11 && owned().includes('big-sponge'));

    // 12. 改城：天气取不到时保留原城市（不能先存再取）；成功后才保存新城市（需要网络）
    const before = readSave().native.location ?? null;
    const badCity = await call('native.setLocation({ cityId: "bad-probe", label: "不存在城", latitude: 999, longitude: 999 })');
    check('改城天气不可用时返回失败', badCity.ok === false && typeof badCity.message === 'string', JSON.stringify(badCity));
    check('改城失败时保留原城市', JSON.stringify(readSave().native.location ?? null) === JSON.stringify(before));
    const goodCity = await call('native.setLocation({ cityId: "1808926", label: "杭州市", latitude: 30.29365, longitude: 120.16142 })');
    check('改城成功返回 ok（需网络）', goodCity.ok === true, JSON.stringify(goodCity));
    check('改城成功后保存新城市', readSave().native.location?.label === '杭州市');
  } catch (error) {
    check('探针执行无异常', false, String(error && error.stack ? error.stack : error));
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSUMMARY ${results.length - failed}/${results.length} passed`);
  // Chromium 退出前仍可能占用 userData 内的文件；清理失败只提示，不影响退出
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (error) {
    console.warn(`临时目录未清理（可手动删除）: ${dataDir} ${error.code || error.message}`);
  }
  app.exit(failed === 0 ? 0 : 1);
});
