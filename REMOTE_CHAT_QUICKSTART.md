# Remote Chat (UIA) - Quick Start Guide

Get up and running with Remote Chat in 5 minutes!

## What is Remote Chat (UIA)?

Control Cursor IDE's AI Chat directly from your iPhone using Windows UI Automation - no screen capture needed!

## Prerequisites

✅ Windows 10/11  
✅ .NET 8 SDK installed  
✅ Cursor IDE installed  
✅ Node.js 18+ installed  
✅ Tailscale set up (optional but recommended)

---

## Step 1: Build the UIA Host (5 minutes)

```powershell
# Navigate to project
cd "C:\Users\Noam\Music\cursor mobile"

# Go to host directory
cd host

# Restore & build
dotnet restore
dotnet build -c Release

# Run the host (keep this window open)
.\bin\Release\net8.0-windows\CursorChatHost.exe
```

You should see:
```
=== Cursor Chat Host (UIA) ===
Starting on http://127.0.0.1:8788
Press Ctrl+C to exit
```

✅ **Leave this running!**

---

## Step 2: Start Cursor IDE

Just open Cursor normally. The UIA host will automatically find it.

---

## Step 3: Start the Node Bridge

Open a **new** PowerShell window:

```powershell
cd "C:\Users\Noam\Music\cursor mobile"

# Build (if not already built)
npm run build

# Start server
npm start
```

Or with PM2 for auto-restart:
```powershell
pm2 start npm --name cursor-mobile -- start
```

---

## Step 4: Open PWA on iPhone

1. Open Safari on your iPhone
2. Go to: `http://<your-pc-ip>:8765`
   - Find your PC IP: `ipconfig` (look for IPv4)
   - Or use Tailscale hostname
3. **Add to Home Screen** for PWA experience
4. Login with your password (from `.env` file)

---

## Step 5: Test Remote Chat!

1. In the PWA, go to **Chat** tab
2. You'll see **"Remote Chat (UIA)"** at the top
3. Type a message: "בדיקה 1 2 3" (or any text)
4. Click **"שלח לצ'אט של Cursor"**
5. Watch it appear in Cursor's AI Chat on your PC! 🎉

---

## Status Indicators

- 🟢 **מחובר ✓** (Connected) - Everything working!
- 🟠 **בדיקה...** (Checking) - Connecting...
- 🔴 **לא זמין** (Unavailable) - UIA host not running

---

## Troubleshooting

### "לא זמין" (Unavailable)?
1. Check if `CursorChatHost.exe` is running
2. Restart the UIA host
3. Make sure Cursor IDE is open

### Message not appearing in Cursor?
1. Open Cursor's Chat panel (Ctrl+L)
2. Make sure Cursor window is not minimized
3. Check UIA host console for errors

### Can't connect from iPhone?
1. Verify PC and iPhone are on same network
2. Check Windows Firewall allows port 8765
3. Try PC's IP instead of hostname

---

## Next Steps

- Read full documentation: `REMOTE_CHAT_UIA.md`
- Set up as Windows Service for auto-start
- Configure Tailscale for secure remote access
- Explore the PWA's other features (Files, Projects, Settings)

---

## Quick Commands Reference

**Build UIA Host:**
```powershell
cd host && dotnet build -c Release
```

**Run UIA Host:**
```powershell
.\bin\Release\net8.0-windows\CursorChatHost.exe
```

**Start Bridge:**
```powershell
npm start
# or
pm2 start npm --name cursor-mobile -- start
```

**Check UIA Host Status:**
```powershell
curl http://127.0.0.1:8788/
```

**Test Type Endpoint:**
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8788/type" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"text":"Test from PowerShell"}'
```

---

## Support

Having issues? Check:
1. UIA host console output
2. Node bridge logs (`pm2 logs cursor-mobile`)
3. Full documentation in `REMOTE_CHAT_UIA.md`

Enjoy remote coding! 🚀

