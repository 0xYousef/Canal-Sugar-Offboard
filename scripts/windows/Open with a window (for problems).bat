@echo off
cd /d "%~dp0..\files"
echo Starting Canal Sugar Offboarding...
echo Keep this window open while you use the portal. Close it to stop.
echo.
"runtime\node.exe" "server\server.cjs"
echo.
pause
