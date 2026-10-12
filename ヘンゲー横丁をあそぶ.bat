@echo off
rem Henge Yokocho: start local server (minimized window) and open the hub page in the browser.
rem Close the "yokocho-server" window to stop the server.
cd /d "%~dp0"
powershell -NoProfile -Command "if(-not (Get-NetTCPConnection -LocalPort 8123 -State Listen -ErrorAction SilentlyContinue)){ exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "yokocho-server" /min python serve.py
  timeout /t 2 /nobreak >nul
)
start "" "http://localhost:8123/index.html"
