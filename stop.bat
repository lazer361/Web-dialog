@echo off
setlocal
cd /d "%~dp0"

echo Stopping Web Dialog...
docker compose down
pause
