@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   Deska News
echo ========================================
echo.
echo Starting PostgreSQL + API + Web in development mode (Hot Reload)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" -SkipSeed -FreshWebCache
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
    echo Startup failed. Check the message above.
    echo.
    pause
    exit /b %EXITCODE%
)

echo Deska News is running at http://localhost:3100/login
start "" "http://localhost:3100/login"
exit /b 0
