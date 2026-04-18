# Cursor Mobile Installer
# Complete setup with GUI, Tailscale installation, and autostart configuration

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
        [string]$Title = "Cursor Mobile",
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
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
        Write-Log "Installing Tailscale..." "INFO"
        Start-Process -FilePath $installerPath -ArgumentList "/quiet" -Wait
        Write-Log "Tailscale installed successfully!" "SUCCESS"
        return $true
    } catch {
        Write-Log "Error בהתקנת Tailscale: $_" "ERROR"
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

function Create-AutostartShortcut {
    param([string]$ProjectPath)
    
    $startupFolder = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupFolder "Cursor Mobile.lnk"
    
    $WScriptShell = New-Object -ComObject WScript.Shell
    $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ProjectPath\start-hidden.ps1`""
    $shortcut.WorkingDirectory = $ProjectPath
    $shortcut.Description = "Cursor Mobile Server"
    $shortcut.Save()
    
    Write-Log "Autostart created successfully" "SUCCESS"
}

function Create-HiddenStartScript {
    param([string]$ProjectPath)
    
    $scriptContent = @'
# Hidden startup script for Cursor Mobile
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectPath

# Start the server in a hidden window
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c npm run v2:start"
$psi.WorkingDirectory = $projectPath
$psi.WindowStyle = "Hidden"
$psi.CreateNoWindow = $true
[System.Diagnostics.Process]::Start($psi) | Out-Null
'@
    
    $scriptPath = Join-Path $ProjectPath "start-hidden.ps1"
    Set-Content -Path $scriptPath -Value $scriptContent -Encoding UTF8
}

# ============================================
# GUI Setup Form
# ============================================

function Show-SetupForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "CursorBeam Setup"
    $form.Size = New-Object System.Drawing.Size(600, 700)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $form.RightToLeft = "Yes"
    $form.RightToLeftLayout = $true

    # Title
    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = "ברוך הבא לCursorBeam Setup"
    $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $titleLabel.Location = New-Object System.Drawing.Point(20, 20)
    $titleLabel.Size = New-Object System.Drawing.Size(560, 40)
    $titleLabel.TextAlign = "MiddleCenter"
    $form.Controls.Add($titleLabel)

    # Description
    $descLabel = New-Object System.Windows.Forms.Label
    $descLabel.Text = "Control your Cursor IDE from any device with a secure, private PWA"
    $descLabel.Location = New-Object System.Drawing.Point(20, 70)
    $descLabel.Size = New-Object System.Drawing.Size(560, 30)
    $descLabel.TextAlign = "MiddleCenter"
    $descLabel.ForeColor = [System.Drawing.Color]::Gray
    $form.Controls.Add($descLabel)

    $y = 120

    # Password section
    $passLabel = New-Object System.Windows.Forms.Label
    $passLabel.Text = "Choose password for phone login:"
    $passLabel.Location = New-Object System.Drawing.Point(400, $y)
    $passLabel.Size = New-Object System.Drawing.Size(180, 25)
    $form.Controls.Add($passLabel)

    $passBox = New-Object System.Windows.Forms.TextBox
    $passBox.Location = New-Object System.Drawing.Point(40, $y)
    $passBox.Size = New-Object System.Drawing.Size(340, 25)
    $passBox.UseSystemPasswordChar = $true
    $form.Controls.Add($passBox)

    $y += 35

    $passHintLabel = New-Object System.Windows.Forms.Label
    $passHintLabel.Text = "Recommended: 12+ chars with letters and numbers"
    $passHintLabel.Location = New-Object System.Drawing.Point(40, $y)
    $passHintLabel.Size = New-Object System.Drawing.Size(540, 20)
    $passHintLabel.ForeColor = [System.Drawing.Color]::Gray
    $passHintLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($passHintLabel)

    $y += 30

    $generateBtn = New-Object System.Windows.Forms.Button
    $generateBtn.Text = "Generate Strong Password"
    $generateBtn.Location = New-Object System.Drawing.Point(400, $y)
    $generateBtn.Size = New-Object System.Drawing.Size(180, 30)
    $generateBtn.Add_Click({
        $randomPass = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object {[char]$_})
        $passBox.Text = $randomPass
        $passBox.UseSystemPasswordChar = $false
        Show-MessageBox "Password generated!`n`nMake sure to save it: $randomPass" "New Password" -Icon Information
    })
    $form.Controls.Add($generateBtn)

    $y += 50

    # Cursor path section
    $cursorLabel = New-Object System.Windows.Forms.Label
    $cursorLabel.Text = "Cursor.exe Location:"
    $cursorLabel.Location = New-Object System.Drawing.Point(480, $y)
    $cursorLabel.Size = New-Object System.Drawing.Size(100, 25)
    $form.Controls.Add($cursorLabel)

    $cursorBox = New-Object System.Windows.Forms.TextBox
    $cursorBox.Location = New-Object System.Drawing.Point(40, $y)
    $cursorBox.Size = New-Object System.Drawing.Size(420, 25)
    $cursorBox.ReadOnly = $true
    $form.Controls.Add($cursorBox)

    $y += 35

    $browseBtn = New-Object System.Windows.Forms.Button
    $browseBtn.Text = "Browse..."
    $browseBtn.Location = New-Object System.Drawing.Point(480, $y)
    $browseBtn.Size = New-Object System.Drawing.Size(100, 30)
    $browseBtn.Add_Click({
        $openFileDialog = New-Object System.Windows.Forms.OpenFileDialog
        $openFileDialog.Filter = "Cursor (*.exe)|*.exe"
        $openFileDialog.Title = "Select Cursor.exe"
        if ($openFileDialog.ShowDialog() -eq "OK") {
            $cursorBox.Text = $openFileDialog.FileName
        }
    })
    $form.Controls.Add($browseBtn)

    $y += 50

    # Tailscale section
    $tailscaleCheck = New-Object System.Windows.Forms.CheckBox
    $tailscaleCheck.Text = "התקן Tailscale (חיבור מרחוק מאובטח)"
    $tailscaleCheck.Location = New-Object System.Drawing.Point(320, $y)
    $tailscaleCheck.Size = New-Object System.Drawing.Size(260, 30)
    $tailscaleCheck.Checked = $true
    $form.Controls.Add($tailscaleCheck)

    $y += 35

    $tailscaleInfo = New-Object System.Windows.Forms.Label
    $tailscaleInfo.Text = "Tailscale מאפשר חיבור מאובטח מכל מקום בעולם ללא פתיחת פורטים.`nHighly recommended!"
    $tailscaleInfo.Location = New-Object System.Drawing.Point(40, $y)
    $tailscaleInfo.Size = New-Object System.Drawing.Size(540, 40)
    $tailscaleInfo.ForeColor = [System.Drawing.Color]::DarkBlue
    $tailscaleInfo.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($tailscaleInfo)

    $y += 55

    # Autostart section
    $autostartCheck = New-Object System.Windows.Forms.CheckBox
    $autostartCheck.Text = "Start automatically with Windows"
    $autostartCheck.Location = New-Object System.Drawing.Point(380, $y)
    $autostartCheck.Size = New-Object System.Drawing.Size(200, 30)
    $autostartCheck.Checked = $true
    $form.Controls.Add($autostartCheck)

    $y += 35

    $autostartInfo = New-Object System.Windows.Forms.Label
    $autostartInfo.Text = "The server will start automatically in the background when you boot"
    $autostartInfo.Location = New-Object System.Drawing.Point(40, $y)
    $autostartInfo.Size = New-Object System.Drawing.Size(540, 20)
    $autostartInfo.ForeColor = [System.Drawing.Color]::Gray
    $autostartInfo.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($autostartInfo)

    $y += 50

    # Progress label
    $progressLabel = New-Object System.Windows.Forms.Label
    $progressLabel.Text = ""
    $progressLabel.Location = New-Object System.Drawing.Point(40, $y)
    $progressLabel.Size = New-Object System.Drawing.Size(540, 30)
    $progressLabel.TextAlign = "MiddleCenter"
    $progressLabel.ForeColor = [System.Drawing.Color]::Blue
    $form.Controls.Add($progressLabel)

    $y += 40

    # Install button
    $installBtn = New-Object System.Windows.Forms.Button
    $installBtn.Text = "Install Now"
    $installBtn.Location = New-Object System.Drawing.Point(220, $y)
    $installBtn.Size = New-Object System.Drawing.Size(160, 45)
    $installBtn.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $installBtn.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 212)
    $installBtn.ForeColor = [System.Drawing.Color]::White
    $installBtn.FlatStyle = "Flat"
    
    $installBtn.Add_Click({
        # Validation
        if ([string]::IsNullOrWhiteSpace($passBox.Text)) {
            Show-MessageBox "Please enter a password or generate one" "Error" -Icon Warning
            return
        }
        
        if ($passBox.Text.Length -lt 8) {
            $result = Show-MessageBox "הסיסמה קצרה מדי (פחות מ-8 תווים).`nהאם להמשיך בכל זאת?" "Warning" -Buttons YesNo -Icon Warning
            if ($result -eq "No") { return }
        }
        
        if ([string]::IsNullOrWhiteSpace($cursorBox.Text) -or -not (Test-Path $cursorBox.Text)) {
            Show-MessageBox "Please select valid Cursor.exe location" "Error" -Icon Warning
            return
        }
        
        # Disable button
        $installBtn.Enabled = $false
        $installBtn.Text = "Installing..."
        
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
# Main Installation
# ============================================

Clear-Host
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "       Cursor Mobile Installer v1.0" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Log "בודק דרישות מקדימות..."

if (-not (Test-NodeInstalled)) {
    $result = Show-MessageBox "Node.js לא מותקן במחשב!`n`nNode.js נדרש להפעלת התוכנה.`nהאם לפתוח את דף ההורדה?" "Node.js חסר" -Buttons YesNo -Icon Warning
    if ($result -eq "Yes") {
        Start-Process "https://nodejs.org/en/download/"
    }
    Write-Log "התקנה בוטלה - Node.js חסר" "ERROR"
    exit 1
}

Write-Log "Node.js מותקן ✓" "SUCCESS"

# Show GUI
$result = Show-SetupForm

if ($result -ne "OK") {
    Write-Log "התקנה בוטלה על ידי המשתמש" "WARNING"
    exit 0
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "       מתחיל התקנה..." -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Install npm dependencies
Write-Log "מתקין תלויות (npm install)..."
try {
    $npmOutput = npm install 2>&1
    Write-Log "תלויות הותקנו בהצלחה ✓" "SUCCESS"
} catch {
    Write-Log "Error בהתקנת תלויות: $_" "ERROR"
    Show-MessageBox "התקנת התלויות נכשלה.`nאנא ודא שיש לך חיבור אינטרנט ונסה שוב." "Error" -Icon Error
    exit 1
}

# Create .env file
Write-Log "יוצר קובץ הגדרות..."
$projectPath = $PSScriptRoot

$envContent = @"
# Cursor Mobile Configuration
# Created by installer on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

V2_PASSWORD=$($script:Password)
V2_CURSOR_EXE=$($script:CursorPath)
V2_PORT=9800
V2_CDP_PORT=9222
"@

$envPath = Join-Path $projectPath ".env"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Log "קובץ .env נוצר ✓" "SUCCESS"

# Install Tailscale if requested
if ($script:InstallTailscale) {
    if (Test-TailscaleInstalled) {
        Write-Log "Tailscale כבר מותקן ✓" "SUCCESS"
    } else {
        $tsResult = Install-Tailscale
        if (-not $tsResult) {
            Show-MessageBox "התקנת Tailscale נכשלה.`nתוכל להתקין אותו ידנית מ: https://tailscale.com/download" "Warning" -Icon Warning
        }
    }
}

# Create autostart if requested
if ($script:EnableAutostart) {
    Write-Log "מגדיר הפעלה אוטומטית..."
    try {
        Create-HiddenStartScript -ProjectPath $projectPath
        Create-AutostartShortcut -ProjectPath $projectPath
        Write-Log "Autostart הוגדר בהצלחה ✓" "SUCCESS"
    } catch {
        Write-Log "Error בהגדרת autostart: $_" "WARNING"
    }
}

# Get network info
Write-Log "מזהה כתובות רשת..."
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
Write-Host "       ההתקנה הושלמה בהצלחה! ✓" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

$completionMessage = @"
✓ Cursor Mobile הותקן בהצלחה!

📱 איך להתחבר מהטלפון:

1. הפעל את השרת:
   פשוט הרץ את הקובץ 'התחל.bat' שנוצר

2. התחבר מהטלפון:
"@

if ($localIp) {
    $completionMessage += "`n   • ברשת המקומית: http://$localIp:9800"
}

if ($tailscaleIp) {
    $completionMessage += "`n   • דרך Tailscale: http://$tailscaleIp:9800"
    $completionMessage += "`n     (התקן Tailscale גם בטלפון!)"
}

$completionMessage += @"


3. התחבר עם הסיסמה שהזנת

💡 טיפים:
• השרת יתחיל אוטומטית כשתדליק את המחשב
• ניתן להוסיף את ה-PWA למסך הבית בטלפון (יעבוד כמו אפליקציה!)
• לצפייה במדריך מלא: README.md

האם להפעיל את השרת עכשיו?
"@

$startNow = Show-MessageBox $completionMessage "התקנה הושלמה!" -Buttons YesNo -Icon Information

# Create batch file for easy starting
$batContent = @"
@echo off
cd /d "%~dp0"
start "Cursor Mobile" cmd /k "npm run v2:start"
"@
$batPath = Join-Path $projectPath "התחל.bat"
Set-Content -Path $batPath -Value $batContent -Encoding ASCII

Write-Host $completionMessage
Write-Host ""

if ($startNow -eq "Yes") {
    Write-Log "מפעיל את השרת..."
    Start-Process -FilePath $batPath
}

Write-Host ""
Write-Host "תודה שבחרת ב-Cursor Mobile!" -ForegroundColor Cyan
Write-Host ""
