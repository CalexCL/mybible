@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY_ICON_PATCH.ps1"
echo.
pause