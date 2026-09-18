$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& (Join-Path $root 'scripts/start-dev.ps1') -StopOnly -SkipMigrate -SkipSeed
