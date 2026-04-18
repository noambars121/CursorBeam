@echo off
setlocal
cd /d "%~dp0"

rem Prefer bundled portable node (shipped with the installer). Fall back to
rem system node for dev runs from a git checkout.
set "NODE_EXE=%~dp0node\node.exe"
set "NPM_CLI=%~dp0node\node_modules\npm\bin\npm-cli.js"

if exist "%NODE_EXE%" (
  start "CursorBeam" /MIN "%NODE_EXE%" "%NPM_CLI%" start
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js was not found. Please reinstall CursorBeam or install Node 18+.
    pause
    exit /b 1
  )
  start "CursorBeam" /MIN cmd /c "npm start"
)
exit /b 0
