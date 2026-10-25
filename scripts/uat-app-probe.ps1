# 应用层 UAT 探针对象创建/清理（真实桌面 E:\Desktop；仅限本探针自建对象）
# 用法: uat-app-probe.ps1 -Mode create|remove -Stamp <id>
param(
  [string]$Mode = 'create',
  [string]$Stamp = ''
)
$ErrorActionPreference = 'Stop'
$dir = "E:\Desktop\CD-AppProbe-$Stamp"
$lnk = "$dir.lnk"
if ($Mode -eq 'create') {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $ini = "[.ShellClassInfo]`r`nLocalizedResourceName=应用层探针`r`n"
  [System.IO.File]::WriteAllText("$dir\desktop.ini", $ini)
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($lnk)
  $s.TargetPath = $dir
  $s.Description = 'CD app probe'
  $s.Save()
  Write-Output "created|$dir|$lnk"
} elseif ($Mode -eq 'check') {
  $iniBytes = [System.IO.File]::ReadAllBytes("$dir\desktop.ini")
  $lnkIcon = ''
  try { $ws = New-Object -ComObject WScript.Shell; $lnkIcon = $ws.CreateShortcut($lnk).IconLocation } catch {}
  $hasIconResource = (Select-String -Path "$dir\desktop.ini" -Pattern 'IconResource' -SimpleMatch -Quiet) -eq $true
  # desktop.ini 可能是 UTF-16（恢复/我们写入后），Select-String 能处理 BOM；无 IconResource 即恢复原状
  Write-Output "iniBytes=$($iniBytes.Length) hasIconResource=$hasIconResource lnkIcon=$lnkIcon"
} else {
  Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $lnk -Force -ErrorAction SilentlyContinue
  Write-Output "removed"
}
