import { spawnSync } from 'node:child_process';

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json']);
run(['--test', '--test-concurrency=2',
  'scripts/test-desktop-ini.mjs', 'scripts/test-shell-icons.mjs', 'scripts/test-desktop-viewport.mjs',
  'scripts/test-weather-validate.mjs', 'scripts/test-weather-rank.mjs', 'scripts/test-native-events.mjs',
  'scripts/test-save-migration.mjs', 'scripts/test-native-care.mjs', 'scripts/test-material-effects.mjs',
  'scripts/test-native-scheduler.mjs', 'scripts/test-native-product.mjs', 'scripts/test-care-mask.mjs',
  'scripts/test-object-category.mjs',
  'scripts/test-species-roll.mjs', 'scripts/test-care-layers.mjs', 'scripts/test-care-tools.mjs',
  'scripts/test-spores.mjs', 'scripts/test-mold-spread.mjs', 'scripts/test-damp-alert.mjs',
  'scripts/test-wallpaper-effects.mjs', 'scripts/test-daily-v4.mjs', 'scripts/test-daily-cycle.mjs', 'scripts/test-species-assets.mjs']);
