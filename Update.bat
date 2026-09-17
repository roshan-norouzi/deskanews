@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   Deska News - Update from GitHub
echo ========================================
echo.
echo This will pull latest code, install packages, run migrations, and restart.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-local.ps1" -SkipSeed
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
    echo Update failed. Check the message above.
    echo.
    pause
    exit /b %EXITCODE%
)

echo Opening http://localhost:3100/login ...
start "" "http://localhost:3100/login"
exit /b 0
