@echo off
setlocal EnableExtensions
title Canal Sugar Offboarding - Setup
set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"

if not exist "%HERE%\files\runtime\node.exe" goto :missing

rem ---- Need administrator rights. If we do not have them, ask Windows and start again.
if /I "%~1"=="elevated" goto :elevated
net session >nul 2>&1
if not errorlevel 1 goto :elevated
echo Asking Windows for permission. Please press "Yes" on the next window.
>"%PUBLIC%\offboard-home.txt" echo %USERPROFILE%
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'elevated' -Verb RunAs"
exit /b

:elevated
rem ---- Use the folder of the person who started this, even if an administrator's name was typed in.
set "HOME_DIR=%USERPROFILE%"
if exist "%PUBLIC%\offboard-home.txt" set /p HOME_DIR=<"%PUBLIC%\offboard-home.txt"
del "%PUBLIC%\offboard-home.txt" >nul 2>&1
set "TARGET=%HOME_DIR%\program\Canal-Sugar-Offboarding"

echo.
echo  ==========================================
echo    Canal Sugar Offboarding - Setup
echo  ==========================================
echo.

if /I "%HERE%"=="%TARGET%" goto :already

echo  Step 1 of 3: copying the program to your "program" folder...
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Method Post http://localhost:47321/__quit | Out-Null } catch {}" >nul 2>&1
timeout /t 2 /nobreak >nul
if not exist "%HOME_DIR%\program" mkdir "%HOME_DIR%\program"
robocopy "%HERE%" "%TARGET%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :copyfail
goto :shortcut

:already
echo  Step 1 of 3: the program is already in the right place.

:shortcut
echo  Step 2 of 3: putting an icon on your desktop...
powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET%\files\make-shortcut.ps1" -UserHome "%HOME_DIR%" -Target "%TARGET%"
if errorlevel 1 echo  (The desktop icon could not be made. You can still open the program from the folder: More\Open with a window.)

echo  Step 3 of 3: opening the portal...
powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET%\files\launch.ps1"

echo.
echo  ==========================================
echo    All done!
echo  ==========================================
echo.
echo  Your web browser is opening the portal.
echo  From now on, use the "Canal Sugar Offboarding" icon on your desktop.
echo  You can delete the folder you downloaded.
echo.
echo  This window closes by itself.
timeout /t 12 >nul
exit /b 0

:missing
echo.
echo  Some files are missing.
echo  Please right-click the zip file you downloaded, choose "Extract All",
echo  then open this file again from the new folder.
echo.
pause
exit /b 1

:copyfail
echo.
echo  Sorry, the files could not be copied.
echo  If the program is open, close your browser, wait one minute, and try again.
echo  If it still fails, send a photo of this window to your IT team.
echo.
pause
exit /b 1
