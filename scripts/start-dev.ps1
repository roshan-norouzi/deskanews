param(
    [switch]$SkipMigrate,
    [switch]$SkipSeed,
    [switch]$FreshWebCache,
    [switch]$StopOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$processStatePath = Join-Path $root '.deska-dev-processes.json'
Set-Location $root

# Use a private Docker CLI config when the user's global config is unreadable.
$dockerConfig = Join-Path $env:TEMP 'deska-docker-config'
New-Item -ItemType Directory -Force -Path $dockerConfig | Out-Null
$env:DOCKER_CONFIG = $dockerConfig

function Get-DevPorts {
    $values = Read-DotEnvValues
    $webPort = 3100
    $apiPort = 3101
    if ($values['WEB_PORT'] -and [int]$values['WEB_PORT'] -gt 0) { $webPort = [int]$values['WEB_PORT'] }
    elseif ($values['CORS_ORIGIN'] -match ':(\d+)\s*$') { $webPort = [int]$Matches[1] }
    if ($values['PORT'] -and [int]$values['PORT'] -gt 0) { $apiPort = [int]$values['PORT'] }
    elseif ($values['API_URL'] -match ':(\d+)\s*$') { $apiPort = [int]$Matches[1] }
    return @{ Web = $webPort; Api = $apiPort }
}

function Read-DotEnvValues {
    $values = @{}
    $envFile = Join-Path $root '.env'
    if (-not (Test-Path $envFile)) { return $values }

    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*([^#][A-Z0-9_]*)\s*=\s*(.*)$') {
            $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $values
}

function Set-DotEnvValue {
    param(
        [string]$Key,
        [string]$Value
    )

    $envFile = Join-Path $root '.env'
    $lines = [System.Collections.Generic.List[string]]::new()
    if (Test-Path $envFile) {
        foreach ($line in Get-Content -LiteralPath $envFile) { $lines.Add($line) }
    }

    $updated = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^\s*$([regex]::Escape($Key))\s*=") {
            $lines[$index] = "$Key=$Value"
            $updated = $true
            break
        }
    }
    if (-not $updated) { $lines.Add("$Key=$Value") }
    Set-Content -LiteralPath $envFile -Value $lines -Encoding UTF8
}

function New-DevelopmentSecret {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Ensure-ComposeEnvironment {
    $values = Read-DotEnvValues
    $databaseUrl = [string]$values['DATABASE_URL']
    $postgresPassword = [string]$values['POSTGRES_PASSWORD']
    $placeholderPassword = [string]::IsNullOrWhiteSpace($postgresPassword) -or $postgresPassword -like 'replace-with-*'

    if ($placeholderPassword) {
        $urlPassword = ''
        if ($databaseUrl -match '^postgresql://[^:]+:([^@]+)@') {
            $urlPassword = [Uri]::UnescapeDataString($Matches[1])
        }
        if ([string]::IsNullOrWhiteSpace($urlPassword) -or $urlPassword -like 'replace-with-*') {
            $postgresPassword = New-DevelopmentSecret
            if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
                $databaseUrl = "postgresql://deska:$postgresPassword@localhost:5434/deska_news"
            } elseif ($databaseUrl -match '^(postgresql://[^:]+:)[^@]+(@.*)$') {
                $databaseUrl = "$($Matches[1])$postgresPassword$($Matches[2])"
            }
            Set-DotEnvValue -Key 'DATABASE_URL' -Value $databaseUrl
        } else {
            # Preserve compatibility with an existing development volume by
            # deriving the missing Compose value from its working URL.
            $postgresPassword = $urlPassword
        }
        Set-DotEnvValue -Key 'POSTGRES_PASSWORD' -Value $postgresPassword
        Write-Host 'POSTGRES_PASSWORD was synchronized in .env for Docker Compose.' -ForegroundColor Yellow
        $values = Read-DotEnvValues
    }

    $databaseUrl = [string]$values['DATABASE_URL']
    $postgresPassword = [string]$values['POSTGRES_PASSWORD']
    if ([string]::IsNullOrWhiteSpace($databaseUrl) -or $databaseUrl -like '*replace-with-*') {
        $encodedPassword = [Uri]::EscapeDataString($postgresPassword)
        Set-DotEnvValue -Key 'DATABASE_URL' -Value "postgresql://deska:$encodedPassword@localhost:5434/deska_news"
        Write-Host 'DATABASE_URL was synchronized in .env for local PostgreSQL.' -ForegroundColor Yellow
        $values = Read-DotEnvValues
    }

    $jwtSecret = [string]$values['JWT_SECRET']
    if ([string]::IsNullOrWhiteSpace($jwtSecret) -or $jwtSecret -like 'replace-with-*') {
        Set-DotEnvValue -Key 'JWT_SECRET' -Value (New-DevelopmentSecret)
        Write-Host 'A development JWT_SECRET was generated in .env.' -ForegroundColor Yellow
        $values = Read-DotEnvValues
    }
    $settingsKey = [string]$values['SETTINGS_ENCRYPTION_KEY']
    if ([string]::IsNullOrWhiteSpace($settingsKey) -or $settingsKey -like 'replace-with-*') {
        Set-DotEnvValue -Key 'SETTINGS_ENCRYPTION_KEY' -Value (New-DevelopmentSecret)
        Write-Host 'A development SETTINGS_ENCRYPTION_KEY was generated in .env.' -ForegroundColor Yellow
        $values = Read-DotEnvValues
    }
    if ([string]::IsNullOrWhiteSpace([string]$values['CORS_ORIGIN'])) {
        Set-DotEnvValue -Key 'CORS_ORIGIN' -Value 'http://localhost:3100'
        $values = Read-DotEnvValues
    }

    # Explicitly export Compose inputs so nested cmd.exe invocations receive
    # the same values without ever printing credentials.
    foreach ($key in @('POSTGRES_PASSWORD', 'POSTGRES_PORT', 'JWT_SECRET', 'CORS_ORIGIN', 'SETTINGS_ENCRYPTION_KEY', 'TRUST_PROXY_HOPS', 'COMPOSE_PROJECT_NAME', 'IMAGE_PREFIX', 'API_PORT', 'WEB_PORT')) {
        if (-not [string]::IsNullOrWhiteSpace([string]$values[$key])) {
            Set-Item -LiteralPath "Env:$key" -Value ([string]$values[$key])
        }
    }
}

function Read-DatabaseUrl {
    $envFile = Join-Path $root '.env'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
                return $Matches[1].Trim().Trim('"').Trim("'")
            }
        }
    }
    return 'postgresql://deska:deska123@localhost:5434/deska_news'
}

