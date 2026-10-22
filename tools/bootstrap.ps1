param([switch]$SkipReference, [switch]$Native)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
$nodeVersion = (Get-Content (Join-Path $projectRoot '.node-version') -Raw).Trim()
$nodeExecutable = Join-Path $toolRoot 'node/node.exe'
if (!(Test-Path -LiteralPath $nodeExecutable)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand -and ((& $nodeCommand.Source --version) -eq "v$nodeVersion")) {
        $nodeExecutable = $nodeCommand.Source
    } else {
        if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This bootstrap supports Windows x64. Install the matching official Node 24 distribution on other architectures.' }
        $archiveName = "node-v$nodeVersion-win-x64.zip"
        $downloadUrl = "https://nodejs.org/dist/v$nodeVersion"
        $archivePath = Join-Path $toolRoot $archiveName
        Write-Host "Downloading Node $nodeVersion to .tools (no machine configuration changes)"
        Invoke-WebRequest "$downloadUrl/$archiveName" -OutFile $archivePath
        $checksums = (Invoke-WebRequest "$downloadUrl/SHASUMS256.txt").Content
        $expected = (($checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $archiveName") }) -split '\s+')[0]
        if (!$expected -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node download checksum mismatch' }
        Expand-Archive -LiteralPath $archivePath -DestinationPath $toolRoot -Force
        Move-Item -LiteralPath (Join-Path $toolRoot "node-v$nodeVersion-win-x64") -Destination (Join-Path $toolRoot 'node')
        Remove-Item -LiteralPath $archivePath
    }
}
$env:PATH = "$(Split-Path -Parent $nodeExecutable);$env:PATH"
$pnpmEntry = Join-Path $toolRoot 'pnpm/node_modules/pnpm/bin/pnpm.cjs'
if (!(Test-Path -LiteralPath $pnpmEntry)) {
    $manager = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).packageManager
    if ($manager -notmatch '^pnpm@10\.\d+\.\d+$') { throw 'packageManager must pin pnpm 10 to an exact version' }
    & (Join-Path (Split-Path -Parent $nodeExecutable) 'npm.cmd') install --prefix (Join-Path $toolRoot 'pnpm') $manager --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'pnpm installation failed' }
}
Push-Location $projectRoot
try {
    & $nodeExecutable $pnpmEntry install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency sync failed' }
    if (!$SkipReference) {
        $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
        $uvExecutable = Join-Path $toolRoot 'uv/uv.exe'
        if (Test-Path -LiteralPath $uvExecutable) { $uvCommand = @{ Source = $uvExecutable } }
        if (!$uvCommand) {
            $installerPath = Join-Path $toolRoot 'uv-install.ps1'
            Invoke-WebRequest 'https://astral.sh/uv/install.ps1' -OutFile $installerPath
            $env:UV_INSTALL_DIR = Join-Path $toolRoot 'uv'
            $env:UV_NO_MODIFY_PATH = '1'
            & $installerPath
            if ($LASTEXITCODE -ne 0) { throw 'uv installation failed' }
            $uvCommand = @{ Source = $uvExecutable }
        }
        & $uvCommand.Source python install 3.12
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 installation failed' }
        & $uvCommand.Source sync --frozen
        if ($LASTEXITCODE -ne 0) { throw 'Python dependency sync failed' }
    }
    if ($Native) {
        & $nodeExecutable (Join-Path $PSScriptRoot 'doctor.mjs') --native
        if ($LASTEXITCODE -ne 0) { throw 'Native prerequisites are incomplete; follow docs/development.md' }
    }
    Write-Host 'Ready. Run: powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 dev'
} finally { Pop-Location }
