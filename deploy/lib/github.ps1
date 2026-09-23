$script:TokenStorePath = Join-Path $env:LOCALAPPDATA 'Deska\github-deploy-token.xml'

function ConvertFrom-SecureToken {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function New-GitHubHeaders {
  param([string]$Token)
  return @{
    Authorization = "Bearer $Token"
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent' = 'deska-deploy'
  }
}

function Invoke-GitHubApi {
  param(
    [string]$Method = 'Get',
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][hashtable]$Headers,
    [object]$Body,
    [int]$MaxAttempts = 6
  )

  $requestUri = if ($Path -like 'https://*') { $Path } else { "https://api.github.com$Path" }
  $requestParams = @{ Method = $Method; Uri = $requestUri; Headers = $Headers; TimeoutSec = 30; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($null -ne $Body) {
    $requestParams.ContentType = 'application/json'
    $requestParams.Body = ($Body | ConvertTo-Json -Depth 5 -Compress)
  }
  # 4xx answers are real answers from GitHub; only network errors and 5xx are retried.
  return Invoke-WithRetry -What "GitHub API ($Method $Path)" -MaxAttempts $MaxAttempts -IsFatal {
    param($failure)
    $status = Get-HttpStatus $failure
    $status -ge 400 -and $status -lt 500 -and $status -ne 429
  } -Action { Invoke-RestMethod @requestParams }
}

function Test-GitHubToken {
  param([PSCustomObject]$Config, [string]$Token)
  try {
    Invoke-GitHubApi -Path $Config.repoApi -Headers (New-GitHubHeaders $Token) | Out-Null
    return $true
  } catch {
    $status = Get-HttpStatus $_
    if ($status -in 401, 403, 404) { return $false }
    throw "GitHub is unreachable right now, so the token could not be checked: $(Get-ErrorSummary $_)"
  }
}

function Save-GitHubToken {
  param([string]$Token)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $script:TokenStorePath) | Out-Null
  # Export-Clixml protects the SecureString with Windows DPAPI: only this Windows user can read it.
  ConvertTo-SecureString -String $Token -AsPlainText -Force | Export-Clixml -Path $script:TokenStorePath
}

function Remove-SavedGitHubToken {
  Remove-Item -LiteralPath $script:TokenStorePath -Force -ErrorAction SilentlyContinue
}

function Read-GitHubTokenFromUser {
  param([PSCustomObject]$Config)
  Write-Host ''
  Write-Host 'A GitHub token is needed once. It is stored encrypted for your Windows user only.' -ForegroundColor Yellow
  Write-Host "Create it at https://github.com/settings/tokens (classic: scopes 'repo' and 'workflow')." -ForegroundColor Yellow
  for ($tokenAttempt = 1; $tokenAttempt -le 3; $tokenAttempt++) {
    $token = (ConvertFrom-SecureToken (Read-Host 'GitHub token (input is hidden)' -AsSecureString)).Trim()
    if (-not $token) { continue }
    if (Test-GitHubToken -Config $Config -Token $token) {
      Save-GitHubToken $token
      Write-Ok 'Token verified and saved. You will not be asked again.'
      return $token
    }
    Write-Warn "GitHub rejected this token or it cannot access $($Config.owner)/$($Config.repository)."
  }
  throw 'No valid GitHub token was provided.'
}

function Get-GitHubToken {
  param([PSCustomObject]$Config)

  if ($env:DEPLOY_GITHUB_TOKEN) {
    if (Test-GitHubToken -Config $Config -Token $env:DEPLOY_GITHUB_TOKEN) { return [string]$env:DEPLOY_GITHUB_TOKEN }
    throw 'DEPLOY_GITHUB_TOKEN is set but GitHub rejects it. Update or remove that environment variable.'
  }

  if (Test-Path -LiteralPath $script:TokenStorePath) {
    $saved = $null
    try { $saved = ConvertFrom-SecureToken (Import-Clixml -Path $script:TokenStorePath) } catch { }
    if ($saved -and (Test-GitHubToken -Config $Config -Token $saved)) { return $saved }
    Write-Warn 'The saved GitHub token is no longer valid (expired or revoked).'
    Remove-SavedGitHubToken
  }

  return Read-GitHubTokenFromUser -Config $Config
}

