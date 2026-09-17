[CmdletBinding()]
param(
  [string]$Message = '',
  [switch]$NoVersionBump,
  [switch]$AutoDispatch,
  [switch]$SkipSystemExport,
  [switch]$NoWait,
  [ValidateRange(5, 90)]
  [int]$MaximumWaitMinutes = 65
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$configPath = Join-Path $PSScriptRoot 'config.local.json'
$branch = 'main'
$owner = 'roshan-norouzi'
$repository = 'deska'
if (Test-Path $configPath) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  if ($config.branch) { $branch = [string]$config.branch }
  if ($config.githubOwner) { $owner = [string]$config.githubOwner }
  if ($config.repository) { $repository = [string]$config.repository }
}

function Test-SystemObservanceSnapshot([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    $snapshot = @(Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
    return $snapshot.Count -gt 0
  } catch {
    return $false
  }
}

function Invoke-SystemObservanceExport([string]$ScriptPath) {
  # Windows PowerShell turns native stderr into terminating ErrorRecord objects
  # when ErrorActionPreference is Stop. Capture the process result explicitly so
  # Prisma diagnostics can be classified before the deployment is interrupted.
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& node $ScriptPath --base64 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  return [PSCustomObject]@{ Output = $output; ExitCode = $exitCode }
}

function Format-Elapsed([TimeSpan]$Elapsed) {
  return ('{0:mm\:ss}' -f $Elapsed)
}

function Get-WorkflowStage([string]$RunId, [hashtable]$Headers) {
  try {
    $jobsUri = "https://api.github.com/repos/$owner/$repository/actions/runs/$RunId/jobs"
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

function Push-BranchWithRetry([string]$Branch) {
  $attemptCount = 3
  for ($attempt = 1; $attempt -le $attemptCount; $attempt++) {
    git push origin $Branch
    if ($LASTEXITCODE -eq 0) { return }
    if ($attempt -lt $attemptCount) {
      $delaySeconds = $attempt * 5
      Write-Warning "GitHub did not accept the push (attempt $attempt/$attemptCount); retrying in $delaySeconds seconds..."
      Start-Sleep -Seconds $delaySeconds
    }
  }
  throw "Unable to push to GitHub after $attemptCount attempts."
}

if (-not $SkipSystemExport) {
  Write-Host 'Exporting local system observances...' -ForegroundColor Cyan
  $prismaPath = Join-Path $projectRoot 'apps/api/prisma'
  $exportScriptPath = Join-Path $prismaPath 'export-system-observances.cjs'
  $snapshotPath = Join-Path $prismaPath 'system-observances.json'
  try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
      if (Test-SystemObservanceSnapshot $snapshotPath) {
        Write-Warning 'Node.js is unavailable; using the existing system-observances.json snapshot.'
      } else {
        throw 'Node.js is unavailable and no valid system-observances.json snapshot exists.'
      }
    } else {
      $exportResult = Invoke-SystemObservanceExport $exportScriptPath
      $diagnostic = ($exportResult.Output | Out-String)
      if ($exportResult.ExitCode -ne 0) {
        $requiresLocalEngine = $diagnostic -match 'P6001|prisma\+postgres|prisma://'
        if ($requiresLocalEngine) {
          if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
            throw 'The local Prisma Client needs repair, but pnpm is not available.'
          }
          Write-Host 'Repairing Prisma Client for the local PostgreSQL database...' -ForegroundColor Cyan
          & pnpm --filter @deska/api exec prisma generate
          if ($LASTEXITCODE -ne 0) {
            throw 'The local Prisma Client needs repair but its engine file is locked. Stop the local API and web development processes once, then retry.'
          }
          $exportResult = Invoke-SystemObservanceExport $exportScriptPath
          $diagnostic = ($exportResult.Output | Out-String)
        }
      }

      if ($exportResult.ExitCode -eq 0) {
        $encoded = ($exportResult.Output -join '').Trim()
        try { $bytes = [Convert]::FromBase64String($encoded); $json = [Text.Encoding]::UTF8.GetString($bytes) } catch { throw 'Export did not return valid UTF-8 data.' }
        if (-not $json.Trim().StartsWith('[')) { throw 'Export did not return valid JSON.' }
        [IO.File]::WriteAllBytes($snapshotPath, $bytes)
        Write-Host 'System observances exported.' -ForegroundColor Green
      } else {
        $databaseUnavailable = $diagnostic -match 'P1001|Can''t reach database server|ECONNREFUSED|connection refused'
        if ($databaseUnavailable -and (Test-SystemObservanceSnapshot $snapshotPath)) {
          $snapshotDate = (Get-Item -LiteralPath $snapshotPath).LastWriteTime.ToString('yyyy-MM-dd HH:mm')
          Write-Warning "Local PostgreSQL is unavailable; using the existing system-observances.json snapshot from $snapshotDate."
        } elseif ($databaseUnavailable) {
          throw 'Local PostgreSQL is unavailable and no valid system-observances.json snapshot exists. Start DESKA once, then retry deployment.'
        } else {
          throw 'Unable to export system observances. Run the export script directly to inspect the Prisma diagnostic.'
        }
      }
    }
  } catch {
    throw "System observance export failed: $($_.Exception.Message)"
  }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is not installed or is not available in PATH.'
}

