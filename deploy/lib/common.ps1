function Format-Elapsed {
  param([TimeSpan]$Elapsed)
  return ('{0:mm\:ss}' -f $Elapsed)
}

function Ensure-GitRepository {
  param([string]$ProjectRoot)

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is not installed or is not available in PATH.'
  }

  Set-Location $ProjectRoot
  git rev-parse --show-toplevel *> $null
  if ($LASTEXITCODE -ne 0) { throw 'This folder is not a Git repository.' }

  $trackedEnv = @(git ls-files .env 2>$null)
  if ($trackedEnv.Count -gt 0) {
    throw '.env is tracked by Git. Remove it from tracking before publishing.'
  }
}

function Get-CurrentVersion {
  param([string]$ProjectRoot)
  $versionPath = Join-Path $ProjectRoot 'VERSION'
  return (Get-Content $versionPath -Raw).Trim()
}

function Test-ChangelogContainsVersion {
  param(
    [string]$ProjectRoot,
    [string]$Version
  )

  $changelogPath = Join-Path $ProjectRoot 'CHANGELOG.md'
  if (-not (Test-Path $changelogPath)) { return $false }
  $changelog = Get-Content $changelogPath -Raw
  return $changelog -match "##\s+$Version\b"
}
