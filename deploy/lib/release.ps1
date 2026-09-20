function Test-SystemObservanceSnapshot {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    $snapshot = @(Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
    return $snapshot.Count -gt 0
  } catch {
    return $false
  }
}

function Invoke-SystemObservanceExport {
  param([string]$ScriptPath)
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

function Export-SystemObservances {
  param(
    [string]$ProjectRoot,
    [switch]$SkipSystemExport
  )

  if ($SkipSystemExport) {
    Write-Host 'Skipping system observance export.' -ForegroundColor DarkGray
    return
  }

  $prismaPath = Join-Path $ProjectRoot 'apps/api/prisma'
  $exportScriptPath = Join-Path $prismaPath 'export-system-observances.cjs'

  if (-not (Test-Path -LiteralPath $exportScriptPath -PathType Leaf)) {
    Write-Host 'System observance export is not used in Deska News (legacy ERP step skipped).' -ForegroundColor DarkGray
    return
  }

  Write-Host 'Exporting local system observances...' -ForegroundColor Cyan
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
        try {
          $bytes = [Convert]::FromBase64String($encoded)
          $json = [Text.Encoding]::UTF8.GetString($bytes)
        } catch {
          throw 'Export did not return valid UTF-8 data.'
        }
        if (-not $json.Trim().StartsWith('[')) { throw 'Export did not return valid JSON.' }
        [IO.File]::WriteAllBytes($snapshotPath, $bytes)
        Write-Host 'System observances exported.' -ForegroundColor Green
      } else {
        $databaseUnavailable = $diagnostic -match 'P1001|Can''t reach database server|ECONNREFUSED|connection refused'
        $scriptMissing = $diagnostic -match 'Cannot find module|MODULE_NOT_FOUND'
        if ($scriptMissing) {
          Write-Host 'System observance export script is unavailable; continuing without it.' -ForegroundColor DarkGray
        } elseif ($databaseUnavailable -and (Test-SystemObservanceSnapshot $snapshotPath)) {
          $snapshotDate = (Get-Item -LiteralPath $snapshotPath).LastWriteTime.ToString('yyyy-MM-dd HH:mm')
          Write-Warning "Local PostgreSQL is unavailable; using the existing system-observances.json snapshot from $snapshotDate."
        } elseif ($databaseUnavailable) {
          throw 'Local PostgreSQL is unavailable and no valid system-observances.json snapshot exists. Start DESKA once, then retry deployment.'
        } else {
          throw "Unable to export system observances: $($diagnostic.Trim())"
        }
      }
    }
  } catch {
    throw "System observance export failed: $($_.Exception.Message)"
  }
}

function Bump-ReleaseVersion {
  param(
    [string]$ProjectRoot,
    [switch]$NoVersionBump
  )

  if ($NoVersionBump) { return $null }

  $versionPath = Join-Path $ProjectRoot 'VERSION'
  $current = (Get-Content $versionPath -Raw).Trim()
  $parts = $current -split '\.'
  $invalidParts = @($parts | Where-Object { $_ -notmatch '^\d+$' })
  if ($parts.Count -ne 3 -or $invalidParts.Count -gt 0) {
    throw "Invalid VERSION value: $current"
  }

  $next = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
  [IO.File]::WriteAllText($versionPath, $next, [Text.UTF8Encoding]::new($false))
  Write-Host "Version bumped to $next." -ForegroundColor Cyan
  return $next
}

function Push-BranchWithRetry {
  param([string]$Branch)

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

function Invoke-ReleaseCommitAndPush {
  param(
    [PSCustomObject]$Config,
    [string]$Message = '',
    [switch]$NoVersionBump
  )

  $status = @(git status --porcelain)
  $hasNewCommit = $false

  if ($status.Count -gt 0) {
    $bumpedVersion = Bump-ReleaseVersion -ProjectRoot $Config.projectRoot -NoVersionBump:$NoVersionBump
    if ($bumpedVersion -and -not (Test-ChangelogContainsVersion -ProjectRoot $Config.projectRoot -Version $bumpedVersion)) {
      Write-Warning "CHANGELOG.md does not mention v$bumpedVersion yet. Add a release note before or after deploy."
    }

    git add -A
    if ($LASTEXITCODE -ne 0) { throw 'Unable to stage changes.' }
    if (-not $Message) {
      $Message = "Release v$(Get-CurrentVersion -ProjectRoot $Config.projectRoot)"
    }
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create commit.' }
    $hasNewCommit = $true
  }

  git rev-parse --verify --quiet "refs/remotes/origin/$($Config.branch)" *> $null
  if ($LASTEXITCODE -eq 0) {
    $aheadCount = [int](git rev-list --count "origin/$($Config.branch)..HEAD")
  } else {
    $aheadCount = 1
  }

  if ($hasNewCommit -or $aheadCount -gt 0) {
    Push-BranchWithRetry $Config.branch
    Write-Host 'Changes pushed to GitHub.' -ForegroundColor Green
    return $true
  }

  Write-Host "No local changes to push; using the current $($Config.branch) branch." -ForegroundColor Yellow
  return $false
}
