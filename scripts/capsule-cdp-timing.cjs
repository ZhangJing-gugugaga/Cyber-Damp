/** 胶囊启动时序（CDP 侧）：进程启动→页面目标出现→load 事件（≈showInactive 时点）→内容渲染 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.argv[2] || '9228';
const dataDir = path.join(ROOT, 'logs', 'uat-perf-data4');
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

const t0 = Date.now();
const child = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ['.', `--remote-debugging-port=${PORT}`],
  {
    cwd: ROOT, detached: true, stdio: 'ignore',
    env: { ...process.env, CD_UAT: '1', CD_UAT_DATA_DIR: dataDir, CD_NATIVE_PROBE_DIR: 'E:\\Desktop\\__none__' },
  });
child.unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listTargets = () => {
  try {
    return JSON.parse(execFileSync('curl.exe', ['-s', `http://127.0.0.1:${PORT}/json/list`], { timeout: 4000 }).toString());
  } catch { return []; }
};
const cdp = (target, expr) => {
  try {
    return execFileSync('node.exe', [path.join(ROOT, 'scripts', 'cdp-any.cjs'), PORT, target, expr], { timeout: 8000 }).toString().trim();
  } catch { return 'ERR'; }
};

(async () => {
  let targetAt = -1;
  let loadAt = -1;
  let contentAt = -1;
  while (Date.now() - t0 < 30000 && (contentAt < 0 || loadAt < 0)) {
    if (targetAt < 0) {
      const list = listTargets();
      if (list.some((t) => t.url && t.url.includes('capsule'))) targetAt = Date.now() - t0;
    }
    if (targetAt >= 0) {
      const out = cdp('capsule', "performance.getEntriesByType('navigation').map(e=>Math.round(e.responseEnd)).join(',') + '||' + document.getElementById('metrics').textContent");
      const [nav, metrics] = out.split('||');
      if (loadAt < 0 && nav && /^\d/.test(nav)) loadAt = Date.now() - t0;
      if (contentAt < 0 && /\d/.test(metrics) && !metrics.includes('--')) contentAt = Date.now() - t0;
    }
    await sleep(100);
  }
  console.log(`capsuleTargetMs=${targetAt}`);
  console.log(`capsuleReadyMs=${loadAt}`);
  console.log(`capsuleContentMs=${contentAt}`);
  console.log('capsuleMetrics=' + cdp('capsule', "document.getElementById('metrics').textContent"));
  process.exit(0);
})();
