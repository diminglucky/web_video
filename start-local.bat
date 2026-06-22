@echo off
setlocal
cd /d "%~dp0presentation"

set "PATH=D:\software\ffmpeg-8.0.1-essentials_build\bin;%PATH%"

echo Releasing local ports 8787 and 5174 if they are already in use...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(8787, 5174); " ^
  "$pids = @(); " ^
  "foreach ($port in $ports) { " ^
  "  $lines = netstat -ano | Select-String (':' + $port + '\s'); " ^
  "  foreach ($line in $lines) { " ^
  "    $parts = ($line.Line -split '\s+') | Where-Object { $_ }; " ^
  "    if ($parts.Count -ge 5 -and $parts[3] -eq 'LISTENING') { $pids += [int]$parts[4] } " ^
  "  } " ^
  "} " ^
  "$pids = $pids | Sort-Object -Unique; " ^
  "if (-not $pids) { Write-Host 'No old local server processes found.' } " ^
  "foreach ($pidToStop in $pids) { Write-Host ('Stopping old process PID ' + $pidToStop); taskkill /PID $pidToStop /F | Out-Host }"

timeout /t 2 /nobreak >nul

echo Starting Web Video Studio backend...
start "web-video backend" cmd /k "npm run server"

echo Starting Web Video Studio frontend...
start "web-video frontend" cmd /k "npm run dev"

echo.
echo Started. If the browser was already open, press Ctrl+F5 on http://127.0.0.1:5174/studio.

echo.
echo Open http://127.0.0.1:5174/studio
echo If local TTS still shows spawn EPERM, close both windows and run this file as Administrator.
endlocal
