# Cursor Mobile - Service Installation Script
# Prefer PM2 over NSSM for better Node.js support

Write-Host "=== Cursor Mobile Service Installation ===" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot "dist\server\index.js"

# Check if build exists
if (-not (Test-Path $distPath)) {
    Write-Host "Error: Build not found at $distPath" -ForegroundColor Red
    Write-Host "Please run 'npm run build' first" -ForegroundColor Yellow
    exit 1
}

# Try PM2 first (recommended)
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Write-Host "Installing with PM2..." -ForegroundColor Green
    
    pm2 start $distPath --name cursor-mobile
    pm2 save
    pm2 startup windows
    
    Write-Host ""
    Write-Host "✓ Service installed successfully with PM2" -ForegroundColor Green
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor Cyan
    Write-Host "  pm2 status cursor-mobile" -ForegroundColor White
    Write-Host "  pm2 logs cursor-mobile" -ForegroundColor White
    Write-Host "  pm2 restart cursor-mobile" -ForegroundColor White
    Write-Host "  pm2 stop cursor-mobile" -ForegroundColor White
    Write-Host ""
}
# Try NSSM as fallback
elseif (Get-Command nssm -ErrorAction SilentlyContinue) {
    Write-Host "Installing with NSSM..." -ForegroundColor Green
    
    $logsDir = Join-Path $projectRoot "logs"
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir | Out-Null
    }
    
    nssm install cursor-mobile "node" $distPath
    nssm set cursor-mobile AppDirectory $projectRoot
    nssm set cursor-mobile AppStdout (Join-Path $logsDir "stdout.log")
    nssm set cursor-mobile AppStderr (Join-Path $logsDir "stderr.log")
    
    Write-Host ""
    Write-Host "✓ Service installed successfully with NSSM" -ForegroundColor Green
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor Cyan
    Write-Host "  nssm start cursor-mobile" -ForegroundColor White
    Write-Host "  nssm status cursor-mobile" -ForegroundColor White
    Write-Host "  nssm restart cursor-mobile" -ForegroundColor White
    Write-Host "  nssm stop cursor-mobile" -ForegroundColor White
    Write-Host ""
}
else {
    Write-Host "Error: Neither PM2 nor NSSM found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install one of the following:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Option 1 (Recommended) - Install PM2:" -ForegroundColor Cyan
    Write-Host "  npm install -g pm2" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 2 - Install NSSM with Chocolatey:" -ForegroundColor Cyan
    Write-Host "  choco install nssm" -ForegroundColor White
    Write-Host ""
    exit 1
}