function Get-WorkflowRunsForCommit {
  param([PSCustomObject]$Config, [hashtable]$Headers, [string]$Sha, [int]$MaxAttempts = 6)
  $path = "$($Config.repoApi)/actions/workflows/$($Config.workflowFile)/runs?event=workflow_dispatch&head_sha=$Sha&per_page=20"
  return @((Invoke-GitHubApi -Path $path -Headers $Headers -MaxAttempts $MaxAttempts).workflow_runs)
}

function Invoke-DeployWorkflow {
  param([PSCustomObject]$Config, [hashtable]$Headers, [string]$Tag, [string]$Sha)

  $knownRunIds = @(Get-WorkflowRunsForCommit -Config $Config -Headers $Headers -Sha $Sha | ForEach-Object { [string]$_.id })

  $dispatchPath = "$($Config.repoApi)/actions/workflows/$($Config.workflowFile)/dispatches"
  # A freshly pushed tag can take a few seconds to become dispatchable.
  for ($dispatchAttempt = 1; ; $dispatchAttempt++) {
    try {
      Invoke-GitHubApi -Method Post -Path $dispatchPath -Headers $Headers -Body @{ ref = $Tag } | Out-Null
      break
    } catch {
      $detail = Get-ErrorSummary $_
      if ($detail -match 'No ref found' -and $dispatchAttempt -lt 12) { Start-Sleep -Seconds 5; continue }
      if ($detail -match 'workflow_dispatch') {
        throw "GitHub cannot start deploy.yml: the workflow file at $Tag is invalid. Open the Actions tab to see the YAML error. ($detail)"
      }
      if ((Get-HttpStatus $_) -in 401, 403, 404) {
        throw "The GitHub token is not allowed to start workflows. Run 'deploy\deploy.bat token' with a token that has the 'workflow' scope. ($detail)"
      }
      throw
    }
  }
  return ,$knownRunIds
}

function Get-RunProgress {
  param([PSCustomObject]$Config, [hashtable]$Headers, [object]$Run)
  if ($Run.status -ne 'in_progress') { return 'Waiting for a GitHub runner' }
  try {
    $jobs = Invoke-RestMethod -Uri "https://api.github.com$($Config.repoApi)/actions/runs/$($Run.id)/jobs" -Headers $Headers -TimeoutSec 20 -UseBasicParsing
    $active = @($jobs.jobs | Where-Object { $_.status -eq 'in_progress' })
    if ($active.Count -eq 0) { return 'Starting next job' }
    return ($active | ForEach-Object {
      $step = @($_.steps | Where-Object { $_.status -eq 'in_progress' } | Select-Object -First 1)
      if ($step.Count -gt 0) { "$($_.name): $($step[0].name)" } else { $_.name }
    }) -join ' | '
  } catch {
    return $null
  }
}

function Write-FailedRunDiagnostics {
  param([PSCustomObject]$Config, [hashtable]$Headers, [object]$Run)

  try {
    $jobs = Invoke-GitHubApi -Path "$($Config.repoApi)/actions/runs/$($Run.id)/jobs" -Headers $Headers -MaxAttempts 3
  } catch {
    Write-Warn "Could not read job details: $(Get-ErrorSummary $_)"
    return
  }

  foreach ($job in @($jobs.jobs | Where-Object { $_.conclusion -in 'failure', 'timed_out' })) {
    $step = @($job.steps | Where-Object { $_.conclusion -in 'failure', 'timed_out' } | Select-Object -First 1)
    $stepName = if ($step.Count -gt 0) { $step[0].name } else { '(unknown step)' }
    Write-Host ''
    Write-Host "Failed: job '$($job.name)', step '$stepName'" -ForegroundColor Red
    try {
      $logText = Invoke-WithRetry -What 'Download job log' -MaxAttempts 3 -IsFatal { param($failure) (Get-HttpStatus $failure) -in 401, 403, 404 } -Action {
        (Invoke-WebRequest -Uri "https://api.github.com$($Config.repoApi)/actions/jobs/$($job.id)/logs" -Headers $Headers -TimeoutSec 60 -UseBasicParsing).Content
      }
      if ($logText -is [byte[]]) { $logText = [Text.Encoding]::UTF8.GetString($logText) }
      $lines = @(($logText -split "`r?`n") | ForEach-Object { $_ -replace '^\d{4}-\d{2}-\d{2}T\S+Z\s?', '' } | Where-Object { $_ -and $_ -notmatch '^##\[(debug|group|endgroup)\]' })
      if ($lines.Count -eq 0) { Write-Warn 'The job log is empty.'; continue }
      $firstError = -1
      for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
        if ($lines[$lineIndex] -match '^##\[error\]') { $firstError = $lineIndex; break }
      }
      $end = if ($firstError -ge 0) { $firstError } else { $lines.Count - 1 }
      $deskaErrors = @($lines[0..$end] | Where-Object { $_ -match '^DESKA_DEPLOY_ERROR:' })
      Write-Host 'Last log lines before the error:' -ForegroundColor Yellow
      $lines[([Math]::Max(0, $end - 40))..$end] | ForEach-Object { Write-Host "  $_" }
      if ($deskaErrors.Count -gt 0) {
        Write-Host 'Deployment errors reported by the server:' -ForegroundColor Red
        $deskaErrors | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
      }
    } catch {
      Write-Warn "Could not download the job log: $(Get-ErrorSummary $_)"
    }
  }
}

