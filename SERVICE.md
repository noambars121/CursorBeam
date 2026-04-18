# Windows Service Installation

CursorBeam can be installed as a Windows Service (daemon) that runs in the background and starts automatically with Windows.

## Benefits of Windows Service

- **Auto-start on boot**: Starts automatically when Windows starts
- **Background operation**: Runs silently without any visible windows
- **Auto-recovery**: Automatically restarts if it crashes
- **Proper process management**: Can be managed through Windows Services
- **System integration**: Better integration with Windows system features

## Installation

### Option 1: Via GUI Installer (Recommended)

1. Run the installer:
   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```

2. Check "Install as Windows Service"

3. Click "Install Now"

4. When prompted for administrator access, click "Yes"

### Option 2: Via Command Line

```powershell
# Install dependencies first
npm install

# Install as Windows Service (requires admin)
npm run service:install
```

**Note**: You must run PowerShell as Administrator!

## Managing the Service

### Check Service Status

Open Services Manager:
```powershell
# Method 1: Windows Services GUI
Win+R → services.msc → Find "CursorBeam"

# Method 2: PowerShell
Get-Service -Name "CursorBeam"
```

### Start/Stop Service

```powershell
# Start service
npm run service:start

# Stop service
npm run service:stop

# Restart service
npm run service:restart
```

Or use Windows Services GUI (services.msc)

### View Service Logs

Logs are stored in:
```
C:\ProgramData\CursorBeam\daemon\
```

Or view in Event Viewer:
```
Win+R → eventvwr.msc → Windows Logs → Application
Filter by source: "CursorBeam"
```

### Uninstall Service

```powershell
# Stop and uninstall (requires admin)
npm run service:uninstall
```

## Troubleshooting

### "Administrator privileges required"

You need to run PowerShell as Administrator:

1. Search for "PowerShell" in Start Menu
2. Right-click → "Run as administrator"
3. Navigate to CursorBeam folder
4. Run the service command again

### Service won't start

1. Check if .env file exists:
   ```powershell
   Test-Path .env
   ```
   If false, run: `npm run setup`

2. Check service status:
   ```powershell
   Get-Service -Name "CursorBeam" | Select-Object Status, StartType
   ```

3. View error logs:
   ```powershell
   Get-EventLog -LogName Application -Source "CursorBeam" -Newest 10
   ```

### Service keeps stopping

Check the logs in Event Viewer for error details. Common causes:

- Missing .env file
- Invalid Cursor path in .env
- Port already in use (9800 or 9222)
- Cursor.exe not found

### Reinstalling Service

If you need to reinstall:

```powershell
# 1. Uninstall
npm run service:uninstall

# 2. Wait a few seconds
Start-Sleep -Seconds 5

# 3. Reinstall
npm run service:install
```

### Check if Service is Running

```powershell
# PowerShell
Get-Service -Name "CursorBeam"

# Task Manager
Ctrl+Shift+Esc → Services tab → Find "CursorBeam"

# Test server response
curl http://localhost:9800/health
```

## Manual Installation (Advanced)

If npm scripts don't work, you can install manually:

```powershell
# Install with node directly
node service-install.js
```

## Service Configuration

The service runs with these settings:

- **Name**: CursorBeam
- **Display Name**: CursorBeam
- **Description**: CursorBeam - Remote control Cursor IDE from mobile devices
- **Startup Type**: Automatic
- **Recovery**: Restart on failure
- **Working Directory**: CursorBeam installation folder

## Comparison: Service vs. Manual Start

| Feature | Windows Service | Manual Start (npm start) |
|---------|----------------|--------------------------|
| Auto-start on boot | ✅ Yes | ❌ No |
| Runs in background | ✅ Always | ⚠️ Only while terminal open |
| Survives logout | ✅ Yes | ❌ No |
| Auto-recovery | ✅ Yes | ❌ No |
| Windows integration | ✅ Full | ⚠️ Limited |
| Easy to stop/restart | ✅ Via GUI/commands | ⚠️ Close terminal |
| View logs | ✅ Event Viewer | ⚠️ Terminal only |

## Security Considerations

- The service runs under the Local System account by default
- It has access to all files in the installation directory
- The .env file should be protected (no public access)
- Consider using a dedicated service account for production

## Performance

The Windows Service uses the same resources as manual start:

- **Memory**: ~50-100MB
- **CPU (idle)**: <5%
- **CPU (active)**: 10-20%

No additional overhead from running as a service.

## Alternative: Task Scheduler

If you can't install as a service, you can use Windows Task Scheduler:

1. Open Task Scheduler (taskschd.msc)
2. Create Basic Task → "CursorBeam"
3. Trigger: "When the computer starts"
4. Action: "Start a program"
5. Program: `powershell.exe`
6. Arguments: `-ExecutionPolicy Bypass -File "C:\path\to\CursorBeam\start-hidden.ps1"`

This provides basic auto-start but without the recovery and management features.

## Support

If you encounter issues:

1. Check Event Viewer for error logs
2. Verify .env configuration
3. Test manual start first: `npm start`
4. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
5. Open an issue: https://github.com/noambars121/CursorBeam/issues

---

**Recommended**: Install as Windows Service for the best experience!
