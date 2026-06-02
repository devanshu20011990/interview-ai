@echo off
REM ============================================================
REM   Interview AI Assistant - Windows one-click launcher
REM   Double-click this file to start the app.
REM ============================================================
title Interview AI Assistant
cd /d "%~dp0"

echo.
echo   ============================================
echo     Interview AI Assistant - starting up...
echo   ============================================
echo.

REM --- Check Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] Node.js is not installed.
  echo.
  echo   Please install the "LTS" version from:  https://nodejs.org
  echo   Then double-click this file again.
  echo.
  pause
  exit /b 1
)

REM --- First run: install dependencies ---
if not exist "node_modules" (
  echo   First run detected. Installing dependencies ^(one time^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo   [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

REM --- Make sure .env exists ---
if not exist ".env" (
  echo   No .env file found. Creating one from the template...
  copy ".env.example" ".env" >nul
  echo.
  echo   [ACTION NEEDED] Open the new ".env" file and paste your FREE Groq key.
  echo   Get one at: https://console.groq.com  ^(no credit card^)
  echo.
  echo   After saving .env, double-click this file again.
  echo.
  notepad ".env"
  pause
  exit /b 0
)

REM --- Open the browser, then start the server ---
echo   Opening http://localhost:3000 in your browser...
start "" "http://localhost:3000"
echo.
echo   Server is running. Keep this window OPEN while you use the app.
echo   Close this window to stop the app.
echo.
call npm start

pause
