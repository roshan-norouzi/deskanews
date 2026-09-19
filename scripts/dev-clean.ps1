# Kill dev ports and start full stack fresh
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& (Join-Path $root 'scripts/restart-web.ps1')
exit $LASTEXITCODE
