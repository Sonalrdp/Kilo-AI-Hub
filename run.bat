@echo off
title LongCat Chat Hub
cd /d "%~dp0"

echo ===================================================
echo   LongCat Chat Hub Setup and Runner
echo ===================================================

echo Checking Node.js installation...
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in your system PATH!
    echo Please download and install Node.js from: https://nodejs.org/
    echo After installing, restart this script.
    goto PAUSE_EXIT
)

if exist "node_modules" goto START_SERVER

echo [INFO] Installing required dependencies (express, cors, dotenv)...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed. Please run 'npm install' manually.
    goto PAUSE_EXIT
)

:START_SERVER
echo Starting local proxy server...
echo Please open: http://localhost:3000 in your browser
node server.js
if errorlevel 1 (
    echo [ERROR] The Node.js server crashed or failed to start.
    goto PAUSE_EXIT
)
goto END

:PAUSE_EXIT
echo.
echo Press any key to exit...
pause >nul

:END
