# CursorBeam Post-Installation Script
# Runs after files are copied, configures everything

param(
    [string]$InstallPath
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Configuring CursorBeam..." -ForegroundColor Cyan

# Set working directory
Set-Location $InstallPath

# Read .env to get Cursor path and projects folder
$envPath = Join-Path $InstallPath ".env"
$cursorPath = ""
$projectsRoot = ""

if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match "^CURSOR_EXE=(.+)$") {
            $cursorPath = $matches[1]
        }
        if ($_ -match "^PROJECTS_ROOT=(.+)$") {
            $projectsRoot = $matches[1]
        }
    }
}

# Create Cursor CDP shortcut on desktop
Write-Host "Creating Cursor shortcut..." -ForegroundColor Gray

$WScriptShell = New-Object -ComObject WScript.Shell
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Cursor (CursorBeam).lnk"

$shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $cursorPath
$shortcut.Arguments = "--remote-debugging-port=9222"
if ($projectsRoot -and (Test-Path $projectsRoot)) {
    $shortcut.Arguments += " `"$projectsRoot`""
    $shortcut.WorkingDirectory = $projectsRoot
}
$shortcut.Description = "Cursor IDE with CursorBeam remote control"
$shortcut.Save()

Write-Host "Shortcut created ✓" -ForegroundColor Green

# Create start menu shortcuts
Write-Host "Creating start menu shortcuts..." -ForegroundColor Gray

$startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\CursorBeam"
New-Item -ItemType Directory -Path $startMenuPath -Force | Out-Null

# Create start-gui.bat
$startGuiBat = @"
@echo off
cd /d "%~dp0"
start "" "%~dp0node\node.exe" "%~dp0src\start.ts"
exit
"@
Set-Content -Path (Join-Path $InstallPath "start-gui.bat") -Value $startGuiBat

Write-Host "Configuration complete ✓" -ForegroundColor Green

# Get local IP
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notlike "*Loopback*" -and 
    $_.PrefixOrigin -eq "Dhcp"
} | Select-Object -First 1).IPAddress

# Show completion message
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  CursorBeam Installation Complete! ✓" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Connect from your phone:" -ForegroundColor Cyan
if ($localIp) {
    Write-Host "   http://$localIp:9800" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "🚀 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Use 'Cursor (CursorBeam)' shortcut on desktop" -ForegroundColor White
Write-Host "   2. Open the URL above on your phone" -ForegroundColor White
Write-Host "   3. Login with your password" -ForegroundColor White
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