function Get-DatabaseEndpoint {
    param([string]$DatabaseUrl)

    if ($DatabaseUrl -match '@([^:/]+):(\d+)/') {
        return @{
            Host = $Matches[1]
            Port = [int]$Matches[2]
        }
    }

    return @{
        Host = 'localhost'
        Port = 5432
    }
}

function Set-DatabasePort {
    param(
        [string]$DatabaseUrl,
        [int]$Port
    )

    if ($DatabaseUrl -match '^(postgresql://[^@]+@[^:/]+:)\d+(/.*)$') {
        return "$($Matches[1])$Port$($Matches[2])"
    }

    return $DatabaseUrl
}

function Test-PostgresPort {
    param(
        [string]$HostName,
        [int]$Port
    )

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($HostName, $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false)
        if (-not $ok) {
            $client.Close()
            return $false
        }
        $client.EndConnect($iar)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Test-DockerEngine {
    try {
        $info = docker info 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { return $false }
        return $info -match 'Server Version'
    } catch {
        return $false
    }
}

function Wait-PostgresReady {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$MaxAttempts = 45
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if (Test-PostgresPort -HostName $HostName -Port $Port) {
            Write-Host "PostgreSQL is ready on ${HostName}:${Port}." -ForegroundColor Green
            return $true
        }

        Write-Host "Waiting for PostgreSQL ($attempt/$MaxAttempts)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }

    return $false
}

function Get-PortListenerProcessIds {
    param([int]$Port)

    $ownerIds = @()
    try {
        $ownerIds = @(
            Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
                Select-Object -ExpandProperty OwningProcess -Unique
        )
    } catch {
        # Get-NetTCPConnection may require elevated permissions on some Windows
        # installations. netstat remains readable for a regular desktop user.
    }

    if ($ownerIds.Count -eq 0) {
        foreach ($line in @(netstat.exe -ano -p tcp 2>$null)) {
            if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
                $ownerIds += [int]$Matches[1]
            }
        }
    }

    return @($ownerIds | Where-Object { $_ -gt 0 } | Select-Object -Unique)
}

