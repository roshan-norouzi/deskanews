[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('help', 'verify', 'release', 'push', 'dispatch', 'status', 'smoke')]
  [string]$Command = 'help',

  [string]$Message = '',
  [switch]$NoVersionBump,
  [switch]$SkipSystemExport,
  [switch]$SkipVerify,
  [switch]$NoDispatch,
  [switch]$NoWait,
  [switch]$LiveOnly,
  [ValidateRange(5, 90)]
  [int]$MaximumWaitMinutes = 65
)

$ErrorActionPreference = 'Stop'
$deployRoot = $PSScriptRoot
$libRoot = Join-Path $deployRoot 'lib'

. (Join-Path $libRoot 'common.ps1')
. (Join-Path $libRoot 'config.ps1')
. (Join-Path $libRoot 'release.ps1')
. (Join-Path $libRoot 'github.ps1')
. (Join-Path $libRoot 'workflow.ps1')
. (Join-Path $libRoot 'smoke.ps1')

$Config = Get-DeployConfig -DeployRoot $libRoot

function Show-DeployHelp {
  Write-Host ''
  Write-Host 'DESKA deploy - single entry point' -ForegroundColor Cyan
  Write-Host '================================' -ForegroundColor Cyan
  Write-Host ''
  Write-Host 'Usage:' -ForegroundColor Yellow
  Write-Host '  .\deploy\deploy.ps1 <command> [options]'
  Write-Host '  deploy\deploy.bat                 # shortcut for release'
  Write-Host ''
  Write-Host 'Commands:' -ForegroundColor Yellow
  Write-Host '  help      Show this help'
  Write-Host '  verify    Run local pre-delivery checks (pnpm verify)'
  Write-Host '  release   Full deploy: verify -> commit -> push -> GitHub Actions'
  Write-Host '  push      Push current branch only'
  Write-Host '  dispatch  Trigger GitHub Actions deploy for current branch'
  Write-Host '  status    Show latest deploy workflow run'
  Write-Host '  smoke     Smoke test production URL after deploy'
  Write-Host ''
  Write-Host 'Common options:' -ForegroundColor Yellow
  Write-Host '  -Message <text>         Custom commit message'
  Write-Host '  -NoVersionBump          Do not increment VERSION'
  Write-Host '  -SkipSystemExport       Skip local system-observance export'
  Write-Host '  -SkipVerify             Skip local verify before release'
  Write-Host '  -NoDispatch             Commit/push only; do not start GitHub Actions'
  Write-Host '  -NoWait                 Return after dispatch; monitor on GitHub'
  Write-Host '  -LiveOnly               For verify: runtime checks only'
  Write-Host ''
  Write-Host 'GitHub token (one of):' -ForegroundColor Yellow
  Write-Host '  DEPLOY_GITHUB_TOKEN env var'
  Write-Host '  gh auth login'
  Write-Host '  interactive prompt during dispatch/status'
  Write-Host ''
  Write-Host 'Guide: deploy/DEPLOY.md' -ForegroundColor DarkGray
  Write-Host ''
}

switch ($Command) {
  'help' {
    Show-DeployHelp
    exit 0
  }

  'verify' {
    Ensure-GitRepository -ProjectRoot $Config.projectRoot
    $verifyScript = Join-Path $Config.projectRoot 'scripts/verify.ps1'
    if (-not (Test-Path $verifyScript)) { throw "Missing verification script: $verifyScript" }
    $verifyArgs = @('-ExecutionPolicy', 'Bypass', '-File', $verifyScript)
    if ($LiveOnly) { $verifyArgs += '-LiveOnly' }
    & powershell @verifyArgs
    if ($LASTEXITCODE -ne 0) { throw 'Local verification failed.' }
    exit 0
  }

  'push' {
    Ensure-GitRepository -ProjectRoot $Config.projectRoot
    Write-DeployTargetSummary -Config $Config
    Push-BranchWithRetry $Config.branch
    Write-Host 'Branch pushed.' -ForegroundColor Green
    exit 0
  }

  'dispatch' {
    Ensure-GitRepository -ProjectRoot $Config.projectRoot
    Write-DeployTargetSummary -Config $Config
    Invoke-DeployDispatch -Config $Config -NoWait:$NoWait -MaximumWaitMinutes $MaximumWaitMinutes | Out-Null
    exit 0
  }

  'status' {
    Ensure-GitRepository -ProjectRoot $Config.projectRoot
    Write-DeployTargetSummary -Config $Config
    Show-DeployStatus -Config $Config
    exit 0
  }

  'smoke' {
    Ensure-GitRepository -ProjectRoot $Config.projectRoot
    Write-DeployTargetSummary -Config $Config
    Invoke-ProductionSmokeTest -Config $Config
    exit 0
  }

  'release' {
    Ensure-GitRepository -ProjectRoot $Config.projectRoot
    Write-DeployTargetSummary -Config $Config

    if (-not $SkipVerify) {
      Write-Host 'Step 1/4: Local verification' -ForegroundColor Cyan
      & $PSCommandPath verify
      if ($LASTEXITCODE -ne 0) { throw 'Release stopped because local verification failed.' }
    } else {
      Write-Host 'Step 1/4: Local verification skipped.' -ForegroundColor DarkGray
    }

    Write-Host 'Step 2/4: Commit and push' -ForegroundColor Cyan
    Export-SystemObservances -ProjectRoot $Config.projectRoot -SkipSystemExport:$SkipSystemExport
    Invoke-ReleaseCommitAndPush -Config $Config -Message $Message -NoVersionBump:$NoVersionBump | Out-Null

    if ($NoDispatch) {
      Write-Host 'Step 3/4: GitHub Actions dispatch skipped (-NoDispatch).' -ForegroundColor Yellow
      Write-Host 'Run: .\deploy\deploy.ps1 dispatch' -ForegroundColor Yellow
      exit 0
    }

    Write-Host 'Step 3/4: Trigger GitHub Actions deploy' -ForegroundColor Cyan
    $run = Invoke-DeployDispatch -Config $Config -NoWait:$NoWait -MaximumWaitMinutes $MaximumWaitMinutes

    if ($NoWait -or ($run -and $run.status -ne 'completed')) {
      Write-Host 'Step 4/4: Production smoke test skipped until the workflow completes.' -ForegroundColor Yellow
      Write-Host 'After GitHub Actions succeeds, run: .\deploy\deploy.ps1 smoke' -ForegroundColor Yellow
      exit 0
    }

    Write-Host 'Step 4/4: Production smoke test' -ForegroundColor Cyan
    Invoke-ProductionSmokeTest -Config $Config
    Write-Host 'Release completed.' -ForegroundColor Green
    exit 0
  }

  default {
    Show-DeployHelp
    exit 1
  }
}
