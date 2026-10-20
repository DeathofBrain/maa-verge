# Use the checkout's pinned tools without changing the system PATH.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localNode = Join-Path $projectRoot '.tools/node/node.exe'
$nodeExecutable = if (Test-Path -LiteralPath $localNode) { $localNode } else { (Get-Command node -ErrorAction Stop).Source }
$env:PATH = "$(Split-Path -Parent $nodeExecutable);$env:PATH"
$localUvDirectory = Join-Path $projectRoot '.tools/uv'
if (Test-Path -LiteralPath (Join-Path $localUvDirectory 'uv.exe')) { $env:PATH = "$localUvDirectory;$env:PATH" }
$pnpmEntry = Join-Path $projectRoot '.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs'
if (!(Test-Path -LiteralPath $pnpmEntry)) { throw 'Run tools/bootstrap.ps1 first, or use your installed pinned pnpm.' }
Push-Location $projectRoot
try {
    & $nodeExecutable $pnpmEntry @args
    exit $LASTEXITCODE
} finally { Pop-Location }
