# Build CursorBeam Installer
# Downloads Inno Setup and builds the installer

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  CursorBeam Installer Builder" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Paths
$scriptDir = $PSScriptRoot
$projectRoot = Split-Path $scriptDir -Parent
$distDir = Join-Path $projectRoot "dist"
$toolsDir = Join-Path $projectRoot "tools"
$nodePortableDir = Join-Path $toolsDir "node-portable"

# Create directories
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

Write-Host "📦 Step 1: Checking Inno Setup..." -ForegroundColor Yellow

# Check for Inno Setup
$innoSetupPath = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $innoSetupPath)) {
    Write-Host "⚠️  Inno Setup not found. Installing..." -ForegroundColor Yellow
    
    $innoUrl = "https://jrsoftware.org/download.php/is.exe"
    $innoInstaller = Join-Path $env:TEMP "innosetup.exe"
    
    Write-Host "   Downloading Inno Setup..."
    Invoke-WebRequest -Uri $innoUrl -OutFile $innoInstaller -UseBasicParsing
    
    Write-Host "   Installing Inno Setup..."
    Start-Process -FilePath $innoInstaller -ArgumentList "/VERYSILENT","/SUPPRESSMSGBOXES","/NORESTART" -Wait
    
    Remove-Item $innoInstaller -Force
    
    if (-not (Test-Path $innoSetupPath)) {
        Write-Host "❌ Failed to install Inno Setup" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✓ Inno Setup found" -ForegroundColor Green

Write-Host ""
Write-Host "📦 Step 2: Downloading portable Node.js..." -ForegroundColor Yellow

if (-not (Test-Path $nodePortableDir)) {
    $nodeVersion = "v22.11.0"
    $nodeUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
    $nodeZip = Join-Path $toolsDir "node.zip"
    
    Write-Host "   Downloading Node.js $nodeVersion..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing
    
    Write-Host "   Extracting..."
    Expand-Archive -Path $nodeZip -DestinationPath $toolsDir -Force
    
    Rename-Item (Join-Path $toolsDir "node-$nodeVersion-win-x64") $nodePortableDir
    Remove-Item $nodeZip -Force
}

Write-Host "✓ Node.js portable ready" -ForegroundColor Green

Write-Host ""
Write-Host "📦 Step 3: Creating assets..." -ForegroundColor Yellow

$assetsDir = Join-Path $projectRoot "assets"
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

# Create icon if doesn't exist
$iconPath = Join-Path $assetsDir "icon.ico"
if (-not (Test-Path $iconPath)) {
    Write-Host "   Creating default icon..."
    # Create a simple ICO file (in real scenario, use proper icon)
    # For now, copy from Windows if available
    $sampleIcon = "C:\Windows\System32\shell32.dll"
    if (Test-Path $sampleIcon) {
        # This is just a placeholder - in production, use proper icon
        Copy-Item $sampleIcon $iconPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "✓ Assets ready" -ForegroundColor Green

Write-Host ""
Write-Host "📦 Step 4: Building installer..." -ForegroundColor Yellow

# Build with Inno Setup
$issScript = Join-Path $scriptDir "setup.iss"

if (-not (Test-Path $issScript)) {
    Write-Host "❌ setup.iss not found!" -ForegroundColor Red
    exit 1
}

Write-Host "   Compiling installer..."
& $innoSetupPath $issScript

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Installer build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Installer built successfully!" -ForegroundColor Green

# Find the output file
$installerFile = Get-ChildItem $distDir -Filter "CursorBeam-Setup-*.exe" | Select-Object -First 1

if ($installerFile) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✓ Installer Ready!" -ForegroundColor White
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "📦 Output file:" -ForegroundColor Cyan
    Write-Host "   $($installerFile.FullName)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📏 Size: $([math]::Round($installerFile.Length / 1MB, 2)) MB" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🚀 You can now distribute this file!" -ForegroundColor Green
    Write-Host "   Users just double-click to install CursorBeam" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "⚠️  Installer file not found in dist folder" -ForegroundColor Yellow
}
