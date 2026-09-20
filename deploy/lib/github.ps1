function Get-GitHubToken {
  param([switch]$AllowPrompt)

  if ($env:DEPLOY_GITHUB_TOKEN) {
    return [string]$env:DEPLOY_GITHUB_TOKEN
  }

  if (Get-Command gh -ErrorAction SilentlyContinue) {
    $ghToken = gh auth token 2>$null
    if ($LASTEXITCODE -eq 0 -and $ghToken) {
      return [string]$ghToken
    }
  }

  if (-not $AllowPrompt) {
    throw 'GitHub token is required. Set DEPLOY_GITHUB_TOKEN, run `gh auth login`, or rerun with an interactive deploy command.'
  }

  $secureToken = Read-Host 'GitHub Actions Token (input is hidden)' -AsSecureString
  $tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
  } finally {
    if ($tokenPtr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
    }
  }
}

function New-GitHubHeaders {
  param([string]$Token)
  return @{
    Authorization = "Bearer $Token"
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
  }
}

function Test-GitHubRepositoryAccess {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers
  )

  try {
    $viewer = Invoke-RestMethod -Method Get -Uri 'https://api.github.com/user' -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
    $repositoryInfo = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$($Config.owner)/$($Config.repository)" -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
    if (-not $viewer.login -or $repositoryInfo.full_name -ne "$($Config.owner)/$($Config.repository)") {
      throw 'Token identity or repository access could not be verified.'
    }
  } catch {
    throw 'GitHub token was rejected or cannot access the repository. Create a valid PAT/fine-grained token with repository Actions write permission and try again; never paste the token into chat.'
  }
}

function Get-WorkflowRunsUri {
  param(
    [PSCustomObject]$Config,
    [string]$Event = 'workflow_dispatch'
  )

  return "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/workflows/$($Config.workflowFile)/runs?branch=$($Config.branch)&event=$Event&per_page=20"
}

function Invoke-GitHubWorkflowDispatch {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers
  )

  if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh workflow run $Config.workflowFile --repo "$($Config.owner)/$($Config.repository)" --ref $Config.branch | Out-Null
    if ($LASTEXITCODE -eq 0) { return }
    Write-Warning 'gh workflow run failed; falling back to the GitHub REST API.'
  }

  $uri = "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/workflows/$($Config.workflowFile)/dispatches"
  Invoke-RestMethod -Method Post -Uri $uri -Headers $Headers -ContentType 'application/json' -Body (@{ ref = $Config.branch } | ConvertTo-Json) -TimeoutSec 30 | Out-Null
}

function Get-LatestWorkflowRun {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers
  )

  $runsUri = Get-WorkflowRunsUri -Config $Config
  $runs = Invoke-RestMethod -Method Get -Uri $runsUri -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
  return @($runs.workflow_runs | Sort-Object { ([DateTime]$_.created_at).ToUniversalTime() } -Descending | Select-Object -First 1)
}
