@echo off
REM Start Cursor with remote debugging enabled
REM This allows CDP (Chrome DevTools Protocol) to connect

echo 🚀 Starting Cursor with remote debugging...
echo.

REM Try common Cursor installation paths
set CURSOR_PATH=""

if exist "%LOCALAPPDATA%\Programs\Cursor\Cursor.exe" (
    set CURSOR_PATH="%LOCALAPPDATA%\Programs\Cursor\Cursor.exe"
)

if exist "%PROGRAMFILES%\Cursor\Cursor.exe" (
    set CURSOR_PATH="%PROGRAMFILES%\Cursor\Cursor.exe"
)

if %CURSOR_PATH%=="" (
    echo ❌ Could not find Cursor.exe
    echo.
    echo Please update this script with your Cursor installation path
    pause
    exit /b 1
)

echo ✅ Found Cursor at: %CURSOR_PATH%
echo 🔓 Enabling remote debugging on port 9222...
echo.

REM Start Cursor with debugging
start "" %CURSOR_PATH% --remote-debugging-port=9222

echo ✅ Cursor started with remote debugging!
echo.
echo Now you can run:
echo   cd automation
echo   npm install
echo   npm test
echo.

