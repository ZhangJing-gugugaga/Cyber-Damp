param([switch]$Cleanup)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidenceRoot = Join-Path $projectRoot 'logs\rope-uat'
$manifestPath = Join-Path $evidenceRoot 'fixtures.json'
$desktopRoot = [IO.Path]::GetFullPath([Environment]::GetFolderPath('Desktop'))
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

if ($Cleanup) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $ownedFolder = [IO.Path]::GetFullPath($manifest.folder)
    if ([IO.Path]::GetDirectoryName($ownedFolder) -ne $desktopRoot -or [IO.Path]::GetFileName($ownedFolder) -ne "CDR-$($manifest.run)-heavy") { throw 'Invalid owned folder anchor' }
    if ((Test-Path -LiteralPath $ownedFolder) -and ((Get-Item -LiteralPath $ownedFolder).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse folder preserved before touching children' }
    foreach ($item in $manifest.items | Where-Object {$_.kind -eq 'file'}) {
        $target = [IO.Path]::GetFullPath($item.path)
        if ([IO.Path]::GetDirectoryName($target) -notin @($desktopRoot,$ownedFolder)) { throw "Outside owned locations: $target" }
        if (!(Test-Path -LiteralPath $target)) { continue }
        if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse fixture preserved: $target" }
        if (!$item.sha256 -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $item.sha256) { throw "Changed fixture preserved: $target" }
    }
    # Delete only exact verified files, then the exact verified empty directory.
    foreach ($item in $manifest.items | Where-Object {$_.kind -eq 'file'}) {
        if (Test-Path -LiteralPath $item.path) { Remove-Item -LiteralPath $item.path }
    }
    if (Test-Path -LiteralPath $ownedFolder) {
        if ((Get-Item -LiteralPath $ownedFolder).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse folder preserved' }
        if (@(Get-ChildItem -LiteralPath $ownedFolder -Force).Count -ne 0) { throw 'Nonempty folder preserved' }
        Remove-Item -LiteralPath $ownedFolder
    }
    $manifest | Add-Member -NotePropertyName cleanedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('O')) -Force
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-Output 'Only checksum-owned rope fixtures and their empty folder were removed.'
    exit
}

if (Test-Path -LiteralPath $manifestPath) {
    $old = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (!$old.cleanedAt) { throw 'Previous rope fixtures must be cleaned first' }
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $evidenceRoot "fixtures-$($old.run)-cleaned.json")
}
$tag = [Guid]::NewGuid().ToString('N').Substring(0,6)
$folder = Join-Path $desktopRoot "CDR-$tag-heavy"
New-Item -ItemType Directory -Path $folder | Out-Null
$dataRoot = Join-Path $evidenceRoot "save-$tag"
New-Item -ItemType Directory -Path $dataRoot | Out-Null
$manifest = @{run=$tag; desktop=$desktopRoot; folder=$folder; userData=$dataRoot; items=@()}
$specs = @(
    @{path=(Join-Path $desktopRoot "CDR-$tag-light.txt"); bytes=3072},
    @{path=(Join-Path $desktopRoot "CDR-$tag-small.txt"); bytes=2048},
    @{path=(Join-Path $folder 'owned-payload.bin'); bytes=[long][Math]::Ceiling(4.2 * 1GB)},
    @{path=(Join-Path $desktopRoot "CDR-$tag-extra.bin"); bytes=[long]1GB}
)
foreach ($spec in $specs) {
    $stream = [IO.File]::Open($spec.path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try {
        $marker = [Text.Encoding]::UTF8.GetBytes("Cyber Damp owned rope UAT $tag. No user content.")
        $stream.Write($marker,0,$marker.Length)
    } finally { $stream.Dispose() }
    $manifest.items += @{path=$spec.path; kind='file'; bytes=$spec.bytes; sha256=$null}
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    if ($spec.bytes -gt 1MB) {
        & fsutil sparse setflag $spec.path | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Unable to create sparse fixture' }
    }
    $stream = [IO.File]::Open($spec.path,[IO.FileMode]::Open,[IO.FileAccess]::Write)
    try { $stream.SetLength($spec.bytes) } finally { $stream.Dispose() }
    $manifest.items[-1].sha256 = (Get-FileHash -LiteralPath $spec.path -Algorithm SHA256).Hash
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}
$manifest.ready = $true
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
