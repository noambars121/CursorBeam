# Installing Tailscale

Tailscale provides secure remote access to your CursorBeam server from anywhere in the world.

## Automatic Installation (via installer)

The CursorBeam installer can install Tailscale automatically:

1. Run `install.ps1`
2. Check the "Install Tailscale" option
3. Click "Install Now"
4. The installer will download and install Tailscale

## Manual Installation

If automatic installation fails or you prefer to install manually:

### Step 1: Download Tailscale

Visit: https://tailscale.com/download/windows

Or use PowerShell:
```powershell
# Download latest Tailscale installer
$url = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe"
$output = "$env:TEMP\tailscale-setup.exe"
Invoke-WebRequest -Uri $url -OutFile $output

# Run installer
Start-Process -FilePath $output -Wait
```

### Step 2: Launch Tailscale

1. Open Tailscale from the system tray (near the clock)
2. If you don't see it, search for "Tailscale" in Windows Start menu

### Step 3: Login

1. Click "Log in" in the Tailscale window
2. Choose your authentication method:
   - Google Account (recommended)
   - Microsoft Account
   - GitHub Account
   - Or create a new Tailscale account

3. Complete the authentication in your browser
4. Return to Tailscale app

### Step 4: Get Your Tailscale IP

Open PowerShell and run:
```powershell
tailscale ip -4
```

You'll see something like: `100.64.123.45`

This is your Tailscale IP address!

### Step 5: Install Tailscale on Your Phone

#### iPhone/iPad:
1. Open App Store
2. Search for "Tailscale"
3. Install the app (it's free!)
4. Open Tailscale and login with **the same account** you used on your PC

#### Android:
1. Open Google Play Store
2. Search for "Tailscale"
3. Install the app (it's free!)
4. Open Tailscale and login with **the same account** you used on your PC

### Step 6: Connect to CursorBeam

1. Make sure Tailscale is connected on both PC and phone
2. Start CursorBeam server: `npm start`
3. On your phone, open browser and go to:
   ```
   http://YOUR-TAILSCALE-IP:9800
   ```
   (Replace YOUR-TAILSCALE-IP with the IP from Step 4)

4. Login with your CursorBeam password

## Verification

To verify Tailscale is working:

### On PC:
```powershell
# Check Tailscale status
tailscale status

# List all connected devices
tailscale status --peers

# Get your IP
tailscale ip -4
```

### On Phone:
1. Open Tailscale app
2. You should see your PC in the list of devices
3. Status should show "Connected"

## Troubleshooting

### Tailscale not showing in system tray

1. Press `Win + R`
2. Type: `shell:startup`
3. Check if "Tailscale" shortcut exists
4. If not, reinstall Tailscale

### Cannot connect from phone

1. **Check same account**: Verify both devices use the same Tailscale account
2. **Check connection**: Ensure Tailscale shows "Connected" on both devices
3. **Check firewall**: 
   ```powershell
   New-NetFirewallRule -DisplayName "CursorBeam" -Direction Inbound -LocalPort 9800 -Protocol TCP -Action Allow
   ```

### "tailscale: command not found"

The PATH wasn't updated. Try:

1. Close and reopen PowerShell/CMD
2. Or restart your computer
3. Or manually add to PATH:
   ```
   C:\Program Files\Tailscale
   ```

### Slow connection over Tailscale

This is normal in some network configurations. Tailscale uses a relay server when direct connection isn't possible.

To check:
```powershell
tailscale status --peers
```

If you see "relay" or "DERP", the connection is going through Tailscale's relay. It's still secure, just slightly slower.

## Security

Tailscale is extremely secure:

- **End-to-end encryption** using WireGuard protocol
- **Zero-trust architecture** - only your devices can connect
- **No open ports** on your router
- **Free for personal use** (up to 100 devices)

## Advanced Configuration

### Custom Port

If you want to use a different port:

1. Edit `.env` file:
   ```
   PORT=8080
   ```

2. Connect using:
   ```
   http://YOUR-TAILSCALE-IP:8080
   ```

### Share Access with Someone

1. Go to: https://login.tailscale.com/admin/machines
2. Find your PC in the list
3. Click "Share..."
4. Send the link to your friend
5. They'll need Tailscale installed too

**Note**: They'll also need your CursorBeam password!

## Uninstalling Tailscale

If you want to remove Tailscale:

1. Windows Settings → Apps → Tailscale → Uninstall
2. Or use PowerShell:
   ```powershell
   Get-Package Tailscale | Uninstall-Package
   ```

## Need Help?

- **Tailscale Docs**: https://tailscale.com/kb/
- **Tailscale Support**: support@tailscale.com
- **CursorBeam Issues**: https://github.com/noambars121/CursorBeam/issues

---

**Remember**: Tailscale is optional! You can use CursorBeam without it by connecting on the same WiFi network.