function Stop-PortListeners {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            $ownerIds = @(Get-PortListenerProcessIds -Port $port)
            if ($ownerIds.Count -eq 0) { break }

            if ($attempt -eq 1) { Write-Host "Freeing port $port..." -ForegroundColor Yellow }
            $processRows = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
            foreach ($ownerId in $ownerIds) {
                $treeRootId = [int]$ownerId
                $currentId = [int]$ownerId
                for ($depth = 0; $depth -lt 8; $depth++) {
                    $currentRow = $processRows | Where-Object { $_.ProcessId -eq $currentId } | Select-Object -First 1
                    if (-not $currentRow) { break }
                    $parentRow = $processRows | Where-Object { $_.ProcessId -eq $currentRow.ParentProcessId } | Select-Object -First 1
                    if (-not $parentRow -or $parentRow.Name -notin @('node.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe')) { break }
                    $treeRootId = [int]$parentRow.ProcessId
                    $currentId = $treeRootId
                }
                cmd.exe /d /c "taskkill /PID $treeRootId /T /F >nul 2>&1"
            }
            Start-Sleep -Milliseconds 700
        }

        if (@(Get-PortListenerProcessIds -Port $port).Count -gt 0) {
            throw "Port $port is still occupied after cleanup."
        }
    }
}

function Get-PublishedPostgresPort {
    try {
        $ports = docker compose port postgres 5432 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ports)) {
            return $null
        }
        if ($ports -match ':(\d+)\s*$') {
            return [int]$Matches[1]
        }
        return $null
    } catch {
        return $null
    }
}

function Start-DockerPostgres {
    param(
        [string]$HostName,
        [int]$Port
    )

    Write-Host 'Starting PostgreSQL with Docker...' -ForegroundColor Yellow

    # Containers can be "Up/healthy" without host port publish — that breaks login.
    $published = Get-PublishedPostgresPort
    $needsRecreate = -not (Test-PostgresPort -HostName $HostName -Port $Port) -or $published -ne $Port

    if ($needsRecreate) {
        cmd.exe /d /c "docker compose stop postgres >nul 2>&1"
        cmd.exe /d /c "docker compose rm -f postgres >nul 2>&1"
        cmd.exe /d /c "docker compose up postgres -d --force-recreate"
    } else {
        cmd.exe /d /c "docker compose up postgres -d"
    }

    if ($LASTEXITCODE -ne 0) {
        throw 'docker compose up postgres failed.'
    }

    if (-not (Wait-PostgresReady -HostName $HostName -Port $Port)) {
        throw "PostgreSQL container did not open port $Port in time. Try: docker compose up postgres -d --force-recreate"
    }
}

function Ensure-DockerEngine {
    if (Test-DockerEngine) { return $true }
    $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $dockerDesktop)) { return $false }
    Write-Host 'Starting Docker Desktop...' -ForegroundColor Yellow
    Start-Process -FilePath $dockerDesktop -WindowStyle Minimized
    for ($attempt = 1; $attempt -le 60; $attempt++) { Start-Sleep -Seconds 2; if (Test-DockerEngine) { return $true } }
    return $false
}

function Stop-DevelopmentProcesses {
    $escapedRoot = [regex]::Escape($root)

    if (Test-Path $processStatePath) {
        try {
            $saved = Get-Content -LiteralPath $processStatePath -Raw | ConvertFrom-Json
            foreach ($entry in @($saved.processes)) {
                $process = Get-Process -Id ([int]$entry.id) -ErrorAction SilentlyContinue
                if (-not $process) { continue }
                $savedStart = [datetime]::Parse([string]$entry.startedAt).ToUniversalTime()
                $actualStart = $process.StartTime.ToUniversalTime()
                if ([math]::Abs(($actualStart - $savedStart).TotalSeconds) -le 2) {
                    cmd.exe /d /c "taskkill /PID $($process.Id) /T /F >nul 2>&1"
                }
            }
        } catch {
            Write-Host 'Previous process state could not be read; discovery cleanup will continue.' -ForegroundColor Yellow
        }
        Remove-Item -LiteralPath $processStatePath -Force -ErrorAction SilentlyContinue
    }

    try {
        $processes = Get-CimInstance Win32_Process -ErrorAction Stop |
            Where-Object {
                $_.Name -in @('powershell.exe', 'pwsh.exe') -and
                $_.CommandLine -match $escapedRoot -and
                $_.CommandLine -match '(tsc\.cmd.*--watch|nest\.cmd\s+start\s+--watch|next\.cmd\s+dev)'
            }
    } catch {
        Write-Host 'Unable to inspect previous development processes; port cleanup will still continue.' -ForegroundColor Yellow
        return
    }

    $processIds = @($processes | Select-Object -ExpandProperty ProcessId -Unique)
    if ($processIds.Count -gt 0) {
        Write-Host "Stopping $($processIds.Count) previous DESKA development process(es)..." -ForegroundColor Yellow
        foreach ($processId in $processIds) {
            cmd.exe /d /c "taskkill /PID $processId /T /F >nul 2>&1"
        }
    }

    try {
        $nodeProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop |
            Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match $escapedRoot })
        if ($nodeProcesses.Count -gt 0) {
            Write-Host "Stopping $($nodeProcesses.Count) Node.js process(es) for this project..." -ForegroundColor Yellow
        }
        foreach ($nodeProcess in $nodeProcesses) {
            cmd.exe /d /c "taskkill /PID $($nodeProcess.ProcessId) /T /F >nul 2>&1"
        }
    } catch {
        Write-Host 'Unable to inspect Node.js development processes.' -ForegroundColor Yellow
    }
}

