$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Read-DotEnvValue {
    param([string]$Key)
    if (-not (Test-Path '.env')) { return '' }
    foreach ($line in Get-Content -LiteralPath '.env') {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return ''
}

$webPort = 3100
$apiPort = 3101
if (Read-DotEnvValue 'WEB_PORT') { $webPort = [int](Read-DotEnvValue 'WEB_PORT') }
if (Read-DotEnvValue 'API_PORT') { $apiPort = [int](Read-DotEnvValue 'API_PORT') }
elseif (Read-DotEnvValue 'PORT') { $apiPort = [int](Read-DotEnvValue 'PORT') }

function Test-DockerEngine {
    try {
        docker info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Wait-HttpReady {
    param(
        [string]$Uri,
        [int]$MaxAttempts = 30
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    return $false
}

if (-not (Test-DockerEngine)) {
    Write-Host 'Docker Desktop is not ready.' -ForegroundColor Red
    Write-Host 'Start Docker Desktop, wait until it is ready, then run Run.bat again.' -ForegroundColor Yellow
    exit 1
}

Write-Host 'Building and starting the latest Deska News services...' -ForegroundColor Cyan
docker compose up -d --build --remove-orphans
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose failed.'
}

if (-not (Wait-HttpReady -Uri "http://localhost:$apiPort/api/health")) {
    docker compose logs --tail=80 api
    throw 'API did not become ready in time.'
}

if (-not (Wait-HttpReady -Uri "http://localhost:$webPort/login")) {
    docker compose logs --tail=80 web
    throw 'Web UI did not become ready in time.'
}

Write-Host 'Deska News started successfully.' -ForegroundColor Green
Start-Process "http://localhost:$webPort/login"
