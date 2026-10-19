import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { wallpaperLayout } = createRequire(import.meta.url)('../dist/test/shared/wallpaper-layout.js');
const base = { imageWidth: 1920, imageHeight: 1200, monitor: { left: 0, top: 0, width: 1920, height: 1080 },
  virtualDesktop: { left: 0, top: 0, width: 1920, height: 1080 } };
test('fill crops the system wallpaper vertically without stretching its aspect ratio', () => {
  assert.deepEqual(wallpaperLayout({ ...base, position: 'fill' }), { left: 0, top: -60, width: 1920, height: 1200, tile: false });
});
test('fit preserves the full image and leaves the correct background-colored borders', () => {
  assert.deepEqual(wallpaperLayout({ ...base, position: 'fit' }), { left: 96, top: 0, width: 1728, height: 1080, tile: false });
});
test('center retains image pixels rather than expanding a small wallpaper', () => {
  assert.deepEqual(wallpaperLayout({ ...base, position: 'center', imageWidth: 100, imageHeight: 100 }),
    { left: 910, top: 490, width: 100, height: 100, tile: false });
});
test('tile starts at the monitor origin and retains the physical tile size', () => {
  assert.deepEqual(wallpaperLayout({ ...base, position: 'tile', imageWidth: 100, imageHeight: 100 }),
    { left: 0, top: 0, width: 100, height: 100, tile: true });
});
test('stretch covers the monitor independently of the source aspect ratio', () => {
  assert.deepEqual(wallpaperLayout({ ...base, position: 'stretch' }), { ...base.monitor, tile: false });
});
test('span uses the complete virtual desktop including a monitor left of primary', () => {
  assert.deepEqual(wallpaperLayout({ ...base, position: 'span', virtualDesktop: { left: -1920, top: 0, width: 3840, height: 1080 } }),
    { left: -1920, top: -660, width: 3840, height: 2400, tile: false });
});