function Reset-DevelopmentLogs {
    @(
        'deska-shared.log', 'deska-shared.err.log',
        'deska-sdk.log', 'deska-sdk.err.log',
        'deska-api.log', 'deska-api.err.log',
        'deska-web.log', 'deska-web.err.log'
    ) | ForEach-Object {
        $logPath = Join-Path $root $_
        if (Test-Path $logPath) {
            Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Stop-DockerAppServices {
    if (-not (Test-DockerEngine)) { return }

    $runningServices = docker compose ps --services --status running 2>$null
    if ($LASTEXITCODE -ne 0) { return }

    $servicesToStop = @($runningServices | Where-Object { $_ -in @('web', 'api') })
    if ($servicesToStop.Count -eq 0) { return }

    Write-Host 'Stopping stale Docker Web/API services...' -ForegroundColor Yellow
    docker compose stop web api | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to stop stale Docker Web/API services.'
    }
}

function Test-PostgresDatabase {
    param([string]$DatabaseUrl)
    $previousUrl = $env:DATABASE_URL
    try { $env:DATABASE_URL = $DatabaseUrl; & "$root\apps\api\node_modules\.bin\prisma.cmd" migrate status --schema "$root\apps\api\prisma\schema.prisma" *> $null; return $LASTEXITCODE -eq 0 }
    catch { return $false }
    finally { $env:DATABASE_URL = $previousUrl }
}

function Ensure-Postgres {
    $databaseUrl = Read-DatabaseUrl
    $endpoint = Get-DatabaseEndpoint -DatabaseUrl $databaseUrl

    if (Test-PostgresDatabase -DatabaseUrl $databaseUrl) {
        Write-Host "Using PostgreSQL on $($endpoint.Host):$($endpoint.Port)" -ForegroundColor Green
        return $databaseUrl
    }

    if ($endpoint.Port -ne 5432 -and (Test-PostgresPort -HostName $endpoint.Host -Port 5432)) {
        $localUrl = Set-DatabasePort -DatabaseUrl $databaseUrl -Port 5432
        Write-Host 'Using local PostgreSQL on port 5432' -ForegroundColor Green
        return $localUrl
    }

    if (-not (Ensure-DockerEngine)) {
        Write-Host ''
        Write-Host 'PostgreSQL is not running and Docker Desktop is not ready.' -ForegroundColor Red
        Write-Host '1) Start Docker Desktop and wait until it is fully ready' -ForegroundColor Yellow
        Write-Host '2) Run Run.bat again' -ForegroundColor Yellow
        Write-Host ''
        exit 1
    }

    Start-DockerPostgres -HostName $endpoint.Host -Port $endpoint.Port
    return $databaseUrl
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Deska News - Development Stack' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if (-not $StopOnly -and -not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host '.env created from .env.example' -ForegroundColor Yellow
}

if (-not $StopOnly) {
    Ensure-ComposeEnvironment
}
$devPorts = Get-DevPorts

Stop-DevelopmentProcesses
Stop-DockerAppServices
Stop-PortListeners -Ports @($devPorts.Web, $devPorts.Api)

if ($StopOnly) {
    Write-Host 'Stopped Deska development processes.' -ForegroundColor Green
    exit 0
}

Reset-DevelopmentLogs

$env:DATABASE_URL = Ensure-Postgres

Write-Host 'Generating Prisma client for the local PostgreSQL engine...' -ForegroundColor Yellow
# Always regenerate with the regular query engine. A previous build may have
# used `prisma generate --no-engine`, which is only valid for Prisma Accelerate
# and makes the local API fail with a misleading prisma:// URL error.
& "$root\apps\api\node_modules\.bin\prisma.cmd" generate --schema "$root\apps\api\prisma\schema.prisma"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipMigrate) {
    Write-Host 'Syncing database schema...' -ForegroundColor Yellow
    & "$root\apps\api\node_modules\.bin\prisma.cmd" migrate deploy --schema "$root\apps\api\prisma\schema.prisma"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipSeed) {
    Write-Host 'Seeding database...' -ForegroundColor Yellow
    & "$root\apps\api\node_modules\.bin\ts-node.cmd" "$root\apps\api\prisma\seed.ts"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host 'Building packages...' -ForegroundColor Yellow
& "$root\packages\shared\node_modules\.bin\tsc.cmd" -p "$root\packages\shared\tsconfig.json"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($FreshWebCache) {
    foreach ($nextDir in @(
        (Join-Path $root 'apps/web/.next-dev'),
        (Join-Path $root 'apps/web/.next')
    )) {
        if (Test-Path $nextDir) {
            Write-Host "Removing stale Next.js cache: $nextDir" -ForegroundColor Yellow
            Remove-Item -Recurse -Force $nextDir
        }
    }
}

Write-Host ''
Write-Host "Starting API ($($devPorts.Api)) + Web ($($devPorts.Web)) with hot reload..." -ForegroundColor Green
Write-Host 'Login: use the administrator credentials configured in .env' -ForegroundColor DarkGray
Write-Host "Open:  http://localhost:$($devPorts.Web)/login" -ForegroundColor DarkGray
Write-Host ''

$sharedWatchCommand = "Set-Location '$root'; `$env:CHOKIDAR_USEPOLLING='true'; .\packages\shared\node_modules\.bin\tsc.cmd -p .\packages\shared\tsconfig.json --watch --preserveWatchOutput"
$apiCommand = "Set-Location '$root\apps\api'; `$env:DATABASE_URL='$env:DATABASE_URL'; `$env:PORT='$($devPorts.Api)'; `$env:NODE_ENV='development'; `$env:CHOKIDAR_USEPOLLING='true'; `$env:WATCHPACK_POLLING='true'; .\node_modules\.bin\nest.cmd start --watch"
$apiUrl = "http://localhost:$($devPorts.Api)"
$webCommand = "Set-Location '$root\apps\web'; `$env:NODE_ENV='development'; `$env:API_URL='$apiUrl'; `$env:NEXT_PUBLIC_API_URL='$apiUrl'; `$env:CHOKIDAR_USEPOLLING='true'; `$env:WATCHPACK_POLLING='true'; .\node_modules\.bin\next.cmd dev --port $($devPorts.Web)"
$sharedProcess = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',$sharedWatchCommand -RedirectStandardOutput "$root\deska-shared.log" -RedirectStandardError "$root\deska-shared.err.log" -PassThru
$apiProcess = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',$apiCommand -RedirectStandardOutput "$root\deska-api.log" -RedirectStandardError "$root\deska-api.err.log" -PassThru

# Wait for the API health endpoint before starting Web. Starting both processes
# at once makes Next.js proxy the first auth requests while Nest is still
# compiling, which surfaces a misleading "API unavailable" error in the UI.
$apiReady = $false
for ($attempt = 1; $attempt -le 45; $attempt++) {
    if ($apiProcess.HasExited) {
        throw 'Startup failed: API process exited before becoming ready. Logs: deska-api.log / deska-api.err.log'
    }
    try {
        $health = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$($devPorts.Api)/api/health" -TimeoutSec 2
        if ($health.StatusCode -ge 200 -and $health.StatusCode -lt 300) {
            $apiReady = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $apiReady) {
    throw 'Startup timed out: API health endpoint did not become ready within 45 seconds. Check deska-api.log / deska-api.err.log.'
}

$webProcess = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',$webCommand -RedirectStandardOutput "$root\deska-web.log" -RedirectStandardError "$root\deska-web.err.log" -PassThru

@{
    processes = @($sharedProcess, $apiProcess, $webProcess) | ForEach-Object {
        @{ id = $_.Id; startedAt = $_.StartTime.ToUniversalTime().ToString('o') }
    }
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $processStatePath -Encoding UTF8

for ($attempt = 1; $attempt -le 30; $attempt++) {
    if ((Test-PostgresPort -HostName 'localhost' -Port $devPorts.Web) -and (Test-PostgresPort -HostName 'localhost' -Port $devPorts.Api)) {
        Write-Host 'Hot reload is active. Changes are picked up automatically.' -ForegroundColor Green
        exit 0
    }
    if ($apiProcess.HasExited -or $webProcess.HasExited) {
        $failedServices = @()
        if ($apiProcess.HasExited) { $failedServices += 'API' }
        if ($webProcess.HasExited) { $failedServices += 'Web' }
        throw "Startup failed: $($failedServices -join ' و ') process exited. Logs: deska-api.log / deska-api.err.log / deska-web.log / deska-web.err.log"
    }
    Start-Sleep -Seconds 1
}

throw 'Startup timed out: API or Web did not start listening within 30 seconds. Check deska-api.log, deska-api.err.log, deska-web.log and deska-web.err.log.'
