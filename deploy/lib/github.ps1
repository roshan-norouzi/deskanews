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

function Get-GitHubWorkflowApiRef {
  param([PSCustomObject]$Config)

  if ($Config.workflowId) {
    return [string]$Config.workflowId
  }
  return [Uri]::EscapeDataString([string]$Config.workflowFile)
}

function Get-WorkflowRunsUri {
  param(
    [PSCustomObject]$Config,
    [string]$Event = 'workflow_dispatch',
    [switch]$RepositoryWide
  )

  if ($RepositoryWide) {
    return "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/runs?branch=$($Config.branch)&event=$Event&per_page=30"
  }

  $workflowRef = Get-GitHubWorkflowApiRef -Config $Config
  return "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/workflows/$workflowRef/runs?branch=$($Config.branch)&event=$Event&per_page=20"
}

function Get-DeployWorkflowRuns {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers,
    [string]$Event = 'workflow_dispatch'
  )

  $uri = Get-WorkflowRunsUri -Config $Config -Event $Event
  try {
    return Invoke-RestMethod -Method Get -Uri $uri -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
  } catch {
    $wideUri = Get-WorkflowRunsUri -Config $Config -Event $Event -RepositoryWide
    $wide = Invoke-RestMethod -Method Get -Uri $wideUri -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
    $filtered = @($wide.workflow_runs | Where-Object {
      $_.path -eq $Config.workflowFile -or [string]$_.workflow_id -eq [string]$Config.workflowId
    })
    return [PSCustomObject]@{ workflow_runs = $filtered }
  }
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

  $uri = "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/workflows/$(Get-GitHubWorkflowApiRef -Config $Config)/dispatches"
  try {
    Invoke-RestMethod -Method Post -Uri $uri -Headers $Headers -ContentType 'application/json' -Body (@{ ref = $Config.branch } | ConvertTo-Json) -TimeoutSec 30 | Out-Null
  } catch {
    $detail = $_.ErrorDetails.Message
    if ($detail -match 'workflow_dispatch') {
      throw @(
        'GitHub rejected the deploy workflow dispatch. The workflow YAML on main is likely invalid (check Actions tab for a parse error on deploy.yml).'
        'Push a fix, wait until GitHub shows the workflow name as "Build and deploy DESKA", then run dispatch again.'
        "API response: $detail"
      ) -join ' '
    }
    throw
  }
}

function Get-LatestWorkflowRun {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers
  )

  $runs = Get-DeployWorkflowRuns -Config $Config -Headers $Headers
  return @($runs.workflow_runs | Sort-Object { ([DateTime]$_.created_at).ToUniversalTime() } -Descending | Select-Object -First 1)
}
