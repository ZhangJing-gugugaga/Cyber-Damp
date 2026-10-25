/** 单命令内完成：启动(独立存活)→轮询胶囊可见→内容渲染→护理台首反馈→闲置CPU */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.argv[2] || '9227';
const dataDir = path.join(ROOT, 'logs', 'uat-perf-data3');
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

const check = fs.readFileSync(path.join(ROOT, 'logs', 'capsule-check.ps1'), 'utf8');
const isCapsuleVisible = () => {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', check], { timeout: 5000 }).toString().includes('visible=True');
  } catch { return false; }
};

const t0 = Date.now();
// detached + unref：命令结束后应用继续存活（此前进程树被清理导致测量窗口死亡）
const child = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ['.', `--remote-debugging-port=${PORT}`],
  {
    cwd: ROOT, detached: true, stdio: 'ignore',
    env: { ...process.env, CD_UAT: '1', CD_UAT_DATA_DIR: dataDir, CD_NATIVE_PROBE_DIR: 'E:\\Desktop\\__none__' },
  });
child.unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = (target, expr) => {
  try {
    return execFileSync('node.exe', [path.join(ROOT, 'scripts', 'cdp-any.cjs'), PORT, target, expr], { timeout: 8000 }).toString();
  } catch (e) { return 'ERR'; }
};

(async () => {
  let visibleAt = -1;
  while (Date.now() - t0 < 25000) {
    if (isCapsuleVisible()) { visibleAt = Date.now() - t0; break; }
    await sleep(200);
  }
  console.log(`capsuleVisibleMs=${visibleAt}`);
  let contentAt = -1;
  while (Date.now() - t0 < 35000) {
    const out = cdp('capsule', "document.getElementById('metrics').textContent");
    if (/\d/.test(out) && !out.includes('--') && !out.includes('ERR')) { contentAt = Date.now() - t0; break; }
    await sleep(150);
  }
  console.log(`capsuleContentMs=${contentAt}`);
  console.log('capsuleMetrics=' + cdp('capsule', "document.getElementById('metrics').textContent + ' | ' + document.getElementById('place').textContent").trim());

  execFileSync('node.exe', [path.join(ROOT, 'scripts', 'cdp-open-care.cjs'), PORT], { timeout: 15000, stdio: 'ignore' });
  const openAt = Date.now();
  let feedbackAt = -1;
  while (Date.now() - openAt < 15000) {
    const out = cdp('care', "!!document.getElementById('boot-splash')");
    if (out.includes('false')) { feedbackAt = Date.now() - openAt; break; }
    await sleep(50);
  }
  console.log(`careFirstFeedbackMs=${feedbackAt}`);

  // 闲置 CPU：护理台隐藏，仅胶囊常驻
  cdp('care', "window.damp.management.command({action:'window-close'})");
  await sleep(2000);
  const cpu1 = sumCpu();
  await sleep(20000);
  const procs = countProcs();
  const cpu2 = sumCpu();
  console.log(`idleCpuSecondsPer20s=${(cpu2 - cpu1).toFixed(2)} procs=${procs}`);
  console.log('NOTE app left running for further inspection');
  process.exit(0);
})();

function sumCpu() {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      '(Get-Process electron -ErrorAction SilentlyContinue | Measure-Object CPU -Sum).Sum'], { timeout: 8000 }).toString().trim();
    return Number(out || 0);
  } catch { return 0; }
}
function countProcs() {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command',
      '(Get-Process electron -ErrorAction SilentlyContinue | Measure-Object).Count'], { timeout: 8000 }).toString().trim();
  } catch { return '?'; }
}