function Wait-DeployWorkflow {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers,
    [string]$Sha,
    [string[]]$KnownRunIds,
    [int]$MaximumWaitMinutes
  )

  $started = Get-Date
  $deadline = $started.AddMinutes($MaximumWaitMinutes)
  $run = $null
  $lastProgress = ''
  $lastNotice = Get-Date

  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 10
    $elapsed = Format-Elapsed ((Get-Date) - $started)
    try {
      $runs = Get-WorkflowRunsForCommit -Config $Config -Headers $Headers -Sha $Sha -MaxAttempts 1
    } catch {
      if (((Get-Date) - $lastNotice).TotalSeconds -ge 60) {
        Write-Warn "[$elapsed] GitHub is temporarily unreachable; still waiting (the deploy continues on GitHub)."
        $lastNotice = Get-Date
      }
      continue
    }

    $run = @($runs | Where-Object { $KnownRunIds -notcontains [string]$_.id } | Sort-Object { [DateTime]$_.created_at } -Descending | Select-Object -First 1)[0]
    if (-not $run) {
      if (((Get-Date) - $started).TotalMinutes -ge 5) { throw 'GitHub accepted the deploy request but did not start a workflow run within 5 minutes. Check the Actions tab.' }
      continue
    }
    if ($run.status -eq 'completed') { break }

    $progress = Get-RunProgress -Config $Config -Headers $Headers -Run $run
    if ($progress -and ($progress -ne $lastProgress -or ((Get-Date) - $lastNotice).TotalSeconds -ge 60)) {
      Write-Info "[$elapsed] $progress"
      $lastProgress = $progress
      $lastNotice = Get-Date
    }
  }

  if (-not $run -or $run.status -ne 'completed') {
    $link = if ($run) { $run.html_url } else { "https://github.com/$($Config.owner)/$($Config.repository)/actions" }
    throw "Stopped waiting after $MaximumWaitMinutes minutes; the deploy may still be running: $link  (check later with: deploy\deploy.bat status)"
  }

  if ($run.conclusion -ne 'success') {
    Write-FailedRunDiagnostics -Config $Config -Headers $Headers -Run $run
    throw "GitHub Actions deploy finished with '$($run.conclusion)': $($run.html_url)"
  }

  Write-Ok "GitHub Actions deploy succeeded: $($run.html_url)"
  return $run
}

function Show-DeployStatus {
  param([PSCustomObject]$Config)

  $headers = New-GitHubHeaders (Get-GitHubToken -Config $Config)
  $path = "$($Config.repoApi)/actions/workflows/$($Config.workflowFile)/runs?event=workflow_dispatch&per_page=1"
  $run = @((Invoke-GitHubApi -Path $path -Headers $headers).workflow_runs)[0]
  if (-not $run) {
    Write-Warn 'No deploy runs found yet.'
    return
  }
  Write-Host "Latest deploy: $($run.head_branch) @ $($run.head_sha.Substring(0, 7))" -ForegroundColor Cyan
  Write-Info "Status: $($run.status) $($run.conclusion)"
  Write-Info "Started: $(([DateTime]$run.created_at).ToLocalTime())"
  Write-Info $run.html_url
  if ($run.status -ne 'completed') {
    $progress = Get-RunProgress -Config $Config -Headers $headers -Run $run
    if ($progress) { Write-Info "Now: $progress" }
  } elseif ($run.conclusion -ne 'success') {
    Write-FailedRunDiagnostics -Config $Config -Headers $headers -Run $run
  }
}
