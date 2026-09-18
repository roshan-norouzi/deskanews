@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   Deska News - Update from GitHub
echo ========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo Git not found. Install Git for Windows first: https://git-scm.com/download/win
    pause
    exit /b 1
)

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
    echo pnpm not found. Install Node.js 20+ then run: npm install -g pnpm
    pause
    exit /b 1
)

if not exist "%~dp0Install.bat" (
    echo Install.bat not found in project root: %~dp0
    pause
    exit /b 1
)

if not exist "%~dp0Run.bat" (
    echo Run.bat not found in project root: %~dp0
    pause
    exit /b 1
)

echo Pulling latest changes from main...
git pull origin main
if errorlevel 1 (
    echo git pull failed.
    pause
    exit /b 1
)

echo.
echo Stopping running Deska processes before update...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev.ps1"

call "%~dp0Install.bat"
if errorlevel 1 exit /b 1

echo.
echo Starting Deska News...
call "%~dp0Run.bat"
exit /b %ERRORLEVEL%
