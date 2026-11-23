@echo off
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Method Post http://localhost:47321/__quit | Out-Null; Write-Host 'Stopped.' } catch { Write-Host 'It was not running.' }"
timeout /t 2 >nul
