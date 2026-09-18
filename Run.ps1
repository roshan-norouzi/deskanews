$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& cmd.exe /d /c "`"$PSScriptRoot\Run.bat`""
exit $LASTEXITCODE
