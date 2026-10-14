@echo off
rem Prism dev server: builds, serves http://localhost:8080 and reloads the page on every save. Close this window to stop it.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and run this again. & pause & exit /b 1)
:run
node tools\dev.mjs
if %errorlevel%==3 goto run
echo.
echo The dev server stopped (exit code %errorlevel%). Starting it again in 3 seconds - close this window to stop it.
timeout /t 3 /nobreak >nul
goto run
