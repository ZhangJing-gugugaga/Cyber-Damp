/** A24 闲置网络采样：应用闲置（护理台隐藏、仅胶囊）期间 electron 进程的对外 TCP 连接数 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.argv[2] || '9233';
const dataDir = path.join(ROOT, 'logs', 'uat-net-data');
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

const child = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ['.', `--remote-debugging-port=${PORT}`],
  {
    cwd: ROOT, detached: true, stdio: 'ignore',
    env: { ...process.env, CD_UAT: '1', CD_UAT_DATA_DIR: dataDir, CD_NATIVE_PROBE_DIR: 'E:\\Desktop\\__none__' },
  });
child.unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const netSample = () => {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', `
$pids = (Get-Process electron -ErrorAction SilentlyContinue).Id
if (-not $pids) { Write-Output 'no-proc'; exit }
$conns = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess -and $_.RemoteAddress -notmatch '^(127\\.|::1|0\\.0\\.0\\.0)$' }
Write-Output ($conns.Count)`], { timeout: 8000 }).toString().trim();
  } catch { return 'err'; }
};

(async () => {
  // 等启动+首次天气取数完成，再进入闲置窗口
  await sleep(45000);
  const t = [];
  for (let i = 0; i < 6; i += 1) {
    t.push(netSample());
    await sleep(15000);
  }
  console.log(`idleEstablishedRemoteSamples=[${t.join(', ')}] over ~90s (t+45s..t+135s)`);
  process.exit(0);
})();
