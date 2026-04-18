# 🚀 Getting Started with CursorBeam

Welcome! This guide will get you up and running in **5 minutes**.

---

## 📦 Installation

### Step 1: Download

```bash
git clone https://github.com/noambars121/CursorBeam.git
cd CursorBeam
```

### Step 2: Run Installer

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

### Step 3: Fill in the Form

The installer will show a friendly GUI:

```
┌────────────────────────────────────────┐
│  Welcome to CursorBeam Setup           │
├────────────────────────────────────────┤
│                                        │
│  Password: ************                │
│  [ Generate New ]                      │
│                                        │
│  Cursor Path: C:\...\Cursor.exe        │
│  [ Browse... ]                         │
│                                        │
│  Projects Folder: C:\Users\...\code    │
│  [ Browse... ]                         │
│                                        │
│  ☑ Install Tailscale (remote access)  │
│  ☑ Install as Windows Service          │
│                                        │
│           [ Install Now ]              │
└────────────────────────────────────────┘
```

**That's it!** The installer does everything automatically:
- ✅ Installs dependencies
- ✅ Generates secure password
- ✅ Creates Cursor shortcut with CDP enabled
- ✅ Sets up background service
- ✅ Optional Tailscale installation

---

## 🎯 Daily Usage

### How It Works (Automatic!)

```
┌─────────────────────────────────────────────────────┐
│  1. Windows Starts                                  │
│     ↓                                               │
│  📦 Background Service Starts Automatically         │
│     (Supervisor on port 9799)                       │
│                                                     │
│  2. You Double-Click                                │
│     ↓                                               │
│  🖱️ "Cursor (CursorBeam)" Desktop Shortcut         │
│     • Opens Cursor with CDP enabled                 │
│     • Opens your projects folder                    │
│                                                     │
│  3. Service Detects Cursor                          │
│     ↓                                               │
│  🚀 Relay Server Starts Automatically               │
│     (Port 9800 - ready for your phone!)             │
│                                                     │
│  4. Open Phone Browser                              │
│     ↓                                               │
│  📱 http://YOUR-IP:9800                             │
│     • Enter password                                │
│     • Control Cursor from phone!                    │
└─────────────────────────────────────────────────────┘
```

### Step-by-Step

#### On Your Computer:

1. **Launch Cursor** using the new desktop shortcut:
   ```
   🖱️ Double-click "Cursor (CursorBeam)" icon
   ```
   > ⚠️ **Important**: Must use this shortcut! Your old Cursor shortcuts won't work.

2. **That's it!** The background service automatically:
   - Detects Cursor is running
   - Starts the relay server
   - Makes everything accessible from your phone

#### On Your Phone:

1. **Open Browser**
   ```
   Same WiFi:  http://192.168.1.X:9800
   Tailscale:  http://100.X.X.X:9800
   ```
   > 💡 The installer showed you these URLs!

2. **Login**
   - Enter the password from installation
   - Tap "Connect"

3. **Install as PWA** (Optional but Recommended)
   - Tap browser menu → "Add to Home Screen"
   - Now it works like a native app!

4. **Start Controlling!**
   - Send prompts to Cursor
   - View AI responses
   - Execute terminal commands
   - Switch between Agent/Ask/Plan modes
   - Full IDE control from your phone!

---

## 🔥 First Time Setup

### What You'll See on Phone:

#### If Everything is Running:
```
┌────────────────────────────┐
│  Cursor Remote            │
│                           │
│  Enter password:          │
│  ************             │
│                           │
│  [ Connect ]              │
└────────────────────────────┘
```

#### If Relay Not Started:
```
┌────────────────────────────┐
│  ⏱️ CursorBeam Status      │
│                           │
│  Ready to start relay     │
│                           │
│  ● Supervisor ✓           │
│  ● Relay      ✗           │
│                           │
│  [ Start Relay ]          │
└────────────────────────────┘
```

**Just tap "Start Relay"** and you're connected!

---

## 💡 Pro Tips

### 🏠 Add to Home Screen
Makes the PWA feel like a native app:
- **iPhone**: Safari → Share → Add to Home Screen
- **Android**: Chrome → Menu → Add to Home Screen

### 🔒 Security
- Password is generated during install (saved in `.env`)
- All traffic stays on your local network
- No cloud services or telemetry
- Tailscale adds encrypted remote access

### 🌐 Remote Access (Tailscale)
If you installed Tailscale:
1. Install Tailscale app on your phone
2. Login with same account
3. Use the Tailscale IP shown during installation
4. Access from anywhere in the world!

### 🛠️ Managing the Service
```powershell
# Check status
Get-Service CursorBeam

# View in Services GUI
Win+R → services.msc → Find "CursorBeam"

# Restart service
npm run service:restart

# View logs
# Open: C:\ProgramData\CursorBeam\daemon\
```

---

## ❓ Troubleshooting

### Relay Won't Start

**Symptom**: Phone shows "Supervisor running but relay won't start"

**Solution**:
1. Make sure you're using the **"Cursor (CursorBeam)"** shortcut
2. Your old Cursor shortcuts don't have CDP enabled
3. Close Cursor completely
4. Launch via the new shortcut
5. Tap "Start Relay" on phone

### Can't Connect from Phone

**Symptom**: "Connection refused" or timeout

**Check**:
```powershell
# 1. Is service running?
Get-Service CursorBeam

# 2. Is relay responding?
curl http://localhost:9800/health

# 3. Get your IP address
ipconfig
# Look for IPv4 Address
```

**Solution**: Make sure phone and PC are on same WiFi

### Service Not Found

**Symptom**: Service not in services.msc

**Solution**: Reinstall as service
```powershell
npm run service:install
```

---

## 🎓 Learn More

- 📖 [README.md](README.md) - Full documentation
- 🔧 [SERVICE.md](SERVICE.md) - Windows Service details
- 🚨 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- 🌟 [FEATURES.md](FEATURES.md) - All features

---

## 🎉 You're Ready!

That's all you need to know to get started!

**Quick Recap**:
1. ✅ Installed CursorBeam
2. ✅ Launch Cursor with special shortcut
3. ✅ Open phone browser to your IP:9800
4. ✅ Control Cursor from anywhere!

Enjoy controlling Cursor from your phone! 🚀

---

**Need Help?** [Open an Issue](https://github.com/noambars121/CursorBeam/issues/new)
