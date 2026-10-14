@echo off
rem Builds dist\prism.html once.
cd /d "%~dp0"
where node >nul 2>nul && (node tools\build.mjs) || (python tools\build.py)
pause
