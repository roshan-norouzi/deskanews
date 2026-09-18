$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$schema = Join-Path $root 'apps\api\prisma\schema.prisma'
$prisma = Join-Path $root 'apps\api\node_modules\.bin\prisma.cmd'
$stopScript = Join-Path $root 'scripts\stop-dev.ps1'

if (-not (Test-Path -LiteralPath $prisma)) {
    Write-Host 'Prisma CLI not found. Run pnpm install first.' -ForegroundColor Red
    exit 1
}

for ($attempt = 1; $attempt -le 5; $attempt++) {
    & $prisma generate --schema $schema
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'Prisma client generated.' -ForegroundColor Green
        exit 0
    }

    Write-Host "Prisma generate failed (attempt $attempt/5). The query engine file may be locked by a running API." -ForegroundColor Yellow
    if ($attempt -lt 5) {
        & $stopScript
        Start-Sleep -Seconds 3
    }
}

Write-Host 'Prisma generate failed after retries. Close any Deska/API windows, then run Update.bat again.' -ForegroundColor Red
exit 1