git rev-parse --show-toplevel *> $null
if ($LASTEXITCODE -ne 0) { throw 'This folder is not a Git repository.' }

$trackedEnv = @(git ls-files .env 2>$null)
if ($trackedEnv.Count -gt 0) {
  throw '.env is tracked by Git. Remove it from tracking before publishing.'
}

$status = @(git status --porcelain)
$hasNewCommit = $false
if ($status.Count -gt 0) {
  if (-not $NoVersionBump) {
    $versionPath = Join-Path $projectRoot 'VERSION'
    $current = (Get-Content $versionPath -Raw).Trim()
    $parts = $current -split '\.'
    $invalidParts = @($parts | Where-Object { $_ -notmatch '^\d+$' })
    if ($parts.Count -ne 3 -or $invalidParts.Count -gt 0) {
      throw "Invalid VERSION value: $current"
    }
    $next = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
    [IO.File]::WriteAllText($versionPath, $next, [Text.UTF8Encoding]::new($false))
    Write-Host "Version bumped to $next." -ForegroundColor Cyan
  }

  git add -A
  if ($LASTEXITCODE -ne 0) { throw 'Unable to stage changes.' }
  if (-not $Message) { $Message = "Release v$((Get-Content VERSION -Raw).Trim())" }
  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create commit.' }
  $hasNewCommit = $true
}

git rev-parse --verify --quiet "refs/remotes/origin/$branch" *> $null
if ($LASTEXITCODE -eq 0) {
  $aheadCount = [int](git rev-list --count "origin/$branch..HEAD")
} else {
  # A new remote branch has no local tracking ref yet and must be pushed.
  $aheadCount = 1
}

if ($hasNewCommit -or $aheadCount -gt 0) {
  Push-BranchWithRetry $branch
  Write-Host 'Changes pushed to GitHub.' -ForegroundColor Green
} else {
  Write-Host 'No local changes to push; deploying the current main branch.' -ForegroundColor Yellow
}

