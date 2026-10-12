@echo off
rem Petaken: run the automated tests (Node) and open the browser test page.
cd /d "%~dp0"
start "" "%~dp0kakutou\tests\tests.html"
node kakutou\tests\run.js
echo.
pause
