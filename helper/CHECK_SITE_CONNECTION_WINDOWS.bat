@echo off
setlocal
cd /d "%~dp0"
title StreamCatch - Website Connection Test
where py >nul 2>&1
if not errorlevel 1 (
  py -3 check_connection.py
) else (
  python check_connection.py
)
echo.
pause
endlocal
