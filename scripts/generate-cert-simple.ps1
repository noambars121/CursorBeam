# Simple SSL Certificate Generator

$certDir = "$env:USERPROFILE\.cursor-mobile-certs"
$keyFile = "$certDir\server.key"
$certFile = "$certDir\server.cert"

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

Write-Host "Generating self-signed certificate..." -ForegroundColor Cyan
Write-Host "Location: $certDir" -ForegroundColor Gray
Write-Host ""

$hasOpenSSL = Get-Command openssl -ErrorAction SilentlyContinue

if ($hasOpenSSL) {
    Write-Host "Using OpenSSL..." -ForegroundColor Green
    
    $localIPs = Get-NetIPAddress -AddressFamily IPv4 | 
                Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } | 
                Select-Object -ExpandProperty IPAddress
    
    $config = "[req]`ndefault_bits = 2048`nprompt = no`ndefault_md = sha256`ndistinguished_name = dn`nreq_extensions = v3_req`n`n"
    $config += "[dn]`nCN = localhost`n`n[v3_req]`nsubjectAltName = @alt_names`n`n[alt_names]`nDNS.1 = localhost`nDNS.2 = *.localhost`nIP.1 = 127.0.0.1`nIP.2 = ::1`n"
    
    $ipNum = 3
    foreach ($ip in $localIPs) {
        $config += "IP.$ipNum = $ip`n"
        $ipNum++
    }
    
    $configFile = "$certDir\openssl.cnf"
    $config | Out-File -FilePath $configFile -Encoding ASCII
    
    & openssl req -x509 -newkey rsa:2048 -nodes -keyout $keyFile -out $certFile -days 365 -config $configFile 2>&1 | Out-Null
    
    Remove-Item $configFile -Force
    
    if (Test-Path $keyFile) {
        Write-Host ""
        Write-Host "Certificate generated successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Valid for:" -ForegroundColor Yellow
        Write-Host "  - localhost"
        foreach ($ip in $localIPs) {
            Write-Host "  - $ip"
        }
    }
} else {
    Write-Host "OpenSSL not found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please install OpenSSL:" -ForegroundColor Cyan
    Write-Host "  winget install OpenSSL.Light" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or download from:" -ForegroundColor Cyan
    Write-Host "  https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next: npm start" -ForegroundColor Cyan
Write-Host ""
