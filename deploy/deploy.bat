@echo off
setlocal
cd /d "%~dp0.."
set "DESKA_COMMAND=%~1"
if /i "%DESKA_COMMAND%"=="status" goto run
if /i "%DESKA_COMMAND%"=="smoke" goto run
if /i "%DESKA_COMMAND%"=="token" goto run
if /i "%DESKA_COMMAND%"=="help" goto run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" release %*
goto done
:run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
:done
set "DESKA_EXIT=%errorlevel%"
echo.
if "%DESKA_EXIT%"=="0" (echo Finished.) else (echo Deploy did not complete. The reason is shown above; running deploy again resumes safely.)
if not defined DESKA_NO_PAUSE pause
exit /b %DESKA_EXIT%
