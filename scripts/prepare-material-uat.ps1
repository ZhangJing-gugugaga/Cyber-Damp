param([switch]$Cleanup, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidenceRoot = Join-Path $projectRoot 'logs\material-uat'
$manifestPath = Join-Path $evidenceRoot 'fixtures.json'
$desktopRoot = [IO.Path]::GetFullPath([Environment]::GetFolderPath('Desktop'))
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

if ($Cleanup) {
    if (!(Test-Path -LiteralPath $manifestPath)) { throw 'No fixture manifest exists.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($item in $manifest.items) {
        $target = [IO.Path]::GetFullPath($item.path)
        if ([IO.Path]::GetDirectoryName($target) -ne $desktopRoot) { throw "Fixture outside Desktop: $target" }
        if (!(Test-Path -LiteralPath $target)) { continue }
        if ($item.kind -eq 'file') {
            if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $item.sha256) { throw "Fixture changed; preserved: $target" }
        } elseif (@(Get-ChildItem -LiteralPath $target -Force).Count -ne 0) { throw "Folder no longer empty; preserved: $target" }
        Remove-Item -LiteralPath $target
    }
    $manifest | Add-Member -NotePropertyName cleanedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('O')) -Force
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Output 'Only unchanged generated fixtures were removed.'
    exit
}

if (Test-Path -LiteralPath $manifestPath) {
    $old = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (!$old.cleanedAt) { throw 'Previous fixture run has not been cleaned up.' }
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $evidenceRoot "fixtures-$($old.run)-cleaned.json")
}

$tag = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$paper = Join-Path $desktopRoot "Cyber Damp UAT-$tag-paper.txt"
$dry = Join-Path $desktopRoot "Cyber Damp UAT-$tag-parchment.txt"
$text = "Temporary Cyber Damp native UAT fixture. Generated run $tag. No user document content."
$items = @()
foreach ($file in @($paper, $dry)) {
    $stream = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($text)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
    [IO.File]::SetLastWriteTimeUtc($file, [DateTime]::UtcNow.AddDays(-45))
    $items += @{ path = $file; kind = 'file'; sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash }
}
$folderStem = -join ([char[]]@(0x65b0, 0x5efa, 0x6587, 0x4ef6, 0x5939))
$folderName = $folderStem
$number = 2
while (Test-Path -LiteralPath (Join-Path $desktopRoot $folderName)) {
    $folderName = "$folderStem ($number)"
    $number++
}
$folder = Join-Path $desktopRoot $folderName
New-Item -ItemType Directory -Path $folder | Out-Null
[IO.Directory]::SetLastWriteTimeUtc($folder, [DateTime]::UtcNow.AddDays(-45))
$items += @{ path = $folder; kind = 'dir' }
$dataRoot = Join-Path $evidenceRoot "save-$tag"
New-Item -ItemType Directory -Path $dataRoot | Out-Null
@{ run = $tag; desktop = $desktopRoot; userData = $dataRoot; paper = [IO.Path]::GetFileName($paper); dry = [IO.Path]::GetFileName($dry); folder = $folderName; items = $items } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
$env:CD_UAT = '1'
$env:CD_UAT_DATA_DIR = $dataRoot
if (!$NoLaunch) {
    Start-Process -FilePath (Join-Path $projectRoot 'node_modules\electron\dist\electron.exe') -ArgumentList '--remote-debugging-port=9222', '.' -WindowStyle Hidden -WorkingDirectory $projectRoot -RedirectStandardOutput (Join-Path $evidenceRoot 'app.out.log') -RedirectStandardError (Join-Path $evidenceRoot 'app.err.log')
}
Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
