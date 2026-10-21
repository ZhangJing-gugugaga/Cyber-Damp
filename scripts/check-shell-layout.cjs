// Native read-only regression: worker queries must preserve Explorer geometry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { queryShellLayout } = require('../dist/main/desktop/shell-layout');
(async () => {
  const baseline = await queryShellLayout();
  assert.equal(baseline.view.items.length, baseline.rects.items.length);
  for (const [i, item] of baseline.view.items.entries()) {
    assert.ok(item.parsingName.length > 0 && item.displayName.length > 0, `Missing Shell identity ${i}`);
    assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y));
    assert.ok(baseline.rects.items[i].icon.width > 0 && baseline.rects.items[i].icon.height > 0);
  }
  const timings = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const result = await queryShellLayout();
    timings.push(performance.now() - start);
    assert.deepEqual(result, baseline, 'Explorer geometry or view identity changed during query');
  }
  const report = { pass: true, queries: 11, count: baseline.view.items.length,
    shellIconSize: baseline.view.iconSize, dpi: baseline.rects.dpi, timingsMs: timings,
    limits: 'Current machine only. Does not prove rendered alignment, other DPI configurations or RPC-failure recovery.' };
  fs.mkdirSync('logs/mildew-native/layout', { recursive: true });
  fs.writeFileSync('logs/mildew-native/layout/query-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
