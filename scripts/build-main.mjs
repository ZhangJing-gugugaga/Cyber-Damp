import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// tsc does not remove JavaScript emitted for deleted sources. Clear only its
// known output trees so a later installer cannot include the retired engine.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
for (const name of ['main', 'preload', 'shared', 'world', 'test', 'rope-check']) {
  const target = path.resolve(output, name);
  if (path.dirname(target) !== output) throw new Error('Invalid build output path');
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Linked build output refused');
  if (!fs.existsSync(target)) continue;
  if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Linked build subtree refused');
  fs.rmSync(target, { recursive: true });
}
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.main.json'],
  { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
