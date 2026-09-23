function Get-WorkflowStage {
  param(
    [PSCustomObject]$Config,
    [string]$RunId,
    [hashtable]$Headers
  )

  try {
    $jobsUri = "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/runs/$RunId/jobs"
    $jobs = Invoke-RestMethod -Method Get -Uri $jobsUri -Headers $Headers -TimeoutSec 30
    $activeJob = @($jobs.jobs | Where-Object { $_.status -eq 'in_progress' } | Select-Object -First 1)
    if ($activeJob.Count -eq 0) { return 'Finalizing deployment' }
    $activeStep = @($activeJob[0].steps | Where-Object { $_.status -eq 'in_progress' } | Select-Object -First 1)
    if ($activeStep.Count -gt 0 -and $activeStep[0].name) { return [string]$activeStep[0].name }
    return [string]$activeJob[0].name
  } catch {
    return 'Deployment is running'
  }
}

function Write-FailedWorkflowDiagnostics {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers,
    [object]$Run,
    [object]$FailedJob,
    [object]$FailedStep
  )

  if (-not $FailedJob -or -not $FailedStep) { return }

  Write-Host "Workflow failed at Job '$($FailedJob.name)', Step '$($FailedStep.name)'" -ForegroundColor Red
  $logArchive = Join-Path ([IO.Path]::GetTempPath()) ("deska-actions-job-$($FailedJob.id).zip")
  $logFolder = Join-Path ([IO.Path]::GetTempPath()) ("deska-actions-job-$($FailedJob.id)")
  try {
    $allLogLines = @()
    Invoke-WebRequest -Method Get -Uri "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/jobs/$($FailedJob.id)/logs" -Headers $Headers -OutFile $logArchive -TimeoutSec 30
    $logBytes = [IO.File]::ReadAllBytes($logArchive)
    $isZip = $logBytes.Length -ge 2 -and $logBytes[0] -eq 0x50 -and $logBytes[1] -eq 0x4B
    if ($isZip) {
      Expand-Archive -LiteralPath $logArchive -DestinationPath $logFolder -Force
      $logFiles = @(Get-ChildItem -LiteralPath $logFolder -File -Recurse)
      $failedStepName = [string]$FailedStep.name
      $failedStepLogFiles = @($logFiles | Where-Object {
        $_.BaseName.IndexOf($failedStepName, [StringComparison]::OrdinalIgnoreCase) -ge 0
      })
      if ($failedStepLogFiles.Count -eq 0) { $failedStepLogFiles = $logFiles }
      $allLogLines = @($failedStepLogFiles | ForEach-Object {
        Get-Content -LiteralPath $_.FullName
      })
    } else {
      $logText = Get-Content -LiteralPath $logArchive -Raw -Encoding UTF8 -ErrorAction Stop
      $allLogLines = @($logText -split "`r?`n")
    }
    $diagnosticLines = @($allLogLines | Where-Object {
      $payload = $_ -replace '^\d{4}-\d{2}-\d{2}T[^ ]+Z\s*', ''
      $payload -match '^DESKA_DEPLOY_(STAGE|ERROR):'
    })
    if ($diagnosticLines.Count -eq 0) {
      $diagnosticLines = @($allLogLines | Where-Object {
        $payload = $_ -replace '^\d{4}-\d{2}-\d{2}T[^ ]+Z\s*', ''
        $payload -match '^DESKA_DEPLOY_ERROR:'
      })
    }
    if ($diagnosticLines.Count -eq 0) {
      $diagnosticLines = @($allLogLines | Where-Object { $_ -match '(?i)(deployment stopped|error|failed|fatal|denied|not found|permission|connection refused|timeout|no such file|unhealthy|exit code|docker compose)' })
    }
    if ($diagnosticLines.Count -gt 0) {
      Write-Host 'Deployment diagnostics (secret values omitted):' -ForegroundColor Yellow
      $diagnosticLines | Select-Object -Last 40 | ForEach-Object {
        $_ -replace '(?i)(GHCR_TOKEN|SERVER_SSH_KEY|PASSWORD|SECRET|TOKEN|KEY)\s*[=:]\s*[^\s"'']+', '$1=[REDACTED]'
      }
    }
  } catch {
    Write-Host "Could not download job log automatically: $($_.Exception.Message)" -ForegroundColor DarkYellow
  } finally {
    Remove-Item -LiteralPath $logArchive -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $logFolder -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Wait-DeployWorkflow {
  param(
    [PSCustomObject]$Config,
    [hashtable]$Headers,
    [datetime]$DispatchStarted,
    [string]$HeadSha,
    [switch]$NoWait,
    [ValidateRange(5, 90)]
    [int]$MaximumWaitMinutes = 65
  )

  $dispatchStarted = $DispatchStarted
  $runsUri = Get-WorkflowRunsUri -Config $Config
  $baselineRunIds = @{}
  $baselineCaptured = $false
  try {
    $baselineRuns = Invoke-RestMethod -Method Get -Uri $runsUri -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
    foreach ($existingRun in @($baselineRuns.workflow_runs)) {
      $baselineRunIds[[string]$existingRun.id] = $true
    }
    $baselineCaptured = $true
  } catch {
    Write-Warning 'Existing workflow runs could not be listed before dispatch; commit and timestamp matching will be used.'
  }

  Write-Host 'Waiting for GitHub to register the workflow run...' -ForegroundColor DarkCyan
  $run = $null
  $latestRun = $null
  $lastStage = ''
  $lastNoticeAt = [DateTime]::MinValue
  $pollIntervalSeconds = 10
  $deadline = $dispatchStarted.AddMinutes($MaximumWaitMinutes)
  $discoveryCutoff = $dispatchStarted.AddMinutes(-2)

  while ((Get-Date).ToUniversalTime() -lt $deadline -and -not $run) {
    Start-Sleep -Seconds $pollIntervalSeconds
    try {
      $runs = Invoke-RestMethod -Method Get -Uri $runsUri -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
    } catch {
      $elapsed = (Get-Date).ToUniversalTime() - $dispatchStarted
      $now = Get-Date
      if (($now - $lastNoticeAt).TotalSeconds -ge 60) {
        Write-Warning "[$(Format-Elapsed $elapsed)] GitHub status is temporarily unavailable; retrying."
        $lastNoticeAt = $now
      }
      continue
    }

    $candidates = @($runs.workflow_runs | Where-Object {
      $runId = [string]$_.id
      $createdAt = ([DateTime]$_.created_at).ToUniversalTime()
      $isNewRun = $baselineCaptured -and -not $baselineRunIds.ContainsKey($runId)
      $fallbackMatch = -not $baselineCaptured -and $_.head_sha -eq $HeadSha -and $createdAt -ge $discoveryCutoff
      $isNewRun -or $fallbackMatch
    } | Sort-Object { ([DateTime]$_.created_at).ToUniversalTime() } | Select-Object -First 1)

    $latestRun = $candidates
    if ($latestRun -and $latestRun[0].status -eq 'completed') { $run = $latestRun }
    if (-not $latestRun) {
      $elapsed = (Get-Date).ToUniversalTime() - $dispatchStarted
      $now = Get-Date
      if (($now - $lastNoticeAt).TotalSeconds -ge 60) {
        Write-Host "[$(Format-Elapsed $elapsed)] Waiting for GitHub to register the workflow run..." -ForegroundColor DarkCyan
        $lastNoticeAt = $now
      }
      continue
    }

    if ($NoWait -and -not $run) {
      Write-Host "Deployment is running: $($latestRun[0].html_url)" -ForegroundColor Cyan
      return $latestRun[0]
    }

    if (-not $run) {
      $stage = if ($latestRun[0].status -eq 'queued') { 'Queued in GitHub Actions' } else { Get-WorkflowStage -Config $Config -RunId $latestRun[0].id -Headers $Headers }
      $elapsed = (Get-Date).ToUniversalTime() - $dispatchStarted
      $now = Get-Date
      if ($stage -ne $lastStage -or ($now - $lastNoticeAt).TotalSeconds -ge 60) {
        $continuation = if ($stage -eq $lastStage) { ' (still running)' } else { '' }
        Write-Host "[$(Format-Elapsed $elapsed)] $stage$continuation" -ForegroundColor DarkCyan
        $lastStage = $stage
        $lastNoticeAt = $now
      }
    }
  }

  if (-not $run) {
    if ($latestRun) {
      Write-Host "Workflow is still running; it was not marked as failed: $($latestRun[0].html_url)" -ForegroundColor Yellow
      Write-Host 'The deployment will continue on GitHub. Open the link to monitor it, or run with -NoWait next time.' -ForegroundColor Yellow
      return $latestRun[0]
    }
    throw 'Workflow did not start or could not be found. Check GitHub Actions.'
  }

  if ($run.conclusion -ne 'success') {
    $jobsUri = "https://api.github.com/repos/$($Config.owner)/$($Config.repository)/actions/runs/$($run.id)/jobs"
    $jobs = Invoke-RestMethod -Method Get -Uri $jobsUri -Headers $Headers -TimeoutSec 30
    $failedJob = @($jobs.jobs | Where-Object { $_.conclusion -eq 'failure' } | Select-Object -First 1)
    $failedStep = @()
    if ($failedJob.Count -gt 0) {
      $failedStep = @($failedJob[0].steps | Where-Object { $_.conclusion -eq 'failure' } | Select-Object -First 1)
    }
    if ($failedJob.Count -gt 0 -and $failedStep.Count -gt 0) {
      Write-FailedWorkflowDiagnostics -Config $Config -Headers $Headers -Run $run -FailedJob $failedJob[0] -FailedStep $failedStep[0]
    }
    throw "Workflow failed: $($run.html_url)"
  }

  Write-Host "Deployment completed successfully: $($run.html_url)" -ForegroundColor Green
  return $run
}

function Invoke-DeployDispatch {
  param(
    [PSCustomObject]$Config,
    [switch]$NoWait,
    [ValidateRange(5, 90)]
    [int]$MaximumWaitMinutes = 65
  )

  $token = Get-GitHubToken -AllowPrompt
  $headers = New-GitHubHeaders -Token $token
  Test-GitHubRepositoryAccess -Config $Config -Headers $headers

  $headSha = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $headSha) { throw 'Unable to identify the Git commit being deployed.' }

  $dispatchStarted = (Get-Date).ToUniversalTime()
  Invoke-GitHubWorkflowDispatch -Config $Config -Headers $headers
  Write-Host 'GitHub Actions deployment started.' -ForegroundColor Cyan

  return Wait-DeployWorkflow -Config $Config -Headers $headers -DispatchStarted $dispatchStarted -HeadSha $headSha -NoWait:$NoWait -MaximumWaitMinutes $MaximumWaitMinutes
}

function Show-DeployStatus {
  param([PSCustomObject]$Config)

  $token = Get-GitHubToken -AllowPrompt
  $headers = New-GitHubHeaders -Token $token
  Test-GitHubRepositoryAccess -Config $Config -Headers $headers

  $latest = Get-LatestWorkflowRun -Config $Config -Headers $headers
  if (-not $latest) {
    Write-Host 'No workflow_dispatch runs were found yet.' -ForegroundColor Yellow
    return
  }

  $run = $latest[0]
  Write-Host "Latest deploy run: $($run.html_url)" -ForegroundColor Cyan
  Write-Host "  Status: $($run.status) / $($run.conclusion)" -ForegroundColor DarkGray
  Write-Host "  Branch: $($run.head_branch) @ $($run.head_sha.Substring(0, 7))" -ForegroundColor DarkGray
  if ($run.status -eq 'in_progress' -or $run.status -eq 'queued') {
    $stage = if ($run.status -eq 'queued') { 'Queued in GitHub Actions' } else { Get-WorkflowStage -Config $Config -RunId $run.id -Headers $headers }
    Write-Host "  Stage: $stage" -ForegroundColor DarkCyan
  }
}
