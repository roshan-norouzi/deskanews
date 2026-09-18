@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Installing dependencies...
echo.

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
    echo pnpm not found. Install Node.js 20+ then run: npm install -g pnpm
    pause
    exit /b 1
)

echo Stopping running Deska processes before install...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev.ps1"
if errorlevel 1 (
    echo Warning: could not stop all development processes cleanly.
)

call pnpm.cmd install
if errorlevel 1 goto :failed

echo.
echo Building shared package and Prisma client...
call pnpm.cmd --filter @deska/shared build
if errorlevel 1 goto :failed

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prisma-generate.ps1"
if errorlevel 1 goto :failed

set EXITCODE=0
goto :done

:failed
set EXITCODE=1

:done
echo.
if not "%EXITCODE%"=="0" (
  echo Install failed.
  echo Tip: close any open Deska/API/Next.js windows, then run Update.bat again.
  pause
  exit /b %EXITCODE%
)

echo Done.
exit /b 0
