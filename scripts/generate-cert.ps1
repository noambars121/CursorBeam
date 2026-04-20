# Generate Self-Signed Certificate for HTTPS Development
# Run this script to create a self-signed SSL certificate

$certDir = "$env:USERPROFILE\.cursor-mobile-certs"
$keyFile = "$certDir\server.key"
$certFile = "$certDir\server.cert"

# Create directory
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

Write-Host "Generating self-signed certificate..." -ForegroundColor Cyan
Write-Host "Location: $certDir" -ForegroundColor Gray
Write-Host ""

# Check if OpenSSL is available
$hasOpenSSL = Get-Command openssl -ErrorAction SilentlyContinue

if ($hasOpenSSL) {
    Write-Host "Using OpenSSL..." -ForegroundColor Green
    
    # Get local IP addresses
    $localIPs = Get-NetIPAddress -AddressFamily IPv4 | 
                Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } | 
                Select-Object -ExpandProperty IPAddress
    
    # Create OpenSSL config with SANs
    $config = @"
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
"@
    
    $ipNum = 3
    foreach ($ip in $localIPs) {
        $config += "`nIP.$ipNum = $ip"
        $ipNum++
    }
    
    $configFile = "$certDir\openssl.cnf"
    $config | Out-File -FilePath $configFile -Encoding ASCII
    
    # Generate certificate
    & openssl req -x509 -newkey rsa:2048 -nodes `
        -keyout $keyFile `
        -out $certFile `
        -days 365 `
        -config $configFile
    
    Remove-Item $configFile -Force
    
    Write-Host ""
    Write-Host "✓ Certificate generated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Certificate valid for:" -ForegroundColor Yellow
    Write-Host "  - localhost" -ForegroundColor Gray
    Write-Host "  - 127.0.0.1" -ForegroundColor Gray
    foreach ($ip in $localIPs) {
        Write-Host "  - $ip" -ForegroundColor Gray
    }
    
} else {
    Write-Host "OpenSSL not found. Using PowerShell certificate..." -ForegroundColor Yellow
    Write-Host ""
    
    # Create self-signed certificate using PowerShell
    $cert = New-SelfSignedCertificate `
        -Subject "localhost" `
        -DnsName "localhost", "*.localhost", "127.0.0.1" `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -NotBefore (Get-Date) `
        -NotAfter (Get-Date).AddYears(1) `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -FriendlyName "Cursor Mobile Dev" `
        -HashAlgorithm SHA256 `
        -KeyUsage DigitalSignature, KeyEncipherment, DataEncipherment `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")
    
    # Export certificate
    $pwd = ConvertTo-SecureString -String "temp" -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath "$certDir\server.pfx" -Password $pwd | Out-Null
    
    # Convert to PEM format (requires OpenSSL)
    Write-Host "⚠️  Note: PEM conversion requires OpenSSL" -ForegroundColor Yellow
    Write-Host "Install OpenSSL from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Gray
    Write-Host "Or use: winget install OpenSSL.Light" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Certificate created in Windows Certificate Store" -ForegroundColor Green
    Write-Host "Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Set USE_HTTPS=true in .env" -ForegroundColor Gray
Write-Host "2. Restart the server" -ForegroundColor Gray
Write-Host "3. Accept security warning in browser" -ForegroundColor Gray
Write-Host "4. Install PWA and test voice input" -ForegroundColor Gray
Write-Host ""
