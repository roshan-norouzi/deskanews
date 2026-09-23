function Write-Step {
  param([string]$Text)
  Write-Host ''
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Text)
  Write-Host "    $Text" -ForegroundColor DarkGray
}

function Write-Ok {
  param([string]$Text)
  Write-Host "    $Text" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Text)
  Write-Host "    $Text" -ForegroundColor Yellow
}

function Format-Elapsed {
  param([TimeSpan]$Elapsed)
  return ('{0:mm\:ss}' -f $Elapsed)
}

function Get-ErrorSummary {
  param($ErrorRecord)
  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) { return $ErrorRecord.ErrorDetails.Message.Trim() }
  return $ErrorRecord.Exception.Message.Trim()
}

function Get-HttpStatus {
  param($ErrorRecord)
  try { return [int]$ErrorRecord.Exception.Response.StatusCode } catch { return 0 }
}

# Network calls from Iran to GitHub drop regularly for seconds or minutes.
# Every remote operation goes through this so a short outage never fails a deploy.
function Invoke-WithRetry {
  param(
    [Parameter(Mandatory)][scriptblock]$Action,
    [Parameter(Mandatory)][string]$What,
    [int]$MaxAttempts = 6,
    [scriptblock]$IsFatal
  )

  for ($retryAttempt = 1; ; $retryAttempt++) {
    try {
      return & $Action
    } catch {
      if ($IsFatal -and (& $IsFatal $_)) { throw }
      if ($retryAttempt -ge $MaxAttempts) { throw }
      $retryDelay = [Math]::Min(60, 5 * [Math]::Pow(2, $retryAttempt - 1))
      Write-Warn "$What failed (attempt $retryAttempt/$MaxAttempts): $(Get-ErrorSummary $_)"
      Write-Warn "Retrying in $retryDelay seconds..."
      Start-Sleep -Seconds $retryDelay
    }
  }
}

# Windows PowerShell turns native stderr into terminating errors when
# $ErrorActionPreference is Stop; git writes harmless warnings there.
function Invoke-Git {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(& git @args 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  return [PSCustomObject]@{ ExitCode = $code; Output = $output; Text = ($output -join "`n").Trim() }
}

function Assert-Git {
  $result = Invoke-Git @args
  if ($result.ExitCode -ne 0) {
    throw "git $($args -join ' ') failed:`n$($result.Text)"
  }
  return $result
}

function Initialize-Repository {
  param([string]$ProjectRoot)

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is not installed or is not available in PATH.'
  }
  Set-Location $ProjectRoot
  if ((Invoke-Git rev-parse --show-toplevel).ExitCode -ne 0) { throw 'This folder is not a Git repository.' }
  if ((Invoke-Git ls-files .env).Text) { throw '.env is tracked by Git. Remove it from tracking before publishing.' }
}

function Read-ReleaseVersion {
  param([string]$ProjectRoot)
  $raw = [IO.File]::ReadAllText((Join-Path $ProjectRoot 'VERSION'))
  $version = $raw.Trim().TrimStart([char]0xFEFF)
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "VERSION must use x.y.z format; found '$version'." }
  return $version
}

function Write-ReleaseVersion {
  param([string]$ProjectRoot, [string]$Version)
  [IO.File]::WriteAllText((Join-Path $ProjectRoot 'VERSION'), $Version, [Text.UTF8Encoding]::new($false))
}
