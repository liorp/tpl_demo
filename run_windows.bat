@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title TPL Demo - Windows Bootstrap

echo ==================================================
echo TPL Demo Windows bootstrap
echo ==================================================

call :detect_winget
call :ensure_python
call :ensure_bun
call :install_dependencies
call :start_and_open

echo.
echo Bootstrap finished. If the app did not open yet, wait a few seconds and refresh.
exit /b 0

:detect_winget
where winget >nul 2>&1
if %errorlevel% neq 0 (
  set "HAS_WINGET=0"
  echo winget not found. Will use direct download fallback when needed.
  exit /b 0
)
set "HAS_WINGET=1"
exit /b 0

:ensure_python
echo.
echo [1/5] Checking Python...
where py >nul 2>&1
if %errorlevel% equ 0 (
  py -3 --version >nul 2>&1
  if %errorlevel% equ 0 (
    echo Python launcher found.
    exit /b 0
  )
)

where python >nul 2>&1
if %errorlevel% equ 0 (
  python --version >nul 2>&1
  if %errorlevel% equ 0 (
    echo Python found.
    exit /b 0
  )
)

if "%HAS_WINGET%"=="1" (
  echo Python not found. Installing Python 3.12 with winget...
  winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements --scope user
  if %errorlevel% equ 0 (
    goto :python_installed_check
  )
  echo winget Python install failed. Falling back to direct installer...
)

:python_direct_install
set "PYTHON_URL=https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
  set "PYTHON_URL=https://www.python.org/ftp/python/3.12.10/python-3.12.10-arm64.exe"
)

echo Installing Python from %PYTHON_URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $url='%PYTHON_URL%'; $out=Join-Path $env:TEMP 'python-installer.exe'; Invoke-WebRequest -Uri $url -OutFile $out; Start-Process -FilePath $out -ArgumentList '/quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_launcher=1' -Wait; Remove-Item $out -Force"
if %errorlevel% neq 0 (
  echo [ERROR] Python direct installation failed.
  pause
  exit /b 1
)

:python_installed_check
where py >nul 2>&1
if %errorlevel% equ 0 exit /b 0
where python >nul 2>&1
if %errorlevel% equ 0 exit /b 0

echo [ERROR] Python was installed but is not available in this shell yet.
echo Close this window and run this file again.
pause
exit /b 1

:ensure_bun
echo.
echo [2/5] Checking Bun...
where bun >nul 2>&1
if %errorlevel% equ 0 (
  set "BUN_EXE=bun"
  echo Bun found.
  exit /b 0
)

echo Bun not found. Installing Bun...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://bun.sh/install.ps1 | iex"
if %errorlevel% neq 0 (
  echo [ERROR] Bun installation failed.
  pause
  exit /b 1
)

if exist "%USERPROFILE%\.bun\bin\bun.exe" (
  set "BUN_EXE=%USERPROFILE%\.bun\bin\bun.exe"
  echo Bun installed at %BUN_EXE%.
  exit /b 0
)

where bun >nul 2>&1
if %errorlevel% equ 0 (
  set "BUN_EXE=bun"
  exit /b 0
)

echo [ERROR] Bun was installed but is not available in this shell yet.
echo Close this window and run this file again.
pause
exit /b 1

:install_dependencies
echo.
echo [3/5] Installing root Bun dependencies...
call "%BUN_EXE%" install
if %errorlevel% neq 0 (
  echo [ERROR] Failed to install root Bun dependencies.
  pause
  exit /b 1
)

echo.
echo [4/5] Installing frontend Bun dependencies...
cd frontend
call "%BUN_EXE%" install
if %errorlevel% neq 0 (
  echo [ERROR] Failed to install frontend Bun dependencies.
  pause
  exit /b 1
)
cd ..

echo.
echo [5/5] Installing backend Python dependencies...
call :run_python -m pip install --upgrade pip uv
if %errorlevel% neq 0 (
  echo [ERROR] Failed to install pip/uv.
  pause
  exit /b 1
)
call :run_python -m uv sync --project backend --extra dev
if %errorlevel% neq 0 (
  echo [ERROR] Failed to install backend dependencies.
  pause
  exit /b 1
)

exit /b 0

:start_and_open
echo.
echo Starting frontend+backend in a new window...
start "TPL Demo Dev" cmd /k "cd /d \"%~dp0\" && \"%BUN_EXE%\" run dev"

echo Waiting for startup...
timeout /t 8 /nobreak >nul

echo Opening Chrome on http://localhost:8080 ...
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "http://localhost:8080"
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "http://localhost:8080"
  exit /b 0
)
start "" chrome "http://localhost:8080"
exit /b 0

:run_python
where py >nul 2>&1
if %errorlevel% equ 0 (
  py -3 %*
  exit /b %errorlevel%
)
python %*
exit /b %errorlevel%
