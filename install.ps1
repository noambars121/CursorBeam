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
    Write-Log "Opening Tailscale download page..." "INFO"
    
    try {
        # Open the official Tailscale download page in browser
        Start-Process "https://tailscale.com/download/windows"
        
        # Show clear instructions
        $message = @"
Tailscale download page is now opening in your browser.

IMPORTANT - FOLLOW THESE STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Download and run the Tailscale installer from browser
2. Complete the Tailscale installation (it's quick!)
3. Click 'Log in' in Tailscale and authenticate
4. Come back here and click OK when done

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After installing:
• Tailscale icon will appear in system tray (near clock)
• You can check your IP with: tailscale ip -4
• Install Tailscale on your phone with same account

Click OK when you've finished installing Tailscale
(or Cancel to skip for now)
"@
        
        $result = Show-MessageBox $message "Install Tailscale" -Buttons OKCancel -Icon Information
        
        if ($result -eq "OK") {
            # Give it a moment and refresh PATH
            Start-Sleep -Seconds 2
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            # Check if Tailscale is now installed
            if (Test-TailscaleInstalled) {
                Write-Log "Tailscale detected successfully!" "SUCCESS"
                return $true
            } else {
                Write-Log "Tailscale not found in PATH yet" "WARNING"
                $restartMsg = Show-MessageBox "Tailscale may be installed but not in PATH yet.`n`nYou may need to restart your computer.`n`nContinue anyway?" "Restart May Be Required" -Buttons YesNo -Icon Question
                return ($restartMsg -eq "Yes")
            }
        } else {
            Write-Log "User chose to skip Tailscale" "INFO"
            return $false
        }
    } catch {
        Write-Log "Error opening Tailscale page: $($_.Exception.Message)" "ERROR"
        return $false
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

function Create-CursorShortcut {
    param(
        [string]$CursorExePath,
        [string]$ProjectsRoot
    )
    
    Write-Log "Creating Cursor CDP shortcut..." "INFO"
    
    try {
        $WScriptShell = New-Object -ComObject WScript.Shell
        $desktopPath = [Environment]::GetFolderPath("Desktop")
        $shortcutPath = Join-Path $desktopPath "Cursor (CursorBeam).lnk"
        
        # Delete existing shortcut if exists
        if (Test-Path $shortcutPath) {
            Remove-Item $shortcutPath -Force
        }
        
        $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $CursorExePath
        
        # Add CDP flag for remote debugging
        if ($ProjectsRoot -and (Test-Path $ProjectsRoot)) {
            $shortcut.Arguments = "--remote-debugging-port=9222 `"$ProjectsRoot`""
            $shortcut.WorkingDirectory = $ProjectsRoot
        } else {
            $shortcut.Arguments = "--remote-debugging-port=9222"
            $shortcut.WorkingDirectory = [Environment]::GetFolderPath("UserProfile")
        }
        
        $shortcut.Description = "Cursor IDE with CursorBeam remote control enabled"
        $shortcut.IconLocation = $CursorExePath
        $shortcut.Save()
        
        Write-Log "Cursor shortcut created on desktop ✓" "SUCCESS"
        Write-Host ""
        Write-Host "⚡ IMPORTANT: Use the new 'Cursor (CursorBeam)' shortcut on your desktop!" -ForegroundColor Yellow
        Write-Host "   This shortcut enables remote control from your phone." -ForegroundColor Yellow
        Write-Host ""
        
        return $true
    } catch {
        Write-Log "Error creating shortcut: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Install-WindowsService {
    param([string]$ProjectPath)
    
    Write-Log "Installing as Windows Service..." "INFO"
    
    try {
        # Run service installation
        Set-Location $ProjectPath
        $output = npm run service:install 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Windows Service installed successfully!" "SUCCESS"
            return $true
        } else {
            Write-Log "Service installation returned exit code: $LASTEXITCODE" "WARNING"
            return $false
        }
    } catch {
        Write-Log "Error installing service: $($_.Exception.Message)" "ERROR"
        return $false
    }
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
    $form.Size = New-Object System.Drawing.Size(600, 760)
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

    # Autostart option (Windows Service)
    # Projects folder selection
    $projectsLabel = New-Object System.Windows.Forms.Label
    $projectsLabel.Text = "Your Projects Folder (optional):"
    $projectsLabel.Location = New-Object System.Drawing.Point(40, $y)
    $projectsLabel.Size = New-Object System.Drawing.Size(520, 25)
    $projectsLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($projectsLabel)

    $y += 30

    $projectsBox = New-Object System.Windows.Forms.TextBox
    $projectsBox.Location = New-Object System.Drawing.Point(40, $y)
    $projectsBox.Size = New-Object System.Drawing.Size(420, 25)
    $projectsBox.Font = New-Object System.Drawing.Font("Consolas", 10)
    
    # Try to auto-detect common project folders
    $commonProjectPaths = @(
        "$env:USERPROFILE\projects",
        "$env:USERPROFILE\Documents\projects",
        "$env:USERPROFILE\dev",
        "$env:USERPROFILE\code"
    )
    foreach ($path in $commonProjectPaths) {
        if (Test-Path $path) {
            $projectsBox.Text = $path
            break
        }
    }
    
    $form.Controls.Add($projectsBox)

    $projectsBrowseBtn = New-Object System.Windows.Forms.Button
    $projectsBrowseBtn.Text = "Browse..."
    $projectsBrowseBtn.Location = New-Object System.Drawing.Point(470, $y)
    $projectsBrowseBtn.Size = New-Object System.Drawing.Size(90, 25)
    $projectsBrowseBtn.Add_Click({
        $folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
        $folderBrowser.Description = "Select your projects folder"
        $folderBrowser.ShowNewFolderButton = $true
        if ($projectsBox.Text) {
            $folderBrowser.SelectedPath = $projectsBox.Text
        }
        if ($folderBrowser.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $projectsBox.Text = $folderBrowser.SelectedPath
        }
    })
    $form.Controls.Add($projectsBrowseBtn)

    $y += 30

    $projectsInfo = New-Object System.Windows.Forms.Label
    $projectsInfo.Text = "Cursor will open in this folder. Leave empty to use default location."
    $projectsInfo.Location = New-Object System.Drawing.Point(40, $y)
    $projectsInfo.Size = New-Object System.Drawing.Size(520, 20)
    $projectsInfo.ForeColor = [System.Drawing.Color]::Gray
    $projectsInfo.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($projectsInfo)

    $y += 35

    $autostartCheck = New-Object System.Windows.Forms.CheckBox
    $autostartCheck.Text = "Install as Windows Service (recommended)"
    $autostartCheck.Location = New-Object System.Drawing.Point(40, $y)
    $autostartCheck.Size = New-Object System.Drawing.Size(520, 25)
    $autostartCheck.Checked = $true
    $form.Controls.Add($autostartCheck)

    $y += 30

    $autostartInfo = New-Object System.Windows.Forms.Label
    $autostartInfo.Text = "Installs as a background service (daemon) that starts with Windows. Requires admin privileges."
    $autostartInfo.Location = New-Object System.Drawing.Point(40, $y)
    $autostartInfo.Size = New-Object System.Drawing.Size(520, 35)
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
        $script:ProjectsRoot = $projectsBox.Text
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

# Add projects root if specified
if ($script:ProjectsRoot -and (Test-Path $script:ProjectsRoot)) {
    $envContent += "`nPROJECTS_ROOT=$($script:ProjectsRoot)"
}

$envPath = Join-Path $projectPath ".env"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Log "Configuration file created ✓" "SUCCESS"

# Create Cursor shortcut with CDP enabled
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Creating Cursor Shortcut" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$shortcutResult = Create-CursorShortcut -CursorExePath $script:CursorPath -ProjectsRoot $script:ProjectsRoot

if (-not $shortcutResult) {
    Write-Log "Warning: Could not create desktop shortcut" "WARNING"
}

# Install Tailscale if requested
if ($script:InstallTailscale) {
    if (Test-TailscaleInstalled) {
        Write-Log "Tailscale already installed ✓" "SUCCESS"
    } else {
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host "  Setting up Tailscale" -ForegroundColor White
        Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host ""
        
        $tsResult = Install-Tailscale
        
        if ($tsResult) {
            Write-Host ""
            Write-Host "✓ Tailscale setup complete!" -ForegroundColor Green
            Write-Host ""
            Write-Host "NEXT STEPS:" -ForegroundColor Cyan
            Write-Host "  1. Find Tailscale icon in system tray (near clock)" -ForegroundColor White
            Write-Host "  2. Click it and select 'Log in'" -ForegroundColor White
            Write-Host "  3. Authenticate with Google/Microsoft/GitHub" -ForegroundColor White
            Write-Host "  4. Install Tailscale on your phone (same account!)" -ForegroundColor White
            Write-Host ""
            Write-Log "Tailscale setup completed ✓" "SUCCESS"
            Write-Host ""
            Show-MessageBox "Tailscale installed successfully!`n`nNext steps:`n`n1. Open Tailscale from system tray (near clock)`n2. Click 'Log in' and authenticate`n3. Install Tailscale on your phone (same account)`n`nThen you can access CursorBeam from anywhere!" "Tailscale Setup" -Icon Information
        } else {
            Write-Log "Tailscale installation was cancelled or failed" "WARNING"
            $manualInstall = Show-MessageBox "Tailscale installation was not completed.`n`nWould you like to open the download page to install manually later?" "Tailscale Installation" -Buttons YesNo -Icon Question
            if ($manualInstall -eq "Yes") {
                Start-Process "https://tailscale.com/download/windows"
                Show-MessageBox "The download page has been opened.`n`nYou can install Tailscale any time - CursorBeam will work without it on your local WiFi." "Info" -Icon Information
            }
        }
    }
}

# Install as Windows Service if requested
if ($script:EnableAutostart) {
    Write-Log "Installing as Windows Service (daemon)..." "INFO"
    Write-Host ""
    Write-Host "NOTE: This requires administrator privileges" -ForegroundColor Yellow
    Write-Host "      If prompted, click 'Yes' to allow installation" -ForegroundColor Yellow
    Write-Host ""
    
    try {
        $serviceResult = Install-WindowsService -ProjectPath $projectPath
        
        if ($serviceResult) {
            Write-Log "Windows Service installed successfully ✓" "SUCCESS"
            Write-Host ""
            Write-Host "CursorBeam is now installed as a Windows Service!" -ForegroundColor Green
            Write-Host "The service will:" -ForegroundColor Cyan
            Write-Host "  • Start automatically when Windows boots" -ForegroundColor White
            Write-Host "  • Run in the background" -ForegroundColor White
            Write-Host "  • Restart automatically if it crashes" -ForegroundColor White
            Write-Host ""
            Write-Host "To manage the service:" -ForegroundColor Cyan
            Write-Host "  • Open Services: Win+R → services.msc → Find 'CursorBeam'" -ForegroundColor White
            Write-Host "  • Stop service:  npm run service:stop" -ForegroundColor White
            Write-Host "  • Start service: npm run service:start" -ForegroundColor White
            Write-Host "  • Uninstall:     npm run service:uninstall" -ForegroundColor White
            Write-Host ""
        } else {
            Write-Log "Warning: Could not install Windows Service" "WARNING"
            Write-Host ""
            Write-Host "You can install the service manually later:" -ForegroundColor Yellow
            Write-Host "  1. Open PowerShell as Administrator" -ForegroundColor White
            Write-Host "  2. Navigate to this folder" -ForegroundColor White
            Write-Host "  3. Run: npm run service:install" -ForegroundColor White
            Write-Host ""
        }
    } catch {
        Write-Log "Warning: Service installation failed: $_" "WARNING"
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

$serviceInstalled = $script:EnableAutostart

$completionMessage = @"
✓ CursorBeam has been installed successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HOW IT WORKS (Super Simple!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"@

if ($serviceInstalled) {
    $completionMessage += @"
✅ BACKGROUND SERVICE (Always Running)
   → Supervisor service is now active
   → Automatically detects when you start Cursor
   → Auto-starts relay server for your phone
   → No manual startup needed!

   Manage: Win+R → services.msc → "CursorBeam"

"@
} else {
    $completionMessage += @"
📝 MANUAL START REQUIRED:
   → Run 'npm start' in this folder
   → Or double-click 'start.bat'

"@
}

$completionMessage += @"

📱 HOW TO CONNECT FROM YOUR PHONE:

1. Connect from your phone:
"@

if ($localIp) {
    $completionMessage += "`n   • Same WiFi: http://$localIp:9800"
}

if ($tailscaleIp) {
    $completionMessage += "`n   • Tailscale VPN: http://$tailscaleIp:9800"
    $completionMessage += "`n     (Install Tailscale on your phone first!)"
}

$completionMessage += @"


2. Login with your password

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DAILY USAGE (3 Easy Steps)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣  Launch Cursor:
    → Use "Cursor (CursorBeam)" shortcut on your desktop
    → (Service automatically starts relay in background)

2️⃣  Open on Phone:
    → Same WiFi: http://$localIp:9800
$(if ($tailscaleIp) { "    → Tailscale: http://$tailscaleIp:9800" })

3️⃣  Login & Control!
    → Enter your password
    → Add to home screen (optional)
    → Control Cursor from anywhere!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT:
    Always use "Cursor (CursorBeam)" desktop shortcut
    Your old Cursor shortcuts won't work with CursorBeam!

💡 TIPS:
    • PWA works like a native app when added to home screen
    • If relay doesn't start, tap "Start Relay" in the PWA
    • Help: README.md & SERVICE.md
    • Uninstall: npm run service:uninstall

"@

if (-not $serviceInstalled) {
    $completionMessage += "`nWould you like to start the server now?"
} else {
    $completionMessage += "`n✅ Service is running! You're ready to go!"
}

Write-Host $completionMessage

if ($serviceInstalled) {
    Show-MessageBox $completionMessage "Installation Complete!" -Buttons OK -Icon Information
} else {
    $startNow = Show-MessageBox $completionMessage "Installation Complete!" -Buttons YesNo -Icon Information
    
    if ($startNow -eq "Yes") {
        Write-Log "Starting server..."
        $batPath = Join-Path $projectPath "start.bat"
        if (Test-Path $batPath) {
            Start-Process -FilePath $batPath
        } else {
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; npm start"
        }
    }
}

Write-Host ""
Write-Host "Thank you for choosing CursorBeam!" -ForegroundColor Cyan
Write-Host ""
