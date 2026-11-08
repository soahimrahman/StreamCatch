@echo off
setlocal
cd /d "%~dp0"
title StreamCatch - Disable Auto-Start

echo =====================================================================
echo    StreamCatch - Disable Auto-Start & One-Click Registry
echo =====================================================================
echo.

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\StreamCatch_Engine.lnk"
if exist "%SHORTCUT_PATH%" (
  del /f /q "%SHORTCUT_PATH%" >nul 2>&1
  echo  [OK] Windows startup shortcut removed.
)

reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.streamcatch.engine" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.streamcatch.engine" /f >nul 2>&1
reg delete "HKCU\Software\Classes\streamcatch" /f >nul 2>&1
echo  [OK] Native Messaging and streamcatch:// protocol removed.

echo.
echo Stopping running engine...
call "helper\stop_engine.bat"

echo.
echo Auto-start has been disabled. You can still run START_STREAMCATCH_WINDOWS.bat manually anytime.
echo.
pause
endlocal
