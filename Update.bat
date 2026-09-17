@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   Deska News - Update from GitHub
echo ========================================
echo.

git pull origin main
if errorlevel 1 (
    echo git pull failed.
    pause
    exit /b 1
)

call "%~dp0Install.bat"
if errorlevel 1 exit /b 1

echo.
echo Starting Deska News...
call "%~dp0Run.bat"
exit /b %ERRORLEVEL%
