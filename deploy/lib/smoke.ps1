function Invoke-ProductionSmokeTest {
  param([PSCustomObject]$Config)

  $baseUrl = $Config.publicUrl.TrimEnd('/')
  if (-not $baseUrl) { throw 'publicUrl is not configured. Set deploy/config.local.json or use the default https://app.deska.ir.' }

  Write-Host "Running production smoke test against $baseUrl ..." -ForegroundColor Cyan
  $version = Get-CurrentVersion -ProjectRoot $Config.projectRoot

  $ready = Invoke-RestMethod -Uri "$baseUrl/api/health/ready" -TimeoutSec 20
  if ($ready.status -ne 'ok' -or $ready.ready -ne $true) {
    throw 'Production API readiness check failed.'
  }
  if ($ready.version -and $ready.version -ne $version) {
    Write-Warning "Production API reports version $($ready.version), local VERSION is $version."
  } else {
    Write-Host "API ready (version $($ready.version))." -ForegroundColor Green
  }

  $loginResponse = Invoke-WebRequest -Uri "$baseUrl/login" -UseBasicParsing -TimeoutSec 20
  if ($loginResponse.StatusCode -ne 200) {
    throw "Production /login returned HTTP $($loginResponse.StatusCode)."
  }
  if ($loginResponse.Content -match 'Internal Server Error') {
    throw 'Production /login returned an internal server error page.'
  }

  Write-Host 'Production smoke test passed.' -ForegroundColor Green
}
