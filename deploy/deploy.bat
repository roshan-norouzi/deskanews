@echo off
setlocal
cd /d "%~dp0.."
echo DESKA deploy
echo ============
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" release %*
if errorlevel 1 (
  echo.
  echo Deployment failed. Review the error above.
  pause
  exit /b 1
)
echo.
echo Deployment finished.
pause
