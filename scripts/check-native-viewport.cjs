// Read-only geometry integration on this machine. Never hides icons or attaches a desktop host.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  const { unionScreenRects } = require('../dist/shared/desktop-viewport');
  const { fitOverlayScreenRect, overlayScreenRect } = require('../dist/main/native/win32-desktop');
  const { scanNativeDesktop } = require('../dist/main/desktop/native-desktop-scan');
  const { queryShellLayout } = require('../dist/main/desktop/shell-layout');
  const win = new BrowserWindow({ show: false, transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const physical = unionScreenRects(screen.getAllDisplays().map(display => screen.dipToScreenRect(null, display.workArea)));
  assert.equal(fitOverlayScreenRect(win, physical), true);
  await win.loadURL('about:blank');
  const viewport = await win.webContents.executeJavaScript('({scaleFactor:devicePixelRatio,width:innerWidth,height:innerHeight})');
  const bounds = overlayScreenRect(win); assert.ok(bounds);
  console.log(JSON.stringify({ viewport, physical, bounds }));
  assert.ok(Math.abs(bounds.width - viewport.width * viewport.scaleFactor) <= 2);
  assert.ok(Math.abs(bounds.height - viewport.height * viewport.scaleFactor) <= 2);
  const entries = await scanNativeDesktop(win, viewport.scaleFactor), layout = await queryShellLayout();
  assert.equal(entries.length, layout.view.items.length);
  const rows = entries.map((entry, i) => {
    const rect = layout.rects.items[i].icon, geometry = entry.geometry;
    const nativeSize = geometry.size * viewport.scaleFactor;
    const expectedX = rect.x + (rect.width - nativeSize) / 2, expectedY = rect.y + rect.height - nativeSize;
    const error = Math.max(Math.abs(geometry.x * viewport.scaleFactor + bounds.x - expectedX), Math.abs(geometry.y * viewport.scaleFactor + bounds.y - expectedY));
    assert.ok(error < .001);
    return { index: i, iconDip: geometry.size, nativeSize, labelScale: geometry.labelScale, error };
  });
  const result = { scope: 'hidden-unattached-window-projection-only', pass: true, displays: screen.getAllDisplays().map(display => ({ bounds: display.bounds, scaleFactor: display.scaleFactor })), viewport, physical, count: entries.length, rows };
  fs.mkdirSync('logs/viewport-review-20261021', { recursive: true });
  fs.writeFileSync('logs/viewport-review-20261021/native-projection.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ scope: result.scope, pass: true, displays: result.displays.length, viewport, count: entries.length, maxError: Math.max(...rows.map(row => row.error)) }));
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
