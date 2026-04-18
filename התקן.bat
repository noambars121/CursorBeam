@echo off
chcp 65001 >nul
title התקנת Cursor Mobile

echo.
echo ═══════════════════════════════════════════════
echo        Cursor Mobile Installer
echo ═══════════════════════════════════════════════
echo.
echo מתחיל התקנה...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"

if errorlevel 1 (
    echo.
    echo התקנה נכשלה!
    pause
    exit /b 1
)

echo.
echo ההתקנה הושלמה בהצלחה!
echo.
pause
