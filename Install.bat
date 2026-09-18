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

call pnpm.cmd install
if errorlevel 1 goto :failed

echo.
echo Building shared package and Prisma client...
call pnpm.cmd --filter @deska/shared build
if errorlevel 1 goto :failed
call pnpm.cmd --filter @deska/api db:generate
if errorlevel 1 goto :failed

set EXITCODE=0
goto :done

:failed
set EXITCODE=1

:done
echo.
if not "%EXITCODE%"=="0" (
  echo Install failed.
  pause
  exit /b %EXITCODE%
)

echo Done.
exit /b 0
