# Use the checkout's pinned tools without changing the system PATH.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localNode = Join-Path $projectRoot '.tools/node/node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if (Test-Path -LiteralPath $localNode) { $localNode } elseif ($nodeCommand) { $nodeCommand.Source } else { $null }
$nodeVersion = (Get-Content (Join-Path $projectRoot '.node-version') -Raw).Trim()
$installedNode = if ($nodeExecutable) { try { & $nodeExecutable --version 2>$null } catch { '' } } else { '' }
if ($installedNode -ne "v$nodeVersion") { throw "Node $nodeVersion is required. Run tools/bootstrap.ps1 to repair the checkout tools." }
$env:PATH = "$(Split-Path -Parent $nodeExecutable);$env:PATH"
if (Test-Path -LiteralPath (Join-Path $projectRoot '.tools/rustup')) {
    $env:CARGO_HOME = Join-Path $projectRoot '.tools/cargo'
    $env:RUSTUP_HOME = Join-Path $projectRoot '.tools/rustup'
    $env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');$env:PATH"
}
$pnpmEntry = Join-Path $projectRoot '.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs'
$manager = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).packageManager
$installedPnpm = if (Test-Path -LiteralPath $pnpmEntry) { try { & $nodeExecutable $pnpmEntry --version 2>$null } catch { '' } } else { '' }
if ($installedPnpm -ne $manager.Substring(5)) { throw "$manager is required. Run tools/bootstrap.ps1 to repair the checkout tools." }
Push-Location $projectRoot
try {
    & $nodeExecutable $pnpmEntry @args
    exit $LASTEXITCODE
} finally { Pop-Location }
