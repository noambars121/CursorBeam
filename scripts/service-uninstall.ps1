# Cursor Mobile - Service Uninstallation Script

Write-Host "=== Cursor Mobile Service Uninstallation ===" -ForegroundColor Cyan
Write-Host ""

$removed = $false

# Try PM2
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Write-Host "Removing PM2 service..." -ForegroundColor Yellow
    
    pm2 delete cursor-mobile 2>$null
    pm2 save
    
    Write-Host "✓ PM2 service removed" -ForegroundColor Green
    $removed = $true
}

# Try NSSM
if (Get-Command nssm -ErrorAction SilentlyContinue) {
    $status = nssm status cursor-mobile 2>$null
    
    if ($status -ne "SERVICE_NOT_FOUND") {
        Write-Host "Removing NSSM service..." -ForegroundColor Yellow
        
        nssm stop cursor-mobile 2>$null
        nssm remove cursor-mobile confirm
        
        Write-Host "✓ NSSM service removed" -ForegroundColor Green
        $removed = $true
    }
}

if (-not $removed) {
    Write-Host "No service found to remove" -ForegroundColor Yellow
}

Write-Host ""

