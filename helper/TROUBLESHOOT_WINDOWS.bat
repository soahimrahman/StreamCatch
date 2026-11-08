@echo off
setlocal
cd /d "%~dp0"
title StreamCatch - Connection Diagnostics
cls
echo ===========================================================
echo   StreamCatch - Local Engine Connection Diagnostics
echo ===========================================================
echo.
echo [1/3] Checking the local engine on port 8735...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:8735/health';try{$r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 4 -ErrorAction Stop;Write-Host ('HTTP '+[int]$r.StatusCode+' - Server is responding') -ForegroundColor Green}catch{if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode;if($code -eq 403){Write-Host 'GOOD: HTTP 403 Extension required = Engine is RUNNING.' -ForegroundColor Green}elseif($code -eq 401){Write-Host 'GOOD: HTTP 401 = Engine is RUNNING.' -ForegroundColor Green}else{Write-Host ('HTTP '+$code+': Server answered but returned an error') -ForegroundColor Yellow}}else{Write-Host 'NOT RUNNING: Cannot connect to 127.0.0.1:8735.' -ForegroundColor Red;Write-Host 'Start START_WINDOWS.bat and leave the window open.'}}"
echo.
echo [2/3] Checking whether port 8735 is in use...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort 8735 -State Listen -ErrorAction SilentlyContinue; if($c){Write-Host ('Port 8735 used by process ID: '+(($c.OwningProcess|Sort-Object -Unique) -join ', '))}else{Write-Host 'No process is listening on port 8735'}"
echo.
echo [3/3] Checking Python...
where py >nul 2>&1
if not errorlevel 1 (py -3 --version 2>nul) else (python --version 2>nul)
echo.
echo No pairing key is needed with StreamCatch v1.2.1.
echo If status is GOOD, remove the old extension and load
echo the new extension folder at chrome://extensions.
echo.
pause
endlocal
