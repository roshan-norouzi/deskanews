# Deska News — Pre-delivery verification script
# Usage:
#   pwsh ./scripts/verify.ps1           # full (typecheck + build + runtime)
#   pwsh ./scripts/verify.ps1 -LiveOnly # runtime only (when dev servers are running)

param(
    [switch]$LiveOnly,
    [string]$AdminEmail = $env:SEED_ADMIN_EMAIL,
    [string]$AdminPassword = $env:SEED_ADMIN_PASSWORD
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "`n=== Deska News Verification ===" -ForegroundColor Cyan
if ($LiveOnly) { Write-Host "(live checks only - dev servers must be running)" -ForegroundColor DarkGray }

$failed = @()

function Test-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "`n> $Name" -ForegroundColor Yellow
    try {
        & $Action
        Write-Host "  OK" -ForegroundColor Green
    } catch {
        Write-Host "  FAIL: $_" -ForegroundColor Red
        if ($_.InvocationInfo.PositionMessage) {
            Write-Host "  $($_.InvocationInfo.PositionMessage.Trim())" -ForegroundColor DarkRed
        }
        $script:failed += $Name
    }
}

function Invoke-QuietCommand {
    param(
        [scriptblock]$Command,
        [string]$FailureMessage = 'Command failed'
    )
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Get-QuietCommandOutput {
    param([scriptblock]$Command)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        return (& $Command 2>&1 | Out-String)
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return [bool]$conn
}

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

if ([string]::IsNullOrWhiteSpace($AdminEmail)) { $AdminEmail = Read-DotEnvValue 'SEED_ADMIN_EMAIL' }
if ([string]::IsNullOrWhiteSpace($AdminPassword)) { $AdminPassword = Read-DotEnvValue 'SEED_ADMIN_PASSWORD' }
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { $env:DATABASE_URL = Read-DotEnvValue 'DATABASE_URL' }

$webPort = 3100
$apiPort = 3101
if (Read-DotEnvValue 'WEB_PORT') { $webPort = [int](Read-DotEnvValue 'WEB_PORT') }
if (Read-DotEnvValue 'PORT') { $apiPort = [int](Read-DotEnvValue 'PORT') }
$webBase = "http://localhost:$webPort"
$apiBase = "http://localhost:$apiPort"

if (-not $LiveOnly) {
    Test-Step "Prisma schema" {
        $generateAttempts = 0
        $generateOk = $false
        while ($generateAttempts -lt 3) {
            $generateAttempts++
            $previousPreference = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                pnpm --filter @deska/api db:generate 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    $generateOk = $true
                    break
                }
            } finally {
                $ErrorActionPreference = $previousPreference
            }
            Start-Sleep -Seconds 2
        }
        if (-not $generateOk) {
            $clientEngine = Join-Path $root 'node_modules\.pnpm\@prisma+client@*\node_modules\.prisma\client\query_engine-windows.dll.node'
            $existingClient = @(Get-ChildItem -Path $clientEngine -ErrorAction SilentlyContinue | Select-Object -First 1)
            if (-not $existingClient) {
                throw 'prisma generate failed (Windows EPERM usually means the API dev process is locking query_engine-windows.dll.node; stop dev servers and retry)'
            }
            Write-Host '  WARN: prisma generate skipped because the dev API process locks the query engine; using existing client' -ForegroundColor DarkYellow
        }
        Invoke-QuietCommand { pnpm --filter @deska/api exec prisma validate } -FailureMessage 'prisma validate failed'
    }
    Test-Step "Database migrations" {
        Invoke-QuietCommand { pnpm --filter @deska/api exec prisma migrate deploy } -FailureMessage 'prisma migrate deploy failed'
        $migrationStatus = Get-QuietCommandOutput { pnpm --filter @deska/api exec prisma migrate status }
        if ($migrationStatus -match 'Following migrations have not yet been applied') {
            throw 'Pending migrations remain after migrate deploy'
        }
        if ($migrationStatus -match 'migrations? from the database are not found locally') {
            throw 'Database migration history does not match prisma/migrations (restore missing migration folders or run prisma migrate resolve)'
        }
        if ($migrationStatus -notmatch 'Database schema is up to date') {
            throw "Unexpected migration status:`n$migrationStatus"
        }
    }
    Test-Step "Tenant data integrity" { pnpm db:audit | Out-Null }
    Test-Step "Build shared" { pnpm --filter @deska/shared build | Out-Null }
    Test-Step "Typecheck" { pnpm typecheck | Out-Null }
    Test-Step "API regression tests" {
        pnpm --filter @deska/api test | Out-Null
        if (-not (Test-Path "apps/api/dist/main.js")) { throw "apps/api/dist/main.js not found" }
    }

    $webDevRunning = Test-PortInUse -Port $webPort
    if ($webDevRunning) {
        Write-Host "`n> Build Web" -ForegroundColor Yellow
        Write-Host "  SKIP (dev server on :$webPort - next build would corrupt .next cache)" -ForegroundColor DarkYellow
        Write-Host "  Tip: run 'pnpm restart:web' after full verify, or use -LiveOnly" -ForegroundColor DarkGray
    } else {
        Test-Step "Build Web" { pnpm --filter @deska/web build | Out-Null }
    }
}

