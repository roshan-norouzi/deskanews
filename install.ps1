$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker در دسترس نیست؛ Docker Desktop/Engine را اجرا کنید.' }
docker compose version *> $null
if ($LASTEXITCODE -eq 0) {
  $composeCommand = @('docker', 'compose')
} elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) {
  $composeCommand = @('docker-compose')
} else {
  throw 'Docker Compose نصب نیست.'
}
$packageVersion = (Get-Content VERSION -Raw).Trim()
$currentVersion = if (Test-Path .deska-installed-version) { (Get-Content .deska-installed-version -Raw).Trim() } else { '0.0.0' }

if ((Test-Path .env) -and (Test-Path .deska-installed-version)) {
  if ([version]$packageVersion -lt [version]$currentVersion) { throw "نسخه بسته قدیمی‌تر از نسخه نصب‌شده است (فعلی $currentVersion، بسته $packageVersion)." }
  if ([version]$packageVersion -gt [version]$currentVersion) {
    New-Item -ItemType Directory -Path backups -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | Set-Content "backups\db-$stamp.sql"
    Write-Host "تشخیص آپدیت از نسخه $currentVersion به $packageVersion؛ داده‌ها حفظ می‌شوند." -ForegroundColor Cyan
  } else {
    Write-Host 'همین نسخه قبلاً نصب شده است؛ سرویس‌ها بررسی و در صورت نیاز تعمیر می‌شوند.' -ForegroundColor Yellow
  }
  $lines = @(Get-Content .env | Where-Object { $_ -notmatch '^APP_VERSION=' }); $lines += "APP_VERSION=$packageVersion"; Set-Content .env $lines -Encoding utf8
} elseif (Test-Path .env) {
  Write-Host 'نصب نیمه‌کاره یا بدون نشانگر نسخه شناسایی شد؛ تنظیمات موجود حفظ و نصب تکمیل می‌شود.' -ForegroundColor Yellow
  $lines = @(Get-Content .env | Where-Object { $_ -notmatch '^APP_VERSION=' }); $lines += "APP_VERSION=$packageVersion"; Set-Content .env $lines -Encoding utf8
}

if (-not (Test-Path .env)) {
  $publicUrl = Read-Host 'دامنه یا آدرس عمومی (پیش‌فرض http://localhost)'
  if (-not $publicUrl) { $publicUrl = 'http://localhost' }
  try {
    $parsedUrl = [Uri]$publicUrl
    if ($parsedUrl.AbsolutePath -and $parsedUrl.AbsolutePath -ne '/') { $detectedBasePath = $parsedUrl.AbsolutePath } else { $detectedBasePath = '' }
    $publicUrl = "$($parsedUrl.Scheme)://$($parsedUrl.Authority)"
  } catch { $detectedBasePath = '' }
  $webPort = Read-Host 'پورت وب (پیش‌فرض 3000)'
  if (-not $webPort) { $webPort = '3000' }
  $basePath = Read-Host "مسیر نصب داخل دامنه (مثلاً /deska، پیش‌فرض $detectedBasePath)"
  if (-not $basePath) { $basePath = $detectedBasePath }
  if ($basePath -and -not $basePath.StartsWith('/')) { $basePath = "/$basePath" }
  $adminEmail = Read-Host 'ایمیل مدیر (پیش‌فرض admin@deska.local)'
  if (-not $adminEmail) { $adminEmail = 'admin@deska.local' }
  $secure = Read-Host 'رمز مدیر (حداقل ۱۲ کاراکتر)' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($adminPassword.Length -lt 12) { throw 'رمز مدیر باید حداقل ۱۲ کاراکتر باشد.' }
  $jwt = [Convert]::ToBase64String([byte[]](1..48 | ForEach-Object { Get-Random -Maximum 256 }))
  $keyBytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($keyBytes) } finally { $rng.Dispose() }
  $settingsKey = [Convert]::ToBase64String($keyBytes)
  $dbPassword = 'deska123'
  @"
