@echo off
rem Petaken: generate announcer voices with VOICEVOX (start the VOICEVOX app first).
rem Usage: double-click. To choose a voice, run from a terminal:  this.bat zundamon-name
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
python kakutou\tools\make_announcer.py %1
echo.
pause
