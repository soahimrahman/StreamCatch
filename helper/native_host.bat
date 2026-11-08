@echo off
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "%~dp0native_host.py"
) else (
  python "%~dp0native_host.py"
)
