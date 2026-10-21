import { spawnSync } from 'node:child_process';

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json']);
run(['--test', 'scripts/test-world.mjs', 'scripts/test-special-mushrooms.mjs', 'scripts/test-pigment.mjs',
  'scripts/test-falling.mjs', 'scripts/check-shared.mjs', 'scripts/test-folder-size.mjs', 'scripts/test-microphone-wind.mjs',
  'scripts/test-wallpaper-layout.mjs', 'scripts/test-desktop-pointer.mjs', 'scripts/test-rooted-mushroom.mjs', 'scripts/test-management.mjs', 'scripts/test-desktop-viewport.mjs', 'scripts/test-viewport-ipc.mjs']);
