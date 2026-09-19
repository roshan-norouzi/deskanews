param([Parameter(Mandatory = $true)][string]$Archive)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path -LiteralPath $Archive)) { throw "بسته پیدا نشد: $Archive" }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker در دسترس نیست.' }
$current = if (Test-Path VERSION) { (Get-Content VERSION -Raw).Trim() } else { '0.0.0' }
$tmp = Join-Path $env:TEMP ("deska-upgrade-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Expand-Archive -LiteralPath $Archive -DestinationPath $tmp -Force
  $new = (Get-Content (Join-Path $tmp 'VERSION') -Raw).Trim()
  if ([version]$new -le [version]$current) { throw "نسخه جدید باید بزرگ‌تر باشد (فعلی $current، بسته $new)." }
  New-Item -ItemType Directory -Path backups -Force | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | Set-Content "backups\db-$stamp.sql"
  $envBackup = Join-Path $tmp '.env.backup'
  if (Test-Path .env) { Copy-Item .env $envBackup }
  Copy-Item (Join-Path $tmp '*') . -Recurse -Force
  if (Test-Path $envBackup) { Copy-Item $envBackup .env -Force }
  if (Test-Path .env) {
    $envLines = @(Get-Content .env | Where-Object { $_ -notmatch '^APP_VERSION=' })
    $envLines += "APP_VERSION=$new"
    Set-Content .env $envLines -Encoding utf8
  }
  docker compose up -d --build --remove-orphans
  Set-Content VERSION $new -NoNewline
  Write-Host "ارتقا به نسخه $new با موفقیت انجام شد." -ForegroundColor Green
} finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