if ($AutoDispatch) {
  $secureToken = Read-Host 'GitHub Actions Token (input is hidden)' -AsSecureString
  $tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
    $uri = "https://api.github.com/repos/$owner/$repository/actions/workflows/deploy.yml/dispatches"
    $headers = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
    try {
      $viewer = Invoke-RestMethod -Method Get -Uri 'https://api.github.com/user' -Headers $headers -TimeoutSec 30 -ErrorAction Stop
      $repositoryInfo = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$owner/$repository" -Headers $headers -TimeoutSec 30 -ErrorAction Stop
      if (-not $viewer.login -or $repositoryInfo.full_name -ne "$owner/$repository") { throw 'Token identity or repository access could not be verified.' }
    } catch {
      throw 'GitHub token was rejected or cannot access the repository. Create a valid PAT/fine-grained token with repository Actions write permission and try again; never paste the token into chat.'
    }
    $runsUri = "https://api.github.com/repos/$owner/$repository/actions/workflows/deploy.yml/runs?branch=$branch&event=workflow_dispatch&per_page=20"
    $baselineRunIds = @{}
    $baselineCaptured = $false
    try {
      $baselineRuns = Invoke-RestMethod -Method Get -Uri $runsUri -Headers $headers -TimeoutSec 30 -ErrorAction Stop
      foreach ($existingRun in @($baselineRuns.workflow_runs)) {
        $baselineRunIds[[string]$existingRun.id] = $true
      }
      $baselineCaptured = $true
    } catch {
      Write-Warning 'Existing workflow runs could not be listed before dispatch; commit and timestamp matching will be used.'
    }
    $headSha = (git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $headSha) { throw 'Unable to identify the Git commit being deployed.' }
    $dispatchStarted = (Get-Date).ToUniversalTime()
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body (@{ ref = $branch } | ConvertTo-Json) -TimeoutSec 30 | Out-Null
    Write-Host 'GitHub Actions deployment started.' -ForegroundColor Cyan
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
        $runs = Invoke-RestMethod -Method Get -Uri $runsUri -Headers $headers -TimeoutSec 30 -ErrorAction Stop
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
        $fallbackMatch = -not $baselineCaptured -and $_.head_sha -eq $headSha -and $createdAt -ge $discoveryCutoff
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
        return
      }
      if (-not $run) {
        $stage = if ($latestRun[0].status -eq 'queued') { 'Queued in GitHub Actions' } else { Get-WorkflowStage -RunId $latestRun[0].id -Headers $headers }
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
        return
      }
      throw 'Workflow did not start or could not be found. Check GitHub Actions.'
    }
    if ($run.conclusion -ne 'success') {
      $jobsUri = "https://api.github.com/repos/$owner/$repository/actions/runs/$($run.id)/jobs"
      $jobs = Invoke-RestMethod -Method Get -Uri $jobsUri -Headers $headers -TimeoutSec 30
      $failedJob = @($jobs.jobs | Where-Object { $_.conclusion -eq 'failure' } | Select-Object -First 1)
      $failedStep = @()
      if ($failedJob.Count -gt 0) {
        $failedStep = @($failedJob[0].steps | Where-Object { $_.conclusion -eq 'failure' } | Select-Object -First 1)
      }
      if ($failedJob.Count -gt 0 -and $failedStep.Count -gt 0) {
        Write-Host "Workflow failed at Job '$($failedJob[0].name)', Step '$($failedStep[0].name)'" -ForegroundColor Red
        $logArchive = Join-Path ([IO.Path]::GetTempPath()) ("deska-actions-job-$($failedJob[0].id).zip")
        $logFolder = Join-Path ([IO.Path]::GetTempPath()) ("deska-actions-job-$($failedJob[0].id)")
        try {
          $allLogLines = @()
          Invoke-WebRequest -Method Get -Uri "https://api.github.com/repos/$owner/$repository/actions/jobs/$($failedJob[0].id)/logs" -Headers $headers -OutFile $logArchive -TimeoutSec 30
          $logBytes = [IO.File]::ReadAllBytes($logArchive)
          $isZip = $logBytes.Length -ge 2 -and $logBytes[0] -eq 0x50 -and $logBytes[1] -eq 0x4B
          if ($isZip) {
            Expand-Archive -LiteralPath $logArchive -DestinationPath $logFolder -Force
            $logFiles = @(Get-ChildItem -LiteralPath $logFolder -File -Recurse)
            $failedStepName = [string]$failedStep[0].name
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
          # GitHub logs echo shell source lines before executing them. Requiring the
          # marker at the start of the log payload avoids reporting an unexecuted
          # `echo DESKA_DEPLOY_ERROR...` line as the cause of another step's failure.
          $diagnosticLines = @($allLogLines | Where-Object {
            $payload = $_ -replace '^\d{4}-\d{2}-\d{2}T[^ ]+Z\s*', ''
            $payload -match '^DESKA_DEPLOY_(STAGE|ERROR):'
          })
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
        throw "Workflow failed: $($run.html_url)"
      }
      throw "Workflow failed: $($run.html_url)"
    }
    Write-Host "Deployment completed successfully: $($run.html_url)" -ForegroundColor Green
  } finally {
    if ($tokenPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr) }
    $token = $null
  }
} else {
  Write-Host 'Changes are ready. Run deploy.bat with -AutoDispatch to start the server deployment.' -ForegroundColor Green
}
