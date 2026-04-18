# CursorBeam Installer
# GUI-based installation with Tailscale support and autostart configuration

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

# ============================================
# Helper Functions
# ============================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "SUCCESS" { "Green" }
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        default { "White" }
    }
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

function Show-MessageBox {
    param(
        [string]$Message,
        [string]$Title = "CursorBeam Setup",
        [System.Windows.Forms.MessageBoxButtons]$Buttons = [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]$Icon = [System.Windows.Forms.MessageBoxIcon]::Information
    )
    return [System.Windows.Forms.MessageBox]::Show($Message, $Title, $Buttons, $Icon)
}

function Test-NodeInstalled {
    try {
        $null = Get-Command node -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-TailscaleInstalled {
    try {
        $null = Get-Command tailscale -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Install-Tailscale {
    Write-Log "Downloading Tailscale..." "INFO"
    
    $installerUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe"
    $installerPath = "$env:TEMP\tailscale-setup.exe"
    
    try {
        # Download with progress
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
        $ProgressPreference = 'Continue'
        
        Write-Log "Installing Tailscale (this may take a minute)..." "INFO"
        
        # Run installer with proper arguments
        $process = Start-Process -FilePath $installerPath -ArgumentList "/quiet","/norestart" -Wait -PassThru -ErrorAction Stop
        
        if ($process.ExitCode -eq 0) {
            Write-Log "Tailscale installed successfully!" "SUCCESS"
            
            # Wait a moment for service to start
            Start-Sleep -Seconds 3
            
            # Try to refresh environment variables
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            return $true
        } else {
            Write-Log "Tailscale installer returned exit code: $($process.ExitCode)" "WARNING"
            return $false
        }
    } catch {
        Write-Log "Error installing Tailscale: $($_.Exception.Message)" "ERROR"
        return $false
    } finally {
        # Cleanup
        if (Test-Path $installerPath) {
            try {
                Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
            } catch { }
        }
    }
}

function Find-CursorPath {
    $defaultPath = "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe"
    if (Test-Path $defaultPath) {
        return $defaultPath
    }
    
    $possiblePaths = @(
        "$env:PROGRAMFILES\Cursor\Cursor.exe",
        "$env:PROGRAMFILES(X86)\Cursor\Cursor.exe"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    return $null
}

function Create-AutostartShortcut {
    param([string]$ProjectPath)
    
    $startupFolder = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupFolder "CursorBeam.lnk"
    
    $WScriptShell = New-Object -ComObject WScript.Shell
    $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ProjectPath\start-hidden.ps1`""
    $shortcut.WorkingDirectory = $ProjectPath
    $shortcut.Description = "CursorBeam Server"
    $shortcut.Save()
    
    Write-Log "Autostart shortcut created successfully" "SUCCESS"
}

function Create-HiddenStartScript {
    param([string]$ProjectPath)
    
    $scriptContent = @'
# Hidden startup script for CursorBeam
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectPath

# Start the server in a hidden window
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c npm start"
$psi.WorkingDirectory = $projectPath
$psi.WindowStyle = "Hidden"
$psi.CreateNoWindow = $true
[System.Diagnostics.Process]::Start($psi) | Out-Null
'@
    
    $scriptPath = Join-Path $ProjectPath "start-hidden.ps1"
    Set-Content -Path $scriptPath -Value $scriptContent -Encoding UTF8
}

function Create-StartBatchFile {
    param([string]$ProjectPath)
    
    $batContent = @"
@echo off
cd /d "%~dp0"
title CursorBeam Server
echo.
echo ===============================================
echo   CursorBeam Server Starting
echo ===============================================
echo.
npm start
"@
    
    $batPath = Join-Path $ProjectPath "start.bat"
    Set-Content -Path $batPath -Value $batContent -Encoding ASCII
}

# ============================================
# GUI Setup Form
# ============================================

function Show-SetupForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "CursorBeam Setup"
    $form.Size = New-Object System.Drawing.Size(600, 650)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

    # Modern color scheme
    $form.BackColor = [System.Drawing.Color]::FromArgb(240, 240, 240)

    $y = 20

    # Title
    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = "Welcome to CursorBeam Setup"
    $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $titleLabel.Location = New-Object System.Drawing.Point(20, $y)
    $titleLabel.Size = New-Object System.Drawing.Size(560, 40)
    $titleLabel.TextAlign = "MiddleCenter"
    $form.Controls.Add($titleLabel)

    $y += 50

    # Description
    $descLabel = New-Object System.Windows.Forms.Label
    $descLabel.Text = "Control Cursor IDE from your phone with a secure PWA"
    $descLabel.Location = New-Object System.Drawing.Point(20, $y)
    $descLabel.Size = New-Object System.Drawing.Size(560, 25)
    $descLabel.TextAlign = "MiddleCenter"
    $descLabel.ForeColor = [System.Drawing.Color]::Gray
    $form.Controls.Add($descLabel)

    $y += 40

    # Password section
    $passLabel = New-Object System.Windows.Forms.Label
    $passLabel.Text = "Login Password:"
    $passLabel.Location = New-Object System.Drawing.Point(40, $y)
    $passLabel.Size = New-Object System.Drawing.Size(520, 25)
    $form.Controls.Add($passLabel)

    $y += 30

    $passBox = New-Object System.Windows.Forms.TextBox
    $passBox.Location = New-Object System.Drawing.Point(40, $y)
    $passBox.Size = New-Object System.Drawing.Size(420, 25)
    $passBox.UseSystemPasswordChar = $true
    $form.Controls.Add($passBox)

    $y += 35

    $generateBtn = New-Object System.Windows.Forms.Button
    $generateBtn.Text = "Generate Strong Password"
    $generateBtn.Location = New-Object System.Drawing.Point(40, $y)
    $generateBtn.Size = New-Object System.Drawing.Size(200, 30)
    $generateBtn.FlatStyle = "Flat"
    $generateBtn.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 212)
    $generateBtn.ForeColor = [System.Drawing.Color]::White
    $generateBtn.Add_Click({
        $randomPass = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object {[char]$_})
        $passBox.Text = $randomPass
        $passBox.UseSystemPasswordChar = $false
        Show-MessageBox "Password Generated!`n`nMake sure to save it:`n$randomPass" "New Password" -Icon Information
    })
    $form.Controls.Add($generateBtn)

    $y += 40

    $passHintLabel = New-Object System.Windows.Forms.Label
    $passHintLabel.Text = "Tip: Use 12+ characters with letters, numbers, and symbols"
    $passHintLabel.Location = New-Object System.Drawing.Point(40, $y)
    $passHintLabel.Size = New-Object System.Drawing.Size(520, 20)
    $passHintLabel.ForeColor = [System.Drawing.Color]::Gray
    $passHintLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($passHintLabel)

    $y += 35

    # Cursor path section
    $cursorLabel = New-Object System.Windows.Forms.Label
    $cursorLabel.Text = "Cursor.exe Location:"
    $cursorLabel.Location = New-Object System.Drawing.Point(40, $y)
    $cursorLabel.Size = New-Object System.Drawing.Size(520, 25)
    $form.Controls.Add($cursorLabel)

    $y += 30

    $cursorBox = New-Object System.Windows.Forms.TextBox
    $cursorBox.Location = New-Object System.Drawing.Point(40, $y)
    $cursorBox.Size = New-Object System.Drawing.Size(420, 25)
    $cursorBox.ReadOnly = $true
    $form.Controls.Add($cursorBox)

    $browseBtn = New-Object System.Windows.Forms.Button
    $browseBtn.Text = "Browse..."
    $browseBtn.Location = New-Object System.Drawing.Point(470, $y)
    $browseBtn.Size = New-Object System.Drawing.Size(90, 25)
    $browseBtn.FlatStyle = "Flat"
    $browseBtn.Add_Click({
        $openFileDialog = New-Object System.Windows.Forms.OpenFileDialog
        $openFileDialog.Filter = "Cursor Executable (*.exe)|*.exe"
        $openFileDialog.Title = "Select Cursor.exe"
        if ($openFileDialog.ShowDialog() -eq "OK") {
            $cursorBox.Text = $openFileDialog.FileName
        }
    })
    $form.Controls.Add($browseBtn)

    $y += 40

    # Tailscale option
    $tailscaleCheck = New-Object System.Windows.Forms.CheckBox
    $tailscaleCheck.Text = "Install Tailscale (secure remote access - recommended)"
    $tailscaleCheck.Location = New-Object System.Drawing.Point(40, $y)
    $tailscaleCheck.Size = New-Object System.Drawing.Size(420, 25)
    $tailscaleCheck.Checked = $true
    $form.Controls.Add($tailscaleCheck)
    
    $tailscaleManualBtn = New-Object System.Windows.Forms.Button
    $tailscaleManualBtn.Text = "Manual Install"
    $tailscaleManualBtn.Location = New-Object System.Drawing.Point(470, $y)
    $tailscaleManualBtn.Size = New-Object System.Drawing.Size(90, 25)
    $tailscaleManualBtn.FlatStyle = "Flat"
    $tailscaleManualBtn.Add_Click({
        Start-Process "https://tailscale.com/download/windows"
        Show-MessageBox "Opening Tailscale download page in your browser.`n`nAfter installing Tailscale, you can uncheck the install option here." "Manual Installation" -Icon Information
    })
    $form.Controls.Add($tailscaleManualBtn)

    $y += 30

    $tailscaleInfo = New-Object System.Windows.Forms.Label
    $tailscaleInfo.Text = "Tailscale enables secure access from anywhere without port forwarding. Free for personal use."
    $tailscaleInfo.Location = New-Object System.Drawing.Point(40, $y)
    $tailscaleInfo.Size = New-Object System.Drawing.Size(520, 35)
    $tailscaleInfo.ForeColor = [System.Drawing.Color]::FromArgb(0, 90, 158)
    $tailscaleInfo.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($tailscaleInfo)

    $y += 45

    # Autostart option
    $autostartCheck = New-Object System.Windows.Forms.CheckBox
    $autostartCheck.Text = "Start automatically with Windows"
    $autostartCheck.Location = New-Object System.Drawing.Point(40, $y)
    $autostartCheck.Size = New-Object System.Drawing.Size(520, 25)
    $autostartCheck.Checked = $true
    $form.Controls.Add($autostartCheck)

    $y += 30

    $autostartInfo = New-Object System.Windows.Forms.Label
    $autostartInfo.Text = "Server will start in the background when you boot Windows"
    $autostartInfo.Location = New-Object System.Drawing.Point(40, $y)
    $autostartInfo.Size = New-Object System.Drawing.Size(520, 20)
    $autostartInfo.ForeColor = [System.Drawing.Color]::Gray
    $autostartInfo.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($autostartInfo)

    $y += 45

    # Progress label
    $progressLabel = New-Object System.Windows.Forms.Label
    $progressLabel.Text = ""
    $progressLabel.Location = New-Object System.Drawing.Point(40, $y)
    $progressLabel.Size = New-Object System.Drawing.Size(520, 25)
    $progressLabel.TextAlign = "MiddleCenter"
    $progressLabel.ForeColor = [System.Drawing.Color]::Blue
    $progressLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($progressLabel)

    $y += 35

    # Install button
    $installBtn = New-Object System.Windows.Forms.Button
    $installBtn.Text = "Install Now"
    $installBtn.Location = New-Object System.Drawing.Point(200, $y)
    $installBtn.Size = New-Object System.Drawing.Size(200, 45)
    $installBtn.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $installBtn.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 212)
    $installBtn.ForeColor = [System.Drawing.Color]::White
    $installBtn.FlatStyle = "Flat"
    $installBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
    
    $installBtn.Add_Click({
        # Validation
        if ([string]::IsNullOrWhiteSpace($passBox.Text)) {
            Show-MessageBox "Please enter a password or generate one automatically" "Validation Error" -Icon Warning
            return
        }
        
        if ($passBox.Text.Length -lt 8) {
            $result = Show-MessageBox "Password is too short (less than 8 characters).`n`nContinue anyway?" "Warning" -Buttons YesNo -Icon Warning
            if ($result -eq "No") { return }
        }
        
        if ([string]::IsNullOrWhiteSpace($cursorBox.Text) -or -not (Test-Path $cursorBox.Text)) {
            Show-MessageBox "Please select a valid Cursor.exe location" "Validation Error" -Icon Warning
            return
        }
        
        # Disable controls
        $installBtn.Enabled = $false
        $installBtn.Text = "Installing..."
        $progressLabel.Text = "Installation in progress..."
        $progressLabel.ForeColor = [System.Drawing.Color]::Blue
        
        # Store values
        $script:Password = $passBox.Text
        $script:CursorPath = $cursorBox.Text
        $script:InstallTailscale = $tailscaleCheck.Checked
        $script:EnableAutostart = $autostartCheck.Checked
        
        $form.DialogResult = "OK"
        $form.Close()
    })
    
    $form.Controls.Add($installBtn)

    # Auto-detect Cursor path
    $detectedPath = Find-CursorPath
    if ($detectedPath) {
        $cursorBox.Text = $detectedPath
    }

    return $form.ShowDialog()
}

# ============================================
# Main Installation Process
# ============================================

Clear-Host
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "       CursorBeam Installer v1.0" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Log "Checking prerequisites..."

if (-not (Test-NodeInstalled)) {
    $result = Show-MessageBox "Node.js is not installed!`n`nNode.js is required to run CursorBeam.`n`nWould you like to open the download page?" "Node.js Required" -Buttons YesNo -Icon Warning
    if ($result -eq "Yes") {
        Start-Process "https://nodejs.org/en/download/"
    }
    Write-Log "Installation cancelled - Node.js not found" "ERROR"
    exit 1
}

Write-Log "Node.js installed ✓" "SUCCESS"

# Show GUI
$result = Show-SetupForm

if ($result -ne "OK") {
    Write-Log "Installation cancelled by user" "WARNING"
    exit 0
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "       Starting Installation..." -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Install npm dependencies
Write-Log "Installing dependencies (this may take a minute)..."
try {
    $npmOutput = npm install 2>&1
    Write-Log "Dependencies installed successfully ✓" "SUCCESS"
} catch {
    Write-Log "Error installing dependencies: $_" "ERROR"
    Show-MessageBox "Failed to install dependencies.`n`nPlease ensure you have an internet connection and try again." "Installation Error" -Icon Error
    exit 1
}

# Create .env file
Write-Log "Creating configuration file..."
$projectPath = $PSScriptRoot

$envContent = @"
# CursorBeam Configuration
# Generated by installer on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

PASSWORD=$($script:Password)
CURSOR_EXE=$($script:CursorPath)
PORT=9800
CDP_PORT=9222
"@

$envPath = Join-Path $projectPath ".env"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Log "Configuration file created ✓" "SUCCESS"

# Install Tailscale if requested
if ($script:InstallTailscale) {
    if (Test-TailscaleInstalled) {
        Write-Log "Tailscale already installed ✓" "SUCCESS"
    } else {
        Write-Log "Installing Tailscale (requires administrator privileges)..."
        $tsResult = Install-Tailscale
        if ($tsResult) {
            Write-Log "Tailscale installed successfully ✓" "SUCCESS"
            Write-Host ""
            Write-Host "NOTE: To use Tailscale, you need to:" -ForegroundColor Yellow
            Write-Host "1. Open Tailscale from the system tray (near the clock)" -ForegroundColor Yellow
            Write-Host "2. Click 'Log in' and authenticate with your account" -ForegroundColor Yellow
            Write-Host "3. Install Tailscale on your phone using the same account" -ForegroundColor Yellow
            Write-Host ""
        } else {
            Write-Log "Tailscale installation failed" "WARNING"
            $manualInstall = Show-MessageBox "Tailscale installation failed.`n`nWould you like to open the download page to install manually?" "Tailscale Installation" -Buttons YesNo -Icon Question
            if ($manualInstall -eq "Yes") {
                Start-Process "https://tailscale.com/download/windows"
            }
        }
    }
}

# Create autostart if requested
if ($script:EnableAutostart) {
    Write-Log "Configuring autostart..."
    try {
        Create-HiddenStartScript -ProjectPath $projectPath
        Create-AutostartShortcut -ProjectPath $projectPath
        Write-Log "Autostart configured successfully ✓" "SUCCESS"
    } catch {
        Write-Log "Warning: Could not configure autostart: $_" "WARNING"
    }
}

# Create batch file for easy starting
Write-Log "Creating startup scripts..."
try {
    Create-StartBatchFile -ProjectPath $projectPath
    Write-Log "Startup scripts created ✓" "SUCCESS"
} catch {
    Write-Log "Warning: Could not create batch file: $_" "WARNING"
}

# Get network info
Write-Log "Detecting network addresses..."
$localIp = $null
$tailscaleIp = $null

try {
    $localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.InterfaceAlias -notlike "*Loopback*" -and 
        $_.InterfaceAlias -notlike "*VMware*" -and 
        $_.InterfaceAlias -notlike "*VirtualBox*" -and
        ($_.PrefixOrigin -eq "Dhcp" -or $_.PrefixOrigin -eq "Manual")
    } | Select-Object -First 1).IPAddress
} catch { }

if (Test-TailscaleInstalled) {
    try {
        $tailscaleIp = (tailscale ip -4 2>$null) | Select-Object -First 1
    } catch { }
}

# Show completion message
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "       Installation Complete! ✓" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

$completionMessage = @"
✓ CursorBeam has been installed successfully!

📱 HOW TO CONNECT FROM YOUR PHONE:

1. Start the server:
   • Double-click 'start.bat', OR
   • Run 'npm start' in this folder

2. Connect from your phone:
"@

if ($localIp) {
    $completionMessage += "`n   • Same WiFi: http://$localIp:9800"
}

if ($tailscaleIp) {
    $completionMessage += "`n   • Tailscale VPN: http://$tailscaleIp:9800"
    $completionMessage += "`n     (Install Tailscale on your phone first!)"
}

$completionMessage += @"


3. Login with your password

💡 TIPS:
• Server will start automatically when you boot Windows
• Add the PWA to your phone's home screen (works like an app!)
• Need help? Check README.md and TROUBLESHOOTING.md

Would you like to start the server now?
"@

Write-Host $completionMessage

$startNow = Show-MessageBox $completionMessage "Installation Complete!" -Buttons YesNo -Icon Information

if ($startNow -eq "Yes") {
    Write-Log "Starting server..."
    $batPath = Join-Path $projectPath "start.bat"
    Start-Process -FilePath $batPath
}

Write-Host ""
Write-Host "Thank you for choosing CursorBeam!" -ForegroundColor Cyan
Write-Host ""
