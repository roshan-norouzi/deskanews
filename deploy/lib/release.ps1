function Assert-ReleaseBranch {
  param([PSCustomObject]$Config)

  $branch = (Assert-Git rev-parse --abbrev-ref HEAD).Text
  if ($branch -ne $Config.branch) {
    throw "Deploys are made from '$($Config.branch)' only, but this folder is on '$branch'. Switch with: git switch $($Config.branch)"
  }
  $gitDir = (Assert-Git rev-parse --git-dir).Text
  foreach ($marker in 'MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD') {
    if (Test-Path (Join-Path $gitDir $marker)) {
      throw "A git merge/rebase is in progress ($marker). Finish or abort it first."
    }
  }
}

# Typecheck needs no running servers or database, so it only fails when the code is actually broken.
function Invoke-LocalCheck {
  param([PSCustomObject]$Config)

  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm is not installed or not in PATH.' }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & pnpm --filter @deska/api db:generate *> $null
    if ($LASTEXITCODE -ne 0) { Write-Info 'Prisma client not regenerated (dev API is probably running); using the existing client.' }
    $sharedOutput = & pnpm --filter @deska/shared build 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { $sharedOutput | Select-Object -Last 30 | ForEach-Object { Write-Host "  $_" }; throw 'packages/shared does not build. Fix the errors above, then deploy again.' }
    $typecheckOutput = & pnpm typecheck 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) {
      $typecheckOutput | Where-Object { $_ -match 'error TS|ERR_' } | Select-Object -First 30 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
      throw 'TypeScript errors found. Nothing was committed or published. Fix them, then deploy again.'
    }
  } finally {
    $ErrorActionPreference = $previous
  }
  Write-Ok 'Code compiles.'
}

function Get-RemoteReleaseTags {
  param([PSCustomObject]$Config)
  $result = Invoke-WithRetry -What 'Read tags from GitHub' -Action { Assert-Git ls-remote --tags --refs origin 'v*' }
  return @($result.Output | ForEach-Object { ($_ -split '\s+')[1] -replace '^refs/tags/', '' } | Where-Object { $_ })
}

function Get-NextFreeVersion {
  param([string]$Version, [string[]]$TakenTags)

  $highest = [version]$Version
  foreach ($tag in $TakenTags) {
    if ($tag -match '^v(\d+\.\d+\.\d+)$' -and [version]$Matches[1] -gt $highest) { $highest = [version]$Matches[1] }
  }
  $candidate = "$($highest.Major).$($highest.Minor).$($highest.Build + 1)"
  while ($TakenTags -contains "v$candidate") {
    $parts = [version]$candidate
    $candidate = "$($parts.Major).$($parts.Minor).$($parts.Build + 1)"
  }
  return $candidate
}

function New-ReleaseCommit {
  param([PSCustomObject]$Config, [string]$Version, [string]$Message, [switch]$Amend)
  Write-ReleaseVersion -ProjectRoot $Config.projectRoot -Version $Version
  Assert-Git add -A | Out-Null
  if (-not $Message) { $Message = "Release v$Version" }
  $commitArgs = @('commit', '--quiet', '-m', $Message)
  if ($Amend) { $commitArgs += '--amend' }
  $commit = Invoke-Git @commitArgs
  if ($commit.ExitCode -ne 0) {
    if ($commit.Text -match 'user\.(name|email)|Please tell me who you are') {
      throw 'Git does not know your name/email. Run once: git config --global user.name "Your Name"; git config --global user.email "you@example.com"'
    }
    throw "git commit failed:`n$($commit.Text)"
  }
}

function Test-TreeHasChanges {
  Assert-Git add -A | Out-Null
  return (Invoke-Git diff --cached --quiet).ExitCode -ne 0
}

function Sync-WithRemoteBranch {
  param([PSCustomObject]$Config)
  $behind = [int](Assert-Git rev-list --count "HEAD..origin/$($Config.branch)").Text
  if ($behind -eq 0) { return }
  Write-Info "GitHub has $behind commit(s) that are not here yet; replaying local commits on top."
  $rebase = Invoke-Git rebase --quiet "origin/$($Config.branch)"
  if ($rebase.ExitCode -ne 0) {
    Invoke-Git rebase --abort | Out-Null
    throw "Local commits conflict with newer commits on GitHub. Nothing was published. Resolve with: git pull --rebase origin $($Config.branch)`n$($rebase.Text)"
  }
}

