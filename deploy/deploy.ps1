[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('release', 'status', 'smoke', 'token', 'help')]
  [string]$Command = 'help',

  [string]$Message = '',
  [Alias('SkipVerify')]
  [switch]$SkipCheck,
  [switch]$NoWait,
  [ValidateRange(10, 90)]
  [int]$MaximumWaitMinutes = 45
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'lib\common.ps1')
. (Join-Path $PSScriptRoot 'lib\config.ps1')
. (Join-Path $PSScriptRoot 'lib\github.ps1')
. (Join-Path $PSScriptRoot 'lib\release.ps1')

$Config = Get-DeployConfig -DeployRoot $PSScriptRoot

function Show-DeployHelp {
  Write-Host ''
  Write-Host 'DESKA deploy' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  deploy.cmd                     Publish everything: commit, version tag, GitHub, server'
  Write-Host '  deploy.cmd -Message "text"     Same, with your own commit message'
  Write-Host '  deploy\deploy.bat status       Latest deploy run (and its error, if it failed)'
  Write-Host '  deploy\deploy.bat smoke        Check https://app.deska.ir is healthy'
  Write-Host '  deploy\deploy.bat token        Replace the saved GitHub token'
  Write-Host ''
  Write-Host '  -SkipCheck   skip the local TypeScript check'
  Write-Host '  -NoWait      return right after GitHub starts the deploy'
  Write-Host ''
  Write-Host 'Guide: deploy/DEPLOY.md' -ForegroundColor DarkGray
}

function Invoke-Release {
  $startedAt = Get-Date
  Initialize-Repository -ProjectRoot $Config.projectRoot
  Assert-ReleaseBranch -Config $Config

  Write-Step '1/5 GitHub access'
  $headers = New-GitHubHeaders (Get-GitHubToken -Config $Config)
  Write-Ok "Connected to $($Config.owner)/$($Config.repository)."

  Write-Step '2/5 Local check'
  if ($SkipCheck) { Write-Info 'Skipped (-SkipCheck).' } else { Invoke-LocalCheck -Config $Config }

  Write-Step '3/5 Version and push'
  $release = Resolve-Release -Config $Config -Message $Message
  Publish-Release -Config $Config -Release $release
  Write-Host "    Release: $($release.Tag) ($($release.Sha.Substring(0, 7)))" -ForegroundColor White

  Write-Step "4/5 Build and deploy on GitHub Actions ($($release.Tag))"
  $knownRunIds = Invoke-DeployWorkflow -Config $Config -Headers $headers -Tag $release.Tag -Sha $release.Sha
  if ($NoWait) {
    Write-Ok 'Deploy started. Follow it with: deploy\deploy.bat status'
    return
  }
  Wait-DeployWorkflow -Config $Config -Headers $headers -Sha $release.Sha -KnownRunIds $knownRunIds -MaximumWaitMinutes $MaximumWaitMinutes | Out-Null

  Write-Step '5/5 Production check'
  Invoke-ProductionSmokeTest -Config $Config -ExpectedVersion $release.Version

  Write-Host ''
  Write-Host "Done: $($release.Tag) is live on $($Config.publicUrl) ($(Format-Elapsed ((Get-Date) - $startedAt)))" -ForegroundColor Green
}

try {
  switch ($Command) {
    'help' { Show-DeployHelp }
    'release' { Invoke-Release }
    'status' { Initialize-Repository -ProjectRoot $Config.projectRoot; Show-DeployStatus -Config $Config }
    'smoke' { Invoke-ProductionSmokeTest -Config $Config -ExpectedVersion '' }
    'token' {
      Remove-SavedGitHubToken
      Read-GitHubTokenFromUser -Config $Config | Out-Null
    }
  }
  exit 0
} catch {
  Write-Host ''
  Write-Host "DEPLOY FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
