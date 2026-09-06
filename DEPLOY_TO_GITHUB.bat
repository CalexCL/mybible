@echo off
setlocal
cd /d "%~dp0"
echo Starting MyBible GitHub deployment...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DEPLOY_TO_GITHUB.ps1"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Deployment script ended with code %ERR%.
  pause
)
exit /b %ERR%
