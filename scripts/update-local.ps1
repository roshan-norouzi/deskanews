param(
    [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Deska News - Update from GitHub' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path (Join-Path $root '.git'))) {
    throw 'This folder is not a git repository.'
}

Write-Host '1/4 Pulling latest code from origin/main...' -ForegroundColor Yellow
git fetch origin main
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) {
    throw 'git pull failed. Resolve local changes, then run this script again.'
}

Write-Host '2/4 Installing dependencies...' -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '3/4 Restarting stack (PostgreSQL + migrate + build + hot reload)...' -ForegroundColor Yellow
$startArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'scripts/start-dev.ps1'), '-FreshWebCache')
if ($SkipSeed) { $startArgs += '-SkipSeed' }
& powershell.exe @startArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Update complete.' -ForegroundColor Green
Write-Host 'Open: http://localhost:3100/login' -ForegroundColor DarkGray
Write-Host 'Expected UI: flat sidebar, no "نشر هوشمند" submenu, word filters on feeds page.' -ForegroundColor DarkGray
Write-Host ''
