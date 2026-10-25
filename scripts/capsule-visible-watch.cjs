/** 胶囊启动可见性时序观察：启动后轮询窗口可见性，输出首次可见耗时 */
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.argv[2] || '9226';

const visibleCheck = `
Add-Type 'using System;using System.Runtime.InteropServices;using System.Text;
public class W {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}'
$title = [string]::Join('', [char]0x56de,[char]0x5357,[char]0x5929,[char]0x5929,[char]0x6c14,[char]0x80f6,[char]0x56de)
$found = 0
$cb = {
  param($h, $l)
  $sb = New-Object System.Text.StringBuilder 256
  [void][W]::GetWindowText($h, $sb, 256)
  if ($sb.ToString() -eq $title -and [W]::IsWindowVisible($h)) { $script:found = 1 }
  return $true
}
[W]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Output $found
`;

const dataDir = path.join(ROOT, 'logs', 'uat-perf-data2');
require('node:fs').mkdirSync(dataDir, { recursive: true });

const t0 = Date.now();
const child = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ['.', `--remote-debugging-port=${PORT}`],
  {
    cwd: ROOT, detached: false, stdio: 'ignore',
    env: { ...process.env, CD_UAT: '1', CD_UAT_DATA_DIR: dataDir, CD_NATIVE_PROBE_DIR: 'E:\\Desktop\\__none__' },
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let visibleAt = -1;
  while (Date.now() - t0 < 20000) {
    try {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', visibleCheck], { timeout: 5000 }).toString().trim();
      if (out.includes('1')) { visibleAt = Date.now() - t0; break; }
    } catch { /* poll error */ }
    await sleep(250);
  }
  console.log(`capsuleVisibleMs=${visibleAt}`);
  // 胶囊内容渲染
  let contentAt = -1;
  while (Date.now() - t0 < 30000) {
    try {
      const out = execFileSync('node.exe', [path.join(ROOT, 'scripts', 'cdp-any.cjs'), PORT, 'capsule',
        "document.getElementById('metrics').textContent"], { timeout: 5000 }).toString();
      if (/\d/.test(out) && !out.includes('--')) { contentAt = Date.now() - t0; break; }
    } catch { /* not ready */ }
    await sleep(150);
  }
  console.log(`capsuleContentMs=${contentAt}`);
  process.exit(0);
})();
