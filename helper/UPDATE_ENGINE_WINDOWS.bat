@echo off
setlocal
cd /d "%~dp0"
title StreamCatch - Update Download Engine
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -m pip install --upgrade yt-dlp imageio-ffmpeg
) else (
  python -m pip install --upgrade yt-dlp imageio-ffmpeg
)
echo.
echo Done. Close any running helper and restart START_STREAMCATCH_WINDOWS.bat to use the update.
pause
endlocal
