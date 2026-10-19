// Compare built renderer and desktop boundary code against the actual packaged ASAR.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const asar = createRequire(import.meta.url)('@electron/asar');
const files = [...fs.readdirSync('dist/renderer/assets').map(name => 'dist/renderer/assets/' + name),
  'dist/renderer/index.html', 'dist/main/index.js', 'dist/main/native/win32-icon-list.js',
  'dist/main/native/win32-wallpaper.js', 'dist/main/ipc/register-handlers.js', 'dist/preload/index.js'];
const results = files.map(file => ({ file, identical: asar.extractFile('release/win-unpacked/resources/app.asar',
  path.normalize(file)).equals(fs.readFileSync(file)) }));
const output = process.argv[2] ?? 'logs/ripple-uat/packaged-assets.json';
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ count: results.length, allIdentical: results.every(r => r.identical), output }));
if (results.some(r => !r.identical)) process.exitCode = 1;
