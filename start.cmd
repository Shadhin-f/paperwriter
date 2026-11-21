@echo off
rem Double-click to start PaperWriter. The first run installs what it needs and opens your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo PaperWriter needs Node.js 22.9 or newer. Opening the download page...
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing PaperWriter. This takes a minute the first time...
  call npm install --no-fund --no-audit || (pause & exit /b 1)
)
set PW_OPEN=1
call npm start
pause