POSTGRES_PASSWORD=$dbPassword
POSTGRES_PORT=5433
API_PORT=3001
WEB_PORT=$webPort
WEB_BIND_ADDRESS=127.0.0.1
BASE_PATH=$basePath
PUBLIC_URL=$publicUrl
CORS_ORIGIN=$publicUrl
JWT_SECRET=$jwt
SETTINGS_ENCRYPTION_KEY=$settingsKey
APP_VERSION=$packageVersion
IMAGE_PREFIX=$($env:IMAGE_PREFIX)
SEED_ADMIN_EMAIL=$adminEmail
SEED_ADMIN_PASSWORD=$adminPassword
SEED_ADMIN_NAME=مدیر سیستم
"@ | Set-Content -Encoding utf8 .env
}

$jwtSecretValue = ((Get-Content .env | Where-Object { $_ -match '^JWT_SECRET=' } | Select-Object -Last 1) -replace '^JWT_SECRET=', '').Trim()
$settingsKeyValue = ((Get-Content .env | Where-Object { $_ -match '^SETTINGS_ENCRYPTION_KEY=' } | Select-Object -Last 1) -replace '^SETTINGS_ENCRYPTION_KEY=', '').Trim()
if ($jwtSecretValue.Length -lt 32) { throw 'JWT_SECRET در .env باید حداقل ۳۲ کاراکتر باشد.' }
if ($settingsKeyValue.Length -lt 32) { throw 'SETTINGS_ENCRYPTION_KEY در .env باید حداقل ۳۲ کاراکتر باشد.' }
if ($jwtSecretValue -eq $settingsKeyValue) { throw 'SETTINGS_ENCRYPTION_KEY باید با JWT_SECRET متفاوت باشد.' }

# Docker Compose prioritizes variables inherited from the host process over
# `.env`; make the validated file the single configuration source.
Remove-Item Env:POSTGRES_PASSWORD, Env:JWT_SECRET, Env:SETTINGS_ENCRYPTION_KEY, Env:CORS_ORIGIN -ErrorAction SilentlyContinue

if (-not $env:IMAGE_PREFIX -and (Test-Path .env)) {
  $savedPrefix = (Get-Content .env | Where-Object { $_ -match '^IMAGE_PREFIX=' } | Select-Object -First 1) -replace '^IMAGE_PREFIX=', ''
  if ($savedPrefix) { $env:IMAGE_PREFIX = $savedPrefix }
}

if ($env:IMAGE_PREFIX) {
  Write-Host "دریافت imageهای آماده از $($env:IMAGE_PREFIX)..." -ForegroundColor Cyan
  & $composeCommand[0] $composeCommand[1] pull api web
  if ($LASTEXITCODE -ne 0) { throw 'دریافت imageهای آماده ناموفق بود؛ IMAGE_PREFIX و دسترسی Registry را بررسی کنید.' }
  & $composeCommand[0] $composeCommand[1] up -d --no-build --remove-orphans
} else {
  & $composeCommand[0] $composeCommand[1] up -d --build --remove-orphans
}
for ($i = 0; $i -lt 45; $i++) {
  try {
    $apiPort = ((Get-Content .env | Where-Object { $_ -match '^API_PORT=' } | Select-Object -Last 1) -replace '^API_PORT=', '').Trim()
    if (-not $apiPort) { $apiPort = '3001' }
    $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 3
    if ($r.StatusCode -eq 200) {
      $port = ((Get-Content .env | Where-Object { $_ -match '^WEB_PORT=' } | Select-Object -Last 1) -replace '^WEB_PORT=', '').Trim()
      if (-not $port) { $port = '3000' }
      $loginUrl = if ($port -eq '80') { "$publicUrl/login" } else { "$publicUrl`:$port/login" }
      Set-Content .deska-installed-version $packageVersion -NoNewline
      Write-Host "نصب/ارتقا با موفقیت انجام شد (نسخه $packageVersion): $loginUrl" -ForegroundColor Green
      exit 0
    }
  } catch { Start-Sleep -Seconds 2 }
}
& $composeCommand[0] $composeCommand[1] logs --tail=80 api web
$p1000 = & $composeCommand[0] $composeCommand[1] logs api 2>&1 | Select-String 'P1000'
if ($p1000) { throw 'اتصال API به PostgreSQL با خطای احراز هویت مواجه شد. فایل .env و volume دیتابیس باید یک رمز یکسان داشته باشند؛ داده‌های موجود را حذف نکنید.' }
throw 'سرویس‌ها در زمان مقرر آماده نشدند.'
