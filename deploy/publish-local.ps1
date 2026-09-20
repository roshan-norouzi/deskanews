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

# Backward-compatible wrapper. Prefer: .\deploy\deploy.ps1 release
$deployScript = Join-Path $PSScriptRoot 'deploy.ps1'
$argsList = @('-File', $deployScript, 'release')
if ($Message) { $argsList += @('-Message', $Message) }
if ($NoVersionBump) { $argsList += '-NoVersionBump' }
if ($SkipSystemExport) { $argsList += '-SkipSystemExport' }
if ($NoWait) { $argsList += '-NoWait' }
if ($MaximumWaitMinutes -ne 65) { $argsList += @('-MaximumWaitMinutes', $MaximumWaitMinutes) }
if (-not $AutoDispatch) { $argsList += '-NoDispatch' }

& powershell -NoProfile -ExecutionPolicy Bypass @argsList
exit $LASTEXITCODE
