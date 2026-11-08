@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title StreamCatch - Auto-Start and One-Click Launch Setup

echo =====================================================================
echo    StreamCatch Universal Video Downloader - Auto-Start Setup
echo =====================================================================
echo.
echo Setting up silent background engine and in-extension one-click launch...
echo.

:: 1. Register Native Messaging Host for Google Chrome
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.streamcatch.engine" /ve /t REG_SZ /d "%~dp0helper\com.streamcatch.engine.json" /f >nul 2>&1
if %errorlevel%==0 (
  echo  [OK] Google Chrome Native Messaging registered.
) else (
  echo  [WARN] Chrome registry entry skipped.
)

:: 2. Register Native Messaging Host for Microsoft Edge
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.streamcatch.engine" /ve /t REG_SZ /d "%~dp0helper\com.streamcatch.engine.json" /f >nul 2>&1
if %errorlevel%==0 (
  echo  [OK] Microsoft Edge Native Messaging registered.
) else (
  echo  [WARN] Edge registry entry skipped.
)

:: 3. Register Custom Protocol (streamcatch://start) as fallback for any browser
reg add "HKCU\Software\Classes\streamcatch" /ve /t REG_SZ /d "URL:StreamCatch Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\streamcatch" /v "URL Protocol" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\streamcatch\shell\open\command" /ve /t REG_SZ /d "wscript.exe \"%~dp0helper\start_silent.vbs\"" /f >nul 2>&1
echo  [OK] streamcatch:// protocol handler registered.

:: 4. Add silent auto-start shortcut to Windows Startup folder
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\StreamCatch_Engine.lnk"
set "TARGET_VBS=%~dp0helper\start_silent.vbs"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_VBS%\"'; $s.WorkingDirectory = '%~dp0helper'; $s.Description = 'StreamCatch Local Downloader Engine'; $s.Save()" >nul 2>&1

if exist "%SHORTCUT_PATH%" (
  echo  [OK] Auto-start with Windows enabled.
) else (
  echo  [WARN] Could not create startup shortcut.
)

:: 5. Launch engine silently now
echo.
echo Starting StreamCatch local engine in the background...
wscript.exe "%~dp0helper\start_silent.vbs"
timeout /t 2 /nobreak >nul 2>&1

echo.
echo =====================================================================
echo  SUCCESS! StreamCatch is now configured:
echo   1. The engine starts automatically when Windows boots.
echo   2. You can click 'Start Engine' directly inside the extension.
echo   3. No command prompt windows will clutter your screen.
echo   4. To stop the engine anytime, double-click STOP_STREAMCATCH_WINDOWS.bat
echo =====================================================================
echo.
pause
endlocal
