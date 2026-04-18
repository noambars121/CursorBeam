# ========================================
# Cursor Chat Host - Task Scheduler Install
# ========================================
# This script installs the UIA host as a scheduled task
# that runs at user logon with highest privileges.

param(
    [string]$TaskName = "CursorChatHost",
    [string]$HostExePath = ""
)

# Determine host exe path
if ([string]::IsNullOrWhiteSpace($HostExePath)) {
    $ScriptDir = Split-Path -Parent $PSCommandPath
    $ProjectRoot = Split-Path -Parent $ScriptDir
    $HostExePath = Join-Path $ProjectRoot "host\CursorChatHost\bin\Release\net8.0\CursorChatHost.exe"
}

# Check if exe exists
if (-not (Test-Path $HostExePath)) {
    Write-Host "❌ Error: CursorChatHost.exe not found at: $HostExePath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please build the host first:" -ForegroundColor Yellow
    Write-Host "  npm run host:build" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "🚀 Installing Cursor Chat Host as Scheduled Task..." -ForegroundColor Green
Write-Host ""
Write-Host "Task Name: $TaskName" -ForegroundColor Cyan
Write-Host "Executable: $HostExePath" -ForegroundColor Cyan
Write-Host "Trigger: At logon" -ForegroundColor Cyan
Write-Host "Run Level: Highest" -ForegroundColor Cyan
Write-Host ""

# Check if task already exists
$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($ExistingTask) {
    Write-Host "⚠️  Task '$TaskName' already exists. Removing it..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

try {
    # Create action
    $Action = New-ScheduledTaskAction `
        -Execute $HostExePath `
        -WorkingDirectory (Split-Path $HostExePath)
    
    # Create trigger (at logon)
    $Trigger = New-ScheduledTaskTrigger -AtLogOn
    
    # Create settings
    $Settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    
    # Create principal (run as current user with highest privileges)
    $Principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive `
        -RunLevel Highest
    
    # Register task
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -Description "Cursor Chat Host (UIA) - Remote Chat automation for Cursor IDE"
    
    Write-Host ""
    Write-Host "✅ Task installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The host will start automatically:" -ForegroundColor Yellow
    Write-Host "  - At every user logon" -ForegroundColor Cyan
    Write-Host "  - Listening on http://127.0.0.1:8788" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To start it now, run:" -ForegroundColor Yellow
    Write-Host "  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To check status:" -ForegroundColor Yellow
    Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To uninstall:" -ForegroundColor Yellow
    Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Failed to install task:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "You may need to run this script as Administrator." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

