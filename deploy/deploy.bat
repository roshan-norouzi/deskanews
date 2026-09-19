@echo off
setlocal
cd /d "%~dp0.."
echo DESKA one-click deployment
echo =========================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-local.ps1" -AutoDispatch %*
if errorlevel 1 (
  echo.
  echo Deployment failed. Review the error above.
  pause
  exit /b 1
)
echo.
echo Deployment request sent successfully.
pause
