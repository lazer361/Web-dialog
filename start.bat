@echo off
setlocal
cd /d "%~dp0"

set "SITE_PORT=8000"

echo Web Dialog

echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo Docker is not running or is not installed.
  echo Start Docker Desktop and run this file again.
  echo.
  pause
  exit /b 1
)

echo Checking port %SITE_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ids = docker ps --filter 'publish=8000' --format '{{.ID}}'; if ($ids) { Write-Host 'Port 8000 is used by another Docker container. Stopping it...'; $ids | ForEach-Object { docker stop $_ | Out-Host } }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), 8000); $listener.Start(); $listener.Stop(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo Port 8000 is busy. Close the program that uses this port and run start.bat again.
  echo You can check it with: netstat -ano ^| findstr :8000
  echo.
  pause
  exit /b 1
)

echo Stopping old containers for this folder...
docker compose down --remove-orphans >nul 2>&1

echo Starting containers...
docker compose up --build -d
if errorlevel 1 (
  echo.
  echo Failed to start containers.
  echo.
  pause
  exit /b 1
)

echo Waiting for http://127.0.0.1:%SITE_PORT%/health ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 60;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2; if($r.StatusCode -eq 200){ $ok=$true; break } } catch { Start-Sleep -Seconds 2 } }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo.
  echo The site did not respond on port 8000.
  echo Check Docker Desktop and run: docker compose logs
  echo.
  pause
  exit /b 1
)

echo Opening site...
start "" "http://127.0.0.1:%SITE_PORT%"

echo.
echo Site: http://127.0.0.1:%SITE_PORT%
echo To stop the project, run stop.bat
pause
