param([string]$Version = ((Get-Content VERSION -Raw).Trim()), [string]$Prefix = $env:IMAGE_PREFIX)
$ErrorActionPreference = 'Stop'
if (-not $Prefix) { throw 'IMAGE_PREFIX را مانند ghcr.io/username/deska تنظیم کنید.' }
$platforms = if ($env:PLATFORMS) { $env:PLATFORMS } else { 'linux/amd64' }
$basePath = if ($env:BASE_PATH) { $env:BASE_PATH } else { '' }
docker buildx build --platform $platforms -f apps/api/Dockerfile -t "$Prefix/api`:$Version" --push .
if ($LASTEXITCODE -ne 0) { throw "انتشار image API ناموفق بود (کد $LASTEXITCODE)." }
docker buildx build --platform $platforms -f apps/web/Dockerfile -t "$Prefix/web`:$Version" --build-arg "NEXT_PUBLIC_APP_VERSION=$Version" --build-arg "API_URL=http://api:3001" --build-arg "NEXT_PUBLIC_BASE_PATH=$basePath" --push .
if ($LASTEXITCODE -ne 0) { throw "انتشار image Web ناموفق بود (کد $LASTEXITCODE)." }
Write-Host "Published $Prefix/api:$Version and $Prefix/web:$Version" -ForegroundColor Green