Test-Step "API liveness and readiness" {
    $live = Invoke-RestMethod -Uri "$apiBase/api/health/live" -TimeoutSec 5
    if ($live.status -ne 'ok' -or $live.live -ne $true) { throw "API liveness not ok" }
    $health = Invoke-RestMethod -Uri "$apiBase/api/health/ready" -TimeoutSec 10
    if ($health.status -ne 'ok' -or $health.ready -ne $true) { throw "API readiness not ok" }
}

Test-Step "Web /login (200)" {
    $response = Invoke-WebRequest -Uri "$webBase/login" -UseBasicParsing -TimeoutSec 15
    if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
    if ($response.Content -match 'Internal Server Error') { throw "Page body contains Internal Server Error" }
}

Test-Step "Auth login + /me" {
    if ([string]::IsNullOrWhiteSpace($AdminEmail) -or [string]::IsNullOrWhiteSpace($AdminPassword)) {
        throw 'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env, or pass -AdminEmail and -AdminPassword'
    }
    $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
    $loginSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginResponse = Invoke-WebRequest -Uri "$apiBase/api/auth/login" -Method POST `
        -ContentType "application/json" -Body $loginBody -WebSession $loginSession -UseBasicParsing -TimeoutSec 10
    $setCookies = @($loginResponse.Headers['Set-Cookie']) -join '; '
    if ($setCookies -notmatch 'deska_access_token=' -or $setCookies -notmatch 'HttpOnly' -or $setCookies -notmatch 'SameSite=Lax') {
        throw 'Secure authentication cookies were not returned'
    }
    $me = Invoke-RestMethod -Uri "$apiBase/api/auth/me" `
        -WebSession $loginSession -TimeoutSec 10
    if ($me.tenants.Count -lt 1) { throw "No tenants on /auth/me" }
    $script:verifySession = $loginSession
    $script:verifyTenant = $me.tenants[0].id
}

Test-Step "Tenant members API" {
    $h = @{ "X-Tenant-Id" = $script:verifyTenant }
    $members = Invoke-RestMethod -Uri "$apiBase/api/tenants/$($script:verifyTenant)/members" -WebSession $script:verifySession -Headers $h -TimeoutSec 10
    if ($members.Count -lt 1) { throw "Tenant has no members" }
    $script:verifyPublishingEnabled = $true
}

Test-Step "Cross-site write protection" {
    $blocked = $false
    try {
        Invoke-WebRequest -Uri "$apiBase/api/auth/logout" -Method POST `
            -WebSession $script:verifySession -Headers @{ Origin = 'https://untrusted.invalid' } `
            -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 10 | Out-Null
    } catch {
        $statusCode = [int]$_.Exception.Response.StatusCode
        if ($statusCode -eq 403) { $blocked = $true } else { throw }
    }
    if (-not $blocked) { throw 'Authenticated cross-site write request was not blocked' }
}

Test-Step "Publishing and dashboard endpoints" {
    $h = @{ "X-Tenant-Id" = $script:verifyTenant }
    $settings = Invoke-RestMethod -Uri "$apiBase/api/publishing/settings" -WebSession $script:verifySession -Headers $h -TimeoutSec 10
    if ($null -eq $settings.gapgpt_model) { throw "Publishing settings response invalid" }
    $dashboard = Invoke-RestMethod -Uri "$apiBase/api/dashboard/stats" -WebSession $script:verifySession -Headers $h -TimeoutSec 10
    if ($null -eq $dashboard.members -or $null -eq $dashboard.publishing.queue -or $null -eq $dashboard.workItems) { throw "Dashboard response invalid" }
    $notifications = Invoke-RestMethod -Uri "$apiBase/api/notifications/summary" -WebSession $script:verifySession -Headers $h -TimeoutSec 10
    if ($null -eq $notifications.unreadCount -or $null -eq $notifications.items) { throw "Notification summary response invalid" }
    $platformFeeds = Invoke-RestMethod -Uri "$apiBase/api/publishing/platform-feeds" -WebSession $script:verifySession -Headers $h -TimeoutSec 15
    if ($null -eq $platformFeeds) { throw "Platform feeds response invalid" }
}

Test-Step "Publishing operations center" {
    $h = @{ "X-Tenant-Id" = $script:verifyTenant }
    $operations = Invoke-RestMethod -Uri "$apiBase/api/publishing/operations" -WebSession $script:verifySession -Headers $h -TimeoutSec 15
    if ($null -eq $operations.queue -or $null -eq $operations.integrations -or $null -eq $operations.workflow) {
        throw "Publishing operations response invalid"
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($failed.Count -eq 0) {
    Write-Host "All checks passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Failed ($($failed.Count)): $($failed -join ', ')" -ForegroundColor Red
    Write-Host "Try: pnpm restart:web  or  pnpm dev:clean" -ForegroundColor Yellow
    exit 1
}
