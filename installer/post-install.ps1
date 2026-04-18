# CursorBeam post-install: called by the Inno Setup [Run] section after
# files are copied and dependencies installed. Creates the Cursor (CDP)
# desktop shortcut so the user can launch Cursor with the right flag,
# and prints the URL they should open on their phone.

param(
  [Parameter(Mandatory = $true)]
  [string]$InstallPath
)

$ErrorActionPreference = "SilentlyContinue"

Set-Location $InstallPath

# ---- Read config out of the .env that setup.iss just wrote -------------------

$envPath   = Join-Path $InstallPath ".env"
$cursorExe = ""
$port      = "9800"

if (Test-Path $envPath) {
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*CURSOR_EXE\s*=\s*(.+?)\s*$') { $cursorExe = $matches[1] }
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$')       { $port      = $matches[1] }
  }
}

# ---- Desktop shortcut: Cursor with remote-debugging-port ---------------------

if ($cursorExe -and (Test-Path $cursorExe)) {
  $wsh          = New-Object -ComObject WScript.Shell
  $desktop      = [Environment]::GetFolderPath("Desktop")
  $shortcutPath = Join-Path $desktop "Cursor (CursorBeam).lnk"

  $sc = $wsh.CreateShortcut($shortcutPath)
  $sc.TargetPath       = $cursorExe
  $sc.Arguments        = "--remote-debugging-port=9222"
  $sc.WorkingDirectory = Split-Path $cursorExe -Parent
  $sc.IconLocation     = Join-Path $InstallPath "assets\icon.ico"
  $sc.Description      = "Launch Cursor IDE with CursorBeam remote control enabled"
  $sc.Save()

  Write-Host "Created desktop shortcut: $shortcutPath" -ForegroundColor Green
}

# ---- Final hints ------------------------------------------------------------

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and
    $_.IPAddress -notlike '169.254.*'
  } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "CursorBeam installed." -ForegroundColor Green
Write-Host "  Local:  http://localhost:$port"
if ($lanIp) { Write-Host "  LAN:    http://${lanIp}:${port}" }
Write-Host ""
Write-Host "Launch 'CursorBeam' from the Start Menu or Desktop to start the relay." -ForegroundColor Cyan
