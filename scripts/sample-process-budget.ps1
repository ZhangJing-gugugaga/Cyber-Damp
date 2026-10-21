param(
  [Parameter(Mandatory=$true)][int]$RootProcessId,
  [int]$Seconds = 300,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$logical = [Environment]::ProcessorCount
$known = [System.Collections.Generic.HashSet[int]]::new()
$null = $known.Add($RootProcessId)
$previousCpu = @{}
$clock = [Diagnostics.Stopwatch]::StartNew()
$lastElapsed = 0.0
$metadata = @{rootProcessId=$RootProcessId;seconds=$Seconds;logicalProcessors=$logical;startedAt=(Get-Date -Format o);intervalSeconds=1;cpuMethod='sum process CPU deltas / elapsed seconds / logical processors * 100';scope='root plus recursively discovered children; no frame-time claim'}
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'metadata.json') -Encoding utf8
$output = [IO.StreamWriter]::new((Join-Path $OutputDirectory 'processes.jsonl'), $false, [Text.UTF8Encoding]::new($false))
try {
  while ($clock.Elapsed.TotalSeconds -lt $Seconds) {
    $tree = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
    do {
      $added = $false
      foreach ($entry in $tree) {
        if ($known.Contains([int]$entry.ParentProcessId) -and $known.Add([int]$entry.ProcessId)) { $added = $true }
      }
    } while ($added)
    $elapsed = $clock.Elapsed.TotalSeconds
    $interval = $elapsed - $lastElapsed
    $records = @()
    $cpuTotal = 0.0
    foreach ($processIdValue in @($known)) {
      $proc = Get-Process -Id $processIdValue -ErrorAction SilentlyContinue
      if (-not $proc) { continue }
      $cpu = $proc.TotalProcessorTime.TotalSeconds
      $cpuDelta = if ($previousCpu.ContainsKey($processIdValue)) { [Math]::Max(0, $cpu - $previousCpu[$processIdValue]) } else { 0 }
      $previousCpu[$processIdValue] = $cpu
      $cpuTotal += $cpuDelta
      $records += @{pid=$processIdValue;cpuSeconds=$cpu;workingSetBytes=$proc.WorkingSet64;privateBytes=$proc.PrivateMemorySize64}
    }
    $record = @{at=(Get-Date -Format o);elapsedSeconds=$elapsed;intervalSeconds=$interval;cpuPercent=($cpuTotal / $interval / $logical * 100);processes=$records;firstSample=($lastElapsed -eq 0)}
    $output.WriteLine(($record | ConvertTo-Json -Depth 5 -Compress))
    $output.Flush()
    $lastElapsed = $elapsed
    if ($records.Count -eq 0) { throw 'All observed product processes exited before sampling completed' }
    Start-Sleep -Milliseconds 1000
  }
} finally { $output.Dispose() }
Write-Output "Saved process samples to $OutputDirectory; frame evidence must be collected separately."
