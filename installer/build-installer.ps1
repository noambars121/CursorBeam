# CursorBeam installer builder.
# Ensures prerequisites are present (Inno Setup, portable Node, icon), then
# compiles dist\CursorBeam-Setup-vX.Y.Z.exe from installer\setup.iss.

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host ("═" * 55) -ForegroundColor Cyan
  Write-Host "  $Title" -ForegroundColor White
  Write-Host ("═" * 55) -ForegroundColor Cyan
}

$scriptDir   = $PSScriptRoot
$projectRoot = Split-Path $scriptDir -Parent
$distDir     = Join-Path $projectRoot "dist"
$toolsDir    = Join-Path $projectRoot "tools"
$nodeDir     = Join-Path $toolsDir "node-portable"
$assetsDir   = Join-Path $projectRoot "assets"
$iconPath    = Join-Path $assetsDir "icon.ico"
$logoPath    = Join-Path $projectRoot "logo.png"

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

Write-Section "Step 1/4: Inno Setup"

$innoCandidates = @(
  "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
)
$innoPath = $innoCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $innoPath) {
  Write-Host "Inno Setup not found. Downloading installer..." -ForegroundColor Yellow
  $innoUrl = "https://jrsoftware.org/download.php/is.exe"
  $innoInstaller = Join-Path $env:TEMP "innosetup-6.exe"
  Invoke-WebRequest -Uri $innoUrl -OutFile $innoInstaller -UseBasicParsing

  Write-Host "Installing Inno Setup per-user (no admin required)..." -ForegroundColor Yellow
  Start-Process -FilePath $innoInstaller -ArgumentList "/VERYSILENT","/SUPPRESSMSGBOXES","/NORESTART","/CURRENTUSER" -Wait
  Remove-Item $innoInstaller -Force -ErrorAction SilentlyContinue

  $innoPath = $innoCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $innoPath) {
    Write-Host "Inno Setup install failed. Install manually from https://jrsoftware.org/isdl.php and rerun." -ForegroundColor Red
    exit 1
  }
}
Write-Host "  Inno Setup: $innoPath" -ForegroundColor Green

Write-Section "Step 2/4: Portable Node.js"

if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
  $nodeVersion = "v22.11.0"
  $nodeZipName = "node-$nodeVersion-win-x64"
  $nodeUrl     = "https://nodejs.org/dist/$nodeVersion/$nodeZipName.zip"
  $nodeZip     = Join-Path $toolsDir "node.zip"

  Write-Host "  Downloading Node.js $nodeVersion..." -ForegroundColor Yellow
  Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing

  Write-Host "  Extracting..." -ForegroundColor Yellow
  Expand-Archive -Path $nodeZip -DestinationPath $toolsDir -Force
  Remove-Item $nodeZip -Force

  $extractedDir = Join-Path $toolsDir $nodeZipName
  if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
  Rename-Item $extractedDir $nodeDir
}
Write-Host "  Node portable: $nodeDir" -ForegroundColor Green

Write-Section "Step 3/4: Icon"

if (-not (Test-Path $iconPath)) {
  if (-not (Test-Path $logoPath)) {
    Write-Host "  logo.png not found at project root — cannot generate icon.ico" -ForegroundColor Red
    exit 1
  }

  $py = (Get-Command python -ErrorAction SilentlyContinue).Source
  if (-not $py) {
    Write-Host "  Python not found. Install Python with PIL or provide assets\icon.ico manually." -ForegroundColor Red
    exit 1
  }

  Write-Host "  Generating icon.ico from logo.png..." -ForegroundColor Yellow
  $script = @"
from PIL import Image
import os
src = Image.open(r'$logoPath').convert('RGBA')
os.makedirs(r'$assetsDir', exist_ok=True)
sizes = [(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]
imgs = [src.resize(s, Image.LANCZOS) for s in sizes]
imgs[-1].save(r'$iconPath', format='ICO', sizes=sizes, append_images=imgs[:-1])
for s in (16,32,48,64,96,128,192,256,384,512):
    src.resize((s,s), Image.LANCZOS).save(os.path.join(r'$assetsDir', f'icon-{s}.png'))
src.resize((48,48), Image.LANCZOS).save(os.path.join(r'$assetsDir', 'favicon.ico'), format='ICO', sizes=[(16,16),(32,32),(48,48)])
src.save(os.path.join(r'$assetsDir', 'logo.png'))
"@
  $script | & $py -
}
Write-Host "  Icon: $iconPath" -ForegroundColor Green

Write-Section "Step 4/4: Compile installer"

$issScript = Join-Path $scriptDir "setup.iss"
if (-not (Test-Path $issScript)) {
  Write-Host "  setup.iss missing" -ForegroundColor Red
  exit 1
}

& $innoPath $issScript
if ($LASTEXITCODE -ne 0) {
  Write-Host "  Inno Setup failed with exit code $LASTEXITCODE" -ForegroundColor Red
  exit 1
}

$installer = Get-ChildItem $distDir -Filter "CursorBeam-Setup-*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
  Write-Host ""
  Write-Host ("═" * 55) -ForegroundColor Green
  Write-Host "  Installer ready" -ForegroundColor White
  Write-Host ("═" * 55) -ForegroundColor Green
  Write-Host "  $($installer.FullName)" -ForegroundColor Yellow
  Write-Host ("  {0:N2} MB" -f ($installer.Length / 1MB)) -ForegroundColor Gray
  Write-Host ""
} else {
  Write-Host "  No installer produced — check Inno Setup output." -ForegroundColor Red
  exit 1
}
