function Get-DeployConfig {
  param([string]$DeployRoot)

  $config = [ordered]@{
    projectRoot = Split-Path -Parent $DeployRoot
    configPath = Join-Path $DeployRoot 'config.local.json'
    branch = 'main'
    owner = 'roshan-norouzi'
    repository = 'deskanews'
    workflowFile = 'deploy.yml'
    publicUrl = 'https://app.deska.ir'
  }

  if (Test-Path $config.configPath) {
    $local = Get-Content $config.configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($local.branch) { $config.branch = [string]$local.branch }
    if ($local.githubOwner) { $config.owner = [string]$local.githubOwner }
    if ($local.repository) { $config.repository = [string]$local.repository }
    if ($local.publicUrl) { $config.publicUrl = ([string]$local.publicUrl).TrimEnd('/') }
  }

  $config.repoApi = "/repos/$($config.owner)/$($config.repository)"
  return [PSCustomObject]$config
}
