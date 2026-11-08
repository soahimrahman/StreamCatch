@echo off
setlocal
cd /d "%~dp0"

:: If port 8735 is already listening, do not launch a second instance
netstat -ano | findstr ":8735" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  exit /b 0
)

where.exe py >nul 2>&1
if %errorlevel%==0 (
  set "PYTHON=py -3"
) else (
  where.exe python >nul 2>&1
  if %errorlevel%==0 (
    set "PYTHON=python"
  ) else (
    exit /b 1
  )
)

%PYTHON% server.py
endlocal
