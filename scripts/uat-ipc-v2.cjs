/**
 * v0.2 玩法通道端到端探针（真实路径：preload → ipcMain → native-handlers/wallpaper-handlers → save-store）。
 *
 * 不触碰桌面：存档位于临时 userData；对象是存档内的虚拟记录，桌面条目只注入内存
 * （updateNativeEntries，路径指向不存在的探针目录，图标写入会失败并只记日志，不改任何真实引用）。
 * 覆盖：分层会话校验/旧回执、精细与普通完成、剪刀采摘与孢子、播种/取消/失败不扣孢子、
 * A/B 版本、status v4 字段、壁纸组如实拒绝、写盘失败不结算、v1 完成清除旧会话。
 *
 * 运行（需先 npm run build）：node_modules/.bin/electron scripts/uat-ipc-v2.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-ipc-v2-'));
app.setPath('userData', dataDir);
const savePath = path.join(dataDir, 'save.json');
const readSave = () => JSON.parse(fs.readFileSync(savePath, 'utf8'));
const { createCareSession } = require(path.join(root, 'dist/shared/care-session.js'));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

const PROBE_ROOT = 'C:\\CD-ipc-v2-probe-does-not-exist';
function nativeObject(id, damage, extra = {}) {
  return {
    id, realPath: `${PROBE_ROOT}\\${id}`, kind: 'dir', displayName: id, originalMtime: 1,
    damage, careProgress: 0, moldImmuneUntil: 0, lastAdvanceAt: 0, ...extra,
  };
}

function freshSave() {
  return {
    schemaVersion: 3,
    savedAt: Date.now(),
    player: { coins: 10, owned: [], equipped: { rope: 'rope-1', clip: 'clip-1' } },
    weather: { city: 'changsha', migratedOn: '2026-10-26' },
    files: [], ropes: [],
    stats: { harvested: 0, earned: 0, playedMs: 0 },
    native: {
      init: { status: 'legacy-initialized' },
      dailyEvents: {},
      objects: {
        char: nativeObject('char', { family: 'char', stage: 2, mushroom: 'none' }),
        damp: nativeObject('damp', { family: 'damp', stage: 1, mushroom: 'none' }),
        ripe: nativeObject('ripe', { family: 'mold', stage: 1, mushroom: 'mature' }, { mushroomSpecies: 'bell' }),
        bed: nativeObject('bed', null),
        legacy: nativeObject('legacy', { family: 'mold', stage: 1, mushroom: 'none' }),
      },
      lastSnapshot: { temperatureC: 18, humidityPct: 92, weatherCode: 61, observedAt: '2026-10-26T09:00', fetchedAt: Date.now() },
      spores: {},
      planted: {},
    },
  };
}

function entry(id, x, y) {
  return {
    id, name: id, ext: '', category: 'folder', sizeBytes: 0, mtime: 1, realPath: `${PROBE_ROOT}\\${id}`,
    kind: 'dir', iconDataUrl: '', geometry: { x, y, size: 48, labelX: 0, labelY: 0, labelWidth: 0, labelHeight: 0 },
    objectCategory: 'folder',
  };
}

function completedSession(family, stage, tools) {
  const session = createCareSession(family, stage);
  session.layers = session.layers.map((l) => ({ ...l, progress: 1 }));
  session.toolsUsed = tools;
  session.progress = 1;
  return session;
}

app.whenReady().then(async () => {
  fs.writeFileSync(savePath, JSON.stringify(freshSave()), 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(root, 'dist/preload/index.js'), contextIsolation: true, sandbox: false },
  });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const nativeHandlers = require(path.join(root, 'dist/main/ipc/native-handlers.js'));
  const { registerWallpaperHandlers } = require(path.join(root, 'dist/main/ipc/wallpaper-handlers.js'));
  nativeHandlers.registerNativeHandlers(() => win.webContents);
  registerWallpaperHandlers(() => win.webContents);
  // 桌面条目：char/damp/ripe/bed 在桌面（同一列竖排），legacy 不在桌面
  nativeHandlers.updateNativeEntries([entry('char', 20, 10), entry('damp', 20, 100), entry('ripe', 20, 190), entry('bed', 20, 280)]);

  const call = (expr) => win.webContents.executeJavaScript(`window.damp.${expr}`);
  const coins = () => readSave().player.coins;
  const obj = (id) => readSave().native.objects[id];

  try {
    // 1. 会话校验：NaN 进度 / 超长掩码 / 未知工具一律拒绝且不写盘
    const good = completedSession('char', 2, ['sootblock', 'repairroller']);
    // NaN 不能经 JSON 传入，在页面内构造
    const badNan = await call(`native.careProgressV2({ objectId: 'char', family: 'char', stage: 2, session: Object.assign(${JSON.stringify(good)}, { progress: NaN }) })`);
    check('NaN 进度会话被拒绝', badNan.ok === false, JSON.stringify(badNan));
    const longMask = { ...good, layers: good.layers.map((l) => ({ ...l, mask: 'A'.repeat(5000) })) };
    const badMask = await call(`native.careProgressV2(${JSON.stringify({ objectId: 'char', family: 'char', stage: 2, session: longMask })})`);
    check('超长掩码会话被拒绝', badMask.ok === false);
    const badTool = await call(`native.careProgressV2(${JSON.stringify({ objectId: 'char', family: 'char', stage: 2, session: { ...good, toolsUsed: ['flamethrower'] } })})`);
    check('未知工具会话被拒绝', badTool.ok === false);
    check('非法会话未写入存档', obj('char').careSession === undefined);

    // 2. 旧回执：载荷损伤与存档不一致
    const staleSession = completedSession('char', 1, ['sootblock']);
    const stale = await call(`native.careProgressV2(${JSON.stringify({ objectId: 'char', family: 'char', stage: 1, session: staleSession })})`);
    check('损伤已变化的旧回执被拒绝', stale.ok === false, JSON.stringify(stale));

    // 3. 正常写入 + 旧字段镜像（旧读取路径/旧版程序回退不缩水）
    const half = createCareSession('char', 2);
    half.layers[0].progress = 0.5;
    half.toolsUsed = ['sootblock'];
    half.progress = 0.25;
    const saved = await call(`native.careProgressV2(${JSON.stringify({ objectId: 'char', family: 'char', stage: 2, session: half })})`);
    check('分层会话写入成功', saved.ok === true && obj('char').careSession?.layers?.length === 2, JSON.stringify(saved));
    check('旧字段 careProgress/careMask 已镜像', obj('char').careProgress === 0.25 && typeof obj('char').careMask === 'string');

    // 4. status v4 字段与对象视图
    const status1 = await call('native.status()');
    const charView = status1.objects.find((o) => o.id === 'char');
    check('status 含 v4 字段', status1.forecast !== undefined && status1.alert && status1.dailyLimit === 3
      && status1.dailyUsed === 0 && status1.overlayVariant === 'A' && Array.isArray(status1.planted), JSON.stringify({ limit: status1.dailyLimit, used: status1.dailyUsed, forecast: !!status1.forecast }));
    check('今日菌讯按实况生成且未标默认', status1.forecast && status1.forecast.defaulted === false && status1.forecast.lines.length > 0);
    check('对象视图下发当前会话与类别', charView.careSession?.stage === 2 && charView.objectCategory === 'folder');
    check('邻接按真实坐标：damp 与 char/ripe 相邻，不与 bed 相邻',
      JSON.stringify(status1.objects.find((o) => o.id === 'damp').neighbors) === JSON.stringify(['char', 'ripe']));

    // 5. 精细护理完成：+2 币、光泽、计数；重复完成失败不重复发奖
    await call(`native.careProgressV2(${JSON.stringify({ objectId: 'char', family: 'char', stage: 2, session: good })})`);
    const coinsBefore = coins();
    const fine = await call('native.careCompleteV2("char")');
    check('精细护理完成：fine=true 且 +2 币', fine.ok === true && fine.fine === true && fine.bonusCoins === 2 && coins() === coinsBefore + 2, JSON.stringify(fine));
    check('精细护理写入光泽、计数与 240h 防霉', obj('char').glossUntil > Date.now() && readSave().native.fineCareCount === 1
      && obj('char').moldImmuneUntil > Date.now() + 239 * 3600e3 && obj('char').careSession === undefined);
    const again = await call('native.careCompleteV2("char")');
    check('重复完成失败且不重复发奖', again.ok === false && coins() === coinsBefore + 2);

    // 6. 普通完成（层未完成）：不发精细奖励
    const partial = createCareSession('damp', 1);
    partial.toolsUsed = ['squeegee'];
    await call(`native.careProgressV2(${JSON.stringify({ objectId: 'damp', family: 'damp', stage: 1, session: partial })})`);
    const c2 = coins();
    const plain = await call('native.careCompleteV2("damp")');
    check('层未完成的完成不判精细、不加币', plain.ok === true && plain.fine === false && coins() === c2, JSON.stringify(plain));

    // 7. 剪刀采摘
    const badCut = await call('native.harvestV2({ objectId: "ripe", cutQuality: NaN })');
    check('非法剪切质量被拒绝', badCut.ok === false && obj('ripe').damage.mushroom === 'mature');
    const c3 = coins();
    const cut = await call('native.harvestV2({ objectId: "ripe", cutQuality: 1 })');
    check('采摘成功 +4 币，品种入收藏', cut.ok === true && cut.coins === 4 && cut.species === 'bell' && coins() === c3 + 4
      && readSave().native.collection.bell !== undefined, JSON.stringify(cut));
    check('采摘不清除损伤', obj('ripe').damage.stage === 1 && obj('ripe').damage.mushroom === 'none');
    const sporesAfterCut = readSave().native.spores.bell ?? 0;
    check('孢子掉落与返回值一致', cut.spore ? sporesAfterCut === 1 : sporesAfterCut === 0, `spore=${cut.spore} inventory=${sporesAfterCut}`);
    const cut2 = await call('native.harvestV2({ objectId: "ripe", cutQuality: 1 })');
    check('重复采摘失败且不重复加币', cut2.ok === false && coins() === c3 + 4);

    // 8. 播种
    const s = readSave();
    s.native.spores = { lantern: 1 };
    fs.writeFileSync(savePath, JSON.stringify(s), 'utf8');
    const noSpore = await call('native.plantSpore({ objectId: "bed", species: "bell" })');
    check('孢子不足播种失败', noSpore.ok === false);
    const badSpecies = await call('native.plantSpore({ objectId: "bed", species: "shy" })');
    check('旧品种/未知品种不能播种', badSpecies.ok === false);
    const offDesktop = await call('native.plantSpore({ objectId: "legacy", species: "lantern" })');
    check('不在桌面的对象播种失败且不扣孢子', offDesktop.ok === false && readSave().native.spores.lantern === 1, JSON.stringify(offDesktop));
    const planted = await call('native.plantSpore({ objectId: "bed", species: "lantern" })');
    check('播种成功、扣 1 枚孢子、登记 pending', planted.ok === true && readSave().native.spores.lantern === 0
      && readSave().native.planted.bed?.status === 'pending', JSON.stringify(planted));
    const status2 = await call('native.status()');
    check('对象视图显示播种品种', status2.objects.find((o) => o.id === 'bed').plantedSpecies === 'lantern');
    const cancel = await call('native.cancelPlant("bed")');
    check('取消播种退回孢子', cancel.ok === true && readSave().native.spores.lantern === 1 && !readSave().native.planted.bed);
    const cancel2 = await call('native.cancelPlant("bed")');
    check('重复取消失败', cancel2.ok === false && readSave().native.spores.lantern === 1);

    // 9. A/B 合成版本
    const badVariant = await call('native.setOverlayVariant("C")');
    check('非法合成版本被拒绝', badVariant.ok === false && readSave().native.overlayVariant === undefined);
    const variantB = await call('native.setOverlayVariant("B")');
    check('合成版本 B 已保存', variantB.ok === true && readSave().native.overlayVariant === 'B');

    // 10. 壁纸组：未接入前如实拒绝
    const wpOn = await call('wallpaper.setEnabled(true)');
    check('壁纸开启如实返回未接入', wpOn.ok === false && typeof wpOn.message === 'string' && wpOn.view?.enabled === false, JSON.stringify(wpOn).slice(0, 120));
    const wpStatus = await call('wallpaper.status()');
    check('壁纸状态为 off，雾层强度来自当前天气', wpStatus.enabled === false && wpStatus.status === 'off' && wpStatus.fogLevel > 0, JSON.stringify(wpStatus).slice(0, 120));
    const wpWipe = await call('wallpaper.wipe({ fogMask: "AAAA", progress: 0.1 })');
    check('未开启时擦雾被拒绝', wpWipe.ok === false);

    // 11. 写盘失败：精细完成返回失败，不加币、不改损伤
    const legacySession = completedSession('mold', 1, ['scrubbrush']);
    await call(`native.careProgressV2(${JSON.stringify({ objectId: 'legacy', family: 'mold', stage: 1, session: legacySession })})`);
    const c4 = coins();
    fs.mkdirSync(`${savePath}.tmp`);
    const failWrite = await call('native.careCompleteV2("legacy")');
    check('写盘失败时完成返回失败', failWrite.ok === false, JSON.stringify(failWrite));
    check('写盘失败时不加币不改损伤', coins() === c4 && obj('legacy').damage.stage === 1);
    fs.rmSync(`${savePath}.tmp`, { recursive: true, force: true });

    // 12. v1 完成清除分层会话（避免下次同族同级损伤续上旧掩码）
    const v1 = await call('native.careComplete("legacy")');
    check('v1 完成成功并清除分层会话', v1.ok === true && obj('legacy').careSession === undefined && obj('legacy').damage.stage === 0);
  } catch (error) {
    check('探针执行无异常', false, String(error && error.stack ? error.stack : error));
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSUMMARY ${results.length - failed}/${results.length} passed`);
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (error) {
    console.warn(`临时目录未清理（可手动删除）: ${dataDir} ${error.code || error.message}`);
  }
  app.exit(failed === 0 ? 0 : 1);
});
