param([switch]$Native)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
$nodeVersion = (Get-Content (Join-Path $projectRoot '.node-version') -Raw).Trim()
$nodeExecutable = Join-Path $toolRoot 'node/node.exe'
$localNodeVersion = if (Test-Path -LiteralPath $nodeExecutable) { try { & $nodeExecutable --version 2>$null } catch { '' } } else { '' }
if ($localNodeVersion -ne "v$nodeVersion") {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (!(Test-Path -LiteralPath (Join-Path $toolRoot 'node')) -and $nodeCommand -and ((& $nodeCommand.Source --version) -eq "v$nodeVersion")) {
        $nodeExecutable = $nodeCommand.Source
    } else {
        if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This bootstrap supports Windows x64. Install the matching official Node 24 distribution on other architectures.' }
        $archiveName = "node-v$nodeVersion-win-x64.zip"
        $downloadUrl = "https://nodejs.org/dist/v$nodeVersion"
        $nodeStaging = Join-Path $toolRoot ("node-install-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $nodeStaging | Out-Null
        try {
            $archivePath = Join-Path $nodeStaging $archiveName
            Write-Host "Downloading Node $nodeVersion to .tools (no machine configuration changes)"
            Invoke-WebRequest "$downloadUrl/$archiveName" -UseBasicParsing -OutFile $archivePath
            $checksums = (Invoke-WebRequest "$downloadUrl/SHASUMS256.txt" -UseBasicParsing).Content
            $expected = (($checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $archiveName") }) -split '\s+')[0]
            if (!$expected -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node download checksum mismatch' }
            Expand-Archive -LiteralPath $archivePath -DestinationPath $nodeStaging -Force
            $newNode = Join-Path $nodeStaging "node-v$nodeVersion-win-x64"
            if ((& (Join-Path $newNode 'node.exe') --version) -ne "v$nodeVersion" -or $LASTEXITCODE -ne 0) { throw 'Node version validation failed' }
            if (Test-Path -LiteralPath (Join-Path $toolRoot 'node')) { Remove-Item -LiteralPath (Join-Path $toolRoot 'node') -Recurse -Force }
            Move-Item -LiteralPath $newNode -Destination (Join-Path $toolRoot 'node')
        } finally { Remove-Item -LiteralPath $nodeStaging -Recurse -Force }
    }
}
$env:PATH = "$(Split-Path -Parent $nodeExecutable);$env:PATH"
$manager = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).packageManager
if ($manager -notmatch '^pnpm@10\.\d+\.\d+$') { throw 'packageManager must pin pnpm 10 to an exact version' }
$pnpmVersion = $manager.Substring(5)
$pnpmEntry = Join-Path $toolRoot 'pnpm/node_modules/pnpm/bin/pnpm.cjs'
$installedPnpm = if (Test-Path -LiteralPath $pnpmEntry) { try { & $nodeExecutable $pnpmEntry --version 2>$null } catch { '' } } else { '' }
if ($installedPnpm -ne $pnpmVersion) {
    & (Join-Path (Split-Path -Parent $nodeExecutable) 'npm.cmd') install --prefix (Join-Path $toolRoot 'pnpm') $manager --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'pnpm installation failed' }
}
if ((& $nodeExecutable $pnpmEntry --version) -ne $pnpmVersion -or $LASTEXITCODE -ne 0) { throw 'pnpm version validation failed' }
Push-Location $projectRoot
try {
    & $nodeExecutable $pnpmEntry install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency sync failed' }
    & $nodeExecutable (Join-Path $PSScriptRoot 'setup-bun.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Bun installation failed' }
    & $nodeExecutable (Join-Path $PSScriptRoot 'setup-rust.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Rust installation failed' }
    if ($Native) {
        & $nodeExecutable (Join-Path $PSScriptRoot 'doctor.mjs') --native
        if ($LASTEXITCODE -ne 0) { throw 'Native prerequisites are incomplete; follow docs/development.md' }
    }
    Write-Host 'Ready. Run: powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 dev'
} finally { Pop-Location }
