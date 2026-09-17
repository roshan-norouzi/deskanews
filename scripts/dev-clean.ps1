# Kill dev ports and start full stack fresh
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Read-DotEnvValue {
    param([string]$Key)
    $envFile = Join-Path $root '.env'
    if (-not (Test-Path $envFile)) { return '' }
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return ''
}

$webPort = 3100
$apiPort = 3101
if (Read-DotEnvValue 'WEB_PORT') { $webPort = [int](Read-DotEnvValue 'WEB_PORT') }
if (Read-DotEnvValue 'PORT') { $apiPort = [int](Read-DotEnvValue 'PORT') }

foreach ($port in @($webPort, $apiPort)) {
    Write-Host "Stopping processes on port $port..." -ForegroundColor Yellow
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Start-Sleep -Seconds 1

& (Join-Path $root 'scripts/start-dev.ps1') -SkipMigrate -SkipSeed -FreshWebCache
