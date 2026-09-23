function Get-DeployConfig {
  param(
    [string]$DeployRoot = $PSScriptRoot
  )

  $projectRoot = Split-Path -Parent (Split-Path -Parent $DeployRoot)
  $configPath = Join-Path (Split-Path -Parent $DeployRoot) 'config.local.json'

  $config = [ordered]@{
    projectRoot = $projectRoot
    deployRoot = Split-Path -Parent $DeployRoot
    configPath = $configPath
    branch = 'main'
    owner = 'roshan-norouzi'
    repository = 'deskanews'
    workflowFile = '.github/workflows/deploy.yml'
    workflowId = '360876138'
    serverHost = ''
    serverUser = ''
    serverPort = 22
    deployPath = ''
    publicUrl = 'https://app.deska.ir'
    composeProjectName = 'deska-news'
  }

  if (Test-Path $configPath) {
    $local = Get-Content $configPath -Raw | ConvertFrom-Json
    if ($local.branch) { $config.branch = [string]$local.branch }
    if ($local.githubOwner) { $config.owner = [string]$local.githubOwner }
    if ($local.repository) { $config.repository = [string]$local.repository }
    if ($local.serverHost) { $config.serverHost = [string]$local.serverHost }
    if ($local.serverUser) { $config.serverUser = [string]$local.serverUser }
    if ($local.serverPort) { $config.serverPort = [int]$local.serverPort }
    if ($local.deployPath) { $config.deployPath = [string]$local.deployPath }
    if ($local.publicUrl) { $config.publicUrl = [string]$local.publicUrl }
    if ($local.composeProjectName) { $config.composeProjectName = [string]$local.composeProjectName }
  }

  return [PSCustomObject]$config
}

function Write-DeployTargetSummary {
  param([PSCustomObject]$Config)

  if (-not (Test-Path $Config.configPath)) {
    Write-Host 'Deploy target (defaults):' -ForegroundColor Cyan
    Write-Host "  Repo: $($Config.owner)/$($Config.repository) @ $($Config.branch)" -ForegroundColor DarkGray
    Write-Host '  Tip: copy deploy/config.example.json to deploy/config.local.json' -ForegroundColor DarkGray
    return
  }

  Write-Host 'Deploy target (config.local.json):' -ForegroundColor Cyan
  if ($Config.serverHost) {
    Write-Host "  SSH: $($Config.serverUser)@$($Config.serverHost):$($Config.serverPort)" -ForegroundColor DarkGray
  }
  if ($Config.deployPath) { Write-Host "  Path: $($Config.deployPath)" -ForegroundColor DarkGray }
  if ($Config.publicUrl) { Write-Host "  URL: $($Config.publicUrl)" -ForegroundColor DarkGray }
  if ($Config.composeProjectName) { Write-Host "  Docker: $($Config.composeProjectName)" -ForegroundColor DarkGray }
  Write-Host '  GitHub Secrets must match deploy/GITHUB-SECRETS.md' -ForegroundColor Yellow
}
