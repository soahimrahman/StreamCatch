@echo off
setlocal
echo [StreamCatch] Stopping local engine on port 8735...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8735" ^| findstr "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
  echo [OK] Stopped process PID %%a
)
echo StreamCatch engine is stopped.
endlocal
