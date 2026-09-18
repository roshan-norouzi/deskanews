$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& cmd.exe /d /c "`"$PSScriptRoot\Update.bat`""
exit $LASTEXITCODE
