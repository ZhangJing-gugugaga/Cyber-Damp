// Promote the existing 0.1.10 hash comparison into a repeatable package check.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const expected = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const archive = 'release/win-unpacked/resources/app.asar';
const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
const checked = ['renderer', 'main', 'preload', 'shared'].flatMap(dir => files(path.join('dist', dir)));
const mismatches = checked.filter(file => hash(asar.extractFile(archive, path.normalize(file))) !== hash(fs.readFileSync(file)));
const researchAssets = asar.listPackage(archive).filter(file => file.includes('mildew-lifecycle') || file.endsWith('effects.html') || file.endsWith('specials.html') ||
  /pvz-original-reference|ScaredyShroom\.gif|DoomShroom\.gif|Shovel\.gif|shovel-first-frame\.png/i.test(file));
const executable = path.resolve(`release/Cyber Damp ${expected}.exe`);
const result = { scope: 'package-resource-consistency-not-native-uat', expected, version: packaged.version,
  checkedFiles: checked.length, mismatches, researchAssets, executable, bytes: fs.statSync(executable).size,
  sha256: hash(fs.readFileSync(executable)) };
const output = path.resolve(process.argv[2] ?? `logs/experience-${expected}`); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'packaged-resources.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (mismatches.length || researchAssets.length || packaged.version !== expected) process.exitCode = 1;
