@echo off
rem Copies the GitHub Actions workflows into .github\workflows (run once before the first push)
cd /d "%~dp0"
xcopy /E /I /Y ci\workflows .github\workflows >nul && echo Workflows copied to .github\workflows
