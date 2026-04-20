# Setup Trusted Certificate using mkcert

Write-Host ""
Write-Host "=== Trusted Certificate Setup ===" -ForegroundColor Cyan
Write-Host ""

$certDir = "$env:USERPROFILE\.cursor-mobile-certs"
$keyFile = "$certDir\server.key"
$certFile = "$certDir\server.cert"

# Check if mkcert is installed
$hasMkcert = Get-Command mkcert -ErrorAction SilentlyContinue

if (-not $hasMkcert) {
    Write-Host "mkcert not found. Installing..." -ForegroundColor Yellow
    Write-Host ""
    
    # Try winget first
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Write-Host "Installing via winget..." -ForegroundColor Green
        winget install FiloSottile.mkcert
        
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        # Check again
        $hasMkcert = Get-Command mkcert -ErrorAction SilentlyContinue
    }
    
    if (-not $hasMkcert) {
        Write-Host ""
        Write-Host "Please install mkcert manually:" -ForegroundColor Red
        Write-Host ""
        Write-Host "Option 1 - Chocolatey:" -ForegroundColor Cyan
        Write-Host "  choco install mkcert" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Option 2 - Scoop:" -ForegroundColor Cyan
        Write-Host "  scoop bucket add extras" -ForegroundColor Gray
        Write-Host "  scoop install mkcert" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Option 3 - Manual download:" -ForegroundColor Cyan
        Write-Host "  https://github.com/FiloSottile/mkcert/releases" -ForegroundColor Gray
        Write-Host ""
        exit 1
    }
}

Write-Host "Installing mkcert root CA..." -ForegroundColor Green
mkcert -install

Write-Host ""
Write-Host "Generating trusted certificate..." -ForegroundColor Green
Write-Host ""

# Get local IPs
$localIPs = Get-NetIPAddress -AddressFamily IPv4 | 
            Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } | 
            Select-Object -ExpandProperty IPAddress

# Build mkcert command with all IPs
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$domains = @("localhost", "127.0.0.1", "::1") + $localIPs

& mkcert -key-file $keyFile -cert-file $certFile @domains

if (Test-Path $keyFile) {
    Write-Host ""
    Write-Host "Certificate created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Trusted for:" -ForegroundColor Yellow
    Write-Host "  - localhost"
    foreach ($ip in $localIPs) {
        Write-Host "  - $ip"
    }
    Write-Host ""
    Write-Host "No more security warnings!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next: Restart server (npm start)" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "Failed to create certificate" -ForegroundColor Red
    exit 1
}

Write-Host ""
