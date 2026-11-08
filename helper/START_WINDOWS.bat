@echo off
setlocal
cd /d "%~dp0"
title StreamCatch v1.2.1 - Auto Connect Local Engine
where py >nul 2>&1
if %errorlevel%==0 (
  set "PYTHON=py -3"
) else (
  where python >nul 2>&1
  if %errorlevel%==0 (
    set "PYTHON=python"
  ) else (
    echo Python 3 is required. Install Python from https://www.python.org/downloads/
    echo During installation, select Add python.exe to PATH.
    pause
    exit /b 1
  )
)
echo.
echo [StreamCatch] Checking downloader dependencies...
%PYTHON% -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Installation failed. Check internet access and Python pip.
  echo You can run TROUBLESHOOT_WINDOWS.bat for connection checks.
  pause
  exit /b 1
)
echo.
%PYTHON% server.py
if errorlevel 1 (
  echo StreamCatch stopped with an error.
  pause
)
endlocal