# Result: HEAD is committed, based on origin/main, and carries an annotated tag v<VERSION>.
# Every branch below is idempotent, so re-running after any failure resumes instead of bumping again.
function Resolve-Release {
  param([PSCustomObject]$Config, [string]$Message)

  Invoke-WithRetry -What 'Fetch from GitHub' -Action {
    Assert-Git fetch --quiet origin "+refs/heads/$($Config.branch):refs/remotes/origin/$($Config.branch)" | Out-Null
  }
  $remoteTags = Get-RemoteReleaseTags -Config $Config
  $localTags = @((Assert-Git tag --list 'v*').Output)
  # Whatever VERSION is on GitHub main has been released, even from before releases were tagged.
  $publishedVersion = (Invoke-Git show "origin/$($Config.branch):VERSION").Text.Trim().TrimStart([char]0xFEFF)
  $publishedTags = @($remoteTags)
  if ($publishedVersion -match '^\d+\.\d+\.\d+$') { $publishedTags += "v$publishedVersion" }
  $takenTags = @($publishedTags + $localTags | Select-Object -Unique)

  # Local edits are committed before the rebase and numbered after it, so a VERSION
  # change on GitHub can never conflict with the number chosen here.
  $hasNewCommit = Test-TreeHasChanges
  if ($hasNewCommit) {
    New-ReleaseCommit -Config $Config -Version (Read-ReleaseVersion -ProjectRoot $Config.projectRoot) -Message $Message
  }

  Sync-WithRemoteBranch -Config $Config

  $version = Read-ReleaseVersion -ProjectRoot $Config.projectRoot
  $tag = "v$version"
  $headSha = (Assert-Git rev-parse HEAD).Text
  $tagSha = (Invoke-Git rev-parse --verify --quiet "refs/tags/$tag^{commit}").Text

  $tagIsReleasedHistory = ($publishedTags -contains $tag) -or ($tagSha -and (Invoke-Git merge-base --is-ancestor $tagSha $headSha).ExitCode -eq 0)

  if ($hasNewCommit) {
    if ($takenTags -contains $tag) {
      $version = Get-NextFreeVersion -Version $version -TakenTags $takenTags
      $tag = "v$version"
    }
    New-ReleaseCommit -Config $Config -Version $version -Message $Message -Amend
    $headSha = (Assert-Git rev-parse HEAD).Text
    Assert-Git tag -f -a $tag -m "Release $tag" | Out-Null
    Write-Info "Committed local changes as $tag."
  } elseif ($tagSha -eq $headSha) {
    Write-Info "$tag already points at the current commit."
  } elseif ($tagIsReleasedHistory) {
    # HEAD has code newer than v$version: it gets a new number so a version never means two different builds.
    $version = Get-NextFreeVersion -Version $version -TakenTags $takenTags
    $tag = "v$version"
    New-ReleaseCommit -Config $Config -Version $version -Message $Message
    $headSha = (Assert-Git rev-parse HEAD).Text
    Assert-Git tag -a $tag -m "Release $tag" | Out-Null
  } else {
    # Tag is new, or local-only from an interrupted run whose commit was replaced by a rebase.
    Assert-Git tag -f -a $tag -m "Release $tag" | Out-Null
  }

  return [PSCustomObject]@{ Version = $version; Tag = $tag; Sha = $headSha; RemoteTags = $remoteTags }
}

function Publish-Release {
  param([PSCustomObject]$Config, [PSCustomObject]$Release)

  $localTags = @((Assert-Git tag --list 'v*').Output)
  $refspecs = @("refs/heads/$($Config.branch):refs/heads/$($Config.branch)")
  $refspecs += @($localTags | Where-Object { $Release.RemoteTags -notcontains $_ } | ForEach-Object { "refs/tags/${_}:refs/tags/${_}" })

  try {
    Invoke-WithRetry -What 'Push to GitHub' -IsFatal {
      param($failure)
      "$($failure.Exception.Message)" -match 'rejected|non-fast-forward|fetch first|protected branch|Authentication failed|403'
    } -Action {
      Assert-Git push --atomic --quiet origin @refspecs | Out-Null
    }
  } catch {
    if ("$($_.Exception.Message)" -match 'rejected|fetch first|non-fast-forward') {
      throw "GitHub main changed while publishing. Nothing was deployed; run deploy again and it will include those changes.`n$($_.Exception.Message)"
    }
    throw
  }
  Write-Ok "GitHub main and tag $($Release.Tag) are up to date."
}

function Invoke-ProductionSmokeTest {
  param([PSCustomObject]$Config, [string]$ExpectedVersion)

  $baseUrl = $Config.publicUrl
  $deadline = (Get-Date).AddMinutes(3)
  $lastProblem = ''
  while ($true) {
    try {
      $ready = Invoke-RestMethod -Uri "$baseUrl/api/health/ready" -TimeoutSec 20 -UseBasicParsing
      if ($ready.status -ne 'ok' -or $ready.ready -ne $true) { throw 'API is not ready' }
      if ($ExpectedVersion -and $ready.version -ne $ExpectedVersion) { throw "API reports version $($ready.version), expected $ExpectedVersion" }
      $login = Invoke-WebRequest -Uri "$baseUrl/login" -TimeoutSec 20 -UseBasicParsing
      if ($login.StatusCode -ne 200 -or $login.Content -match 'Internal Server Error') { throw "/login returned HTTP $($login.StatusCode)" }
      Write-Ok "$baseUrl is live on version $($ready.version)."
      return
    } catch {
      $lastProblem = Get-ErrorSummary $_
      if ((Get-Date) -ge $deadline) { break }
      Start-Sleep -Seconds 10
    }
  }
  throw "The server deploy succeeded, but $baseUrl does not look healthy from here: $lastProblem"
}
