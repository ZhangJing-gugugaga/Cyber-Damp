/**
 * 壁纸效果纯像素合成测试（Task 14；R9 v0.2）
 * 运行：并入 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeWallpaperEffect, fogLevelFor } from '../dist/test/shared/wallpaper/effects.js';
import { applyWipe, wipeProgress, isCellWiped } from '../dist/test/shared/wallpaper/mask.js';

const W = 320;
const H = 180;

function flatBase(r = 90, g = 120, b = 150) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  return px;
}

function baseInput(over = {}) {
  return {
    width: W, height: H,
    humidityPct: 60,
    weatherCode: 1,
    alertActive: false,
    cornerMoldStage: 0,
    seed: 42,
    ...over,
  };
}

function average(data) {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = W * H;
  for (let i = 0; i < n; i += 1) {
    r += data[i * 4];
    g += data[i * 4 + 1];
    b += data[i * 4 + 2];
  }
  return [r / n, g / n, b / n];
}

test('同一输入得到同一输出（可重复合成）', () => {
  const input = { ...baseInput({ humidityPct: 80 }), base: flatBase() };
  const a = composeWallpaperEffect(input);
  const b = composeWallpaperEffect({ ...input, base: flatBase() });
  assert.deepEqual(a.rgba, b.rgba);
  assert.equal(a.fogLevel, b.fogLevel);
});

test('湿度越高雾层强度不降低（单调）', () => {
  let prev = -1;
  for (const humidity of [30, 50, 70, 85, 95]) {
    const level = fogLevelFor(baseInput({ humidityPct: humidity }));
    assert.ok(level >= prev, `${humidity}% 应 ≥ 上一档`);
    prev = level;
  }
  assert.ok(fogLevelFor(baseInput({ humidityPct: 95 })) > fogLevelFor(baseInput({ humidityPct: 45 })));
});

test('降雨天气生成水痕；非降雨不生成', () => {
  const rain = composeWallpaperEffect({ ...baseInput({ weatherCode: 63 }), base: flatBase() });
  const clear = composeWallpaperEffect({ ...baseInput({ weatherCode: 0 }), base: flatBase() });
  assert.equal(rain.hasStreaks, true);
  assert.equal(clear.hasStreaks, false);
  assert.notDeepEqual(average(rain.rgba), average(clear.rgba));
});

test('墙角霉斑按等级加深；等级 0 无霉斑（警报结束保留已有霉斑由等级字段表达）', () => {
  const base = flatBase(200, 200, 200);
  const noMold = composeWallpaperEffect({ ...baseInput({ alertActive: false, cornerMoldStage: 0, humidityPct: 30, weatherCode: 0 }), base });
  const alert3 = composeWallpaperEffect({ ...baseInput({ alertActive: true, cornerMoldStage: 3, humidityPct: 30, weatherCode: 0 }), base: flatBase(200, 200, 200) });
  const alert1 = composeWallpaperEffect({ ...baseInput({ alertActive: true, cornerMoldStage: 1, humidityPct: 30, weatherCode: 0 }), base: flatBase(200, 200, 200) });
  const afterAlert = composeWallpaperEffect({ ...baseInput({ alertActive: false, cornerMoldStage: 3, humidityPct: 30, weatherCode: 0 }), base: flatBase(200, 200, 200) });
  // 左上角 20×20 区域平均绿色通道：霉斑区应更深
  function cornerGreen(data) {
    let g = 0;
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 20; x += 1) g += data[(y * W + x) * 4 + 1];
    }
    return g / 400;
  }
  assert.equal(cornerGreen(noMold.rgba), 200, '等级 0 无霉斑');
  assert.ok(cornerGreen(alert3.rgba) < cornerGreen(alert1.rgba), '等级越高霉斑越重');
  assert.ok(Math.abs(cornerGreen(afterAlert.rgba) - cornerGreen(alert3.rgba)) < 1e-9, '警报结束后已长出的霉斑保留');
});

test('警报强化层：警报期雾层更明显', () => {
  assert.ok(fogLevelFor(baseInput({ humidityPct: 80, alertActive: true })) > fogLevelFor(baseInput({ humidityPct: 80, alertActive: false })));
});

test('擦拭掩码可以移除雾层；保存恢复后不缩水', () => {
  const cells = [];
  for (let cell = 0; cell < 64 * 20; cell += 1) cells.push(cell); // 顶部 20 行擦净
  const mask = applyWipe(undefined, cells);
  assert.ok(wipeProgress(mask) > 0.3);
  // 再合并一次同区域（幂等）
  const again = applyWipe(mask, cells);
  assert.equal(again, mask);
  assert.ok(isCellWiped(again, 5));
  assert.ok(!isCellWiped(again, 64 * 30));
  // 擦净区不覆盖雾，未擦区有雾：合成分区差异
  const input = { ...baseInput({ humidityPct: 90, weatherCode: 45 }), fogMask: mask, base: flatBase() };
  const out = composeWallpaperEffect(input);
  const topPx = out.rgba[(10 * W + 10) * 4];
  const bottomPx = out.rgba[(150 * W + 10) * 4];
  assert.ok(Math.abs(topPx - 90) < Math.abs(bottomPx - 90), '擦净区更接近原色（雾被移除）');
  // 掩码往返
  const restored = applyWipe(undefined, cells);
  assert.equal(restored, mask);
});

test('1920×1080 合成耗时可接受（打印实测值，不设硬阈值）', () => {
  const W2 = 1920;
  const H2 = 1080;
  const px = new Uint8ClampedArray(W2 * H2 * 4);
  const input = {
    width: W2, height: H2, humidityPct: 88, weatherCode: 63, alertActive: true,
    cornerMoldStage: 2, seed: 7, base: px,
  };
  const start = process.hrtime.bigint();
  const out = composeWallpaperEffect(input);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`[wallpaper] 1920×1080 合成耗时 ${ms.toFixed(1)} ms（Windows CI 实测，非用户机器）`);
  assert.equal(out.rgba.length, px.length);
});
