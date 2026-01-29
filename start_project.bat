@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Runs both API and Web dev servers on Windows.
REM - Installs dependencies if needed
REM - Starts: apps/api (tsx watch) and apps/web (vite)

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js bulunamadi. Lutfen Node.js yukleyin: https://nodejs.org
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm bulunamadi. Node.js kurulumu bozuk olabilir.
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] Root package.json bulunamadi. Dogru klasorde misiniz?
  exit /b 1
)

REM Ensure root deps (concurrently lives here)
if not exist "node_modules" (
  echo [INFO] Root bagimliliklari yukleniyor - npm install...
  call npm install
  if errorlevel 1 exit /b 1
)

REM Ensure API deps
if not exist "apps\api\package.json" (
  echo [ERROR] apps\api\package.json bulunamadi.
  exit /b 1
)
if not exist "apps\api\node_modules" (
  echo [INFO] API bagimliliklari yukleniyor - apps\api...
  call npm --prefix "apps\api" install
  if errorlevel 1 exit /b 1
)

REM Ensure WEB deps
if not exist "apps\web\package.json" (
  echo [ERROR] apps\web\package.json bulunamadi.
  exit /b 1
)
if not exist "apps\web\node_modules" (
  echo [INFO] Web bagimliliklari yukleniyor - apps\web...
  call npm --prefix "apps\web" install
  if errorlevel 1 exit /b 1
)

echo.
echo [INFO] API + WEB dev sunuculari baslatiliyor...
echo - API: npm --prefix apps/api run dev
echo - WEB: npm --prefix apps/web run dev
echo.

call npx concurrently -k -n "API,WEB" -c "cyan,green" "npm --prefix apps/api run dev" "npm --prefix apps/web run dev"

exit /b %errorlevel%
