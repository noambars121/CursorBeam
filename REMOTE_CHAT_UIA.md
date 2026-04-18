# Remote Chat (UIA) - Setup & Usage Guide

## Overview

The **Remote Chat (UIA)** feature allows you to control Cursor IDE's AI Chat directly from your mobile device via the PWA. It uses **Windows UI Automation (UIA)** to:
- Type messages into Cursor's chat input
- Read chat transcript when available
- Fallback to server-side transcript when UIA read fails

**Key Features:**
- ✅ No screen capture or OBS required
- ✅ Direct text-based interaction
- ✅ Works over Tailscale
- ✅ Secure (API key + loopback-only UIA host)
- ✅ Real-time chat mirroring with 3-second polling

---

## Architecture

```
[iPhone PWA] 
    ↓ HTTPS over Tailscale
[Node Bridge Server] (port 8765)
    ↓ HTTP localhost only
[C# UIA Host] (port 8788)
    ↓ UI Automation
[Cursor IDE] Windows App
```

**Components:**
1. **CursorChatHost.exe** (C# .NET 8): Windows service that uses UIA to interact with Cursor
2. **Node Bridge** (Express): Proxy routes + server transcript fallback
3. **PWA** (Mobile): Chat interface with polling

---

## Setup Instructions

### 1. Build the C# UIA Host

```powershell
# Navigate to host directory
cd host

# Restore dependencies
dotnet restore

# Build the project
dotnet build -c Release

# Run the host (leave this running)
.\bin\Release\net8.0-windows\CursorChatHost.exe
```

**Expected Output:**
```
=== Cursor Chat Host (UIA) ===
Starting on http://127.0.0.1:8788
Press Ctrl+C to exit
```

### 2. Configure Environment Variables

Add to your `.env` file:

```env
# Remote Chat (UIA) Configuration
UIA_HOST=http://127.0.0.1:8788
```

### 3. Start the Bridge Server

```powershell
# Install dependencies (if not already done)
npm install

# Build TypeScript
npm run build

# Start server
npm start
```

Or use PM2 for auto-restart:

```powershell
pm2 start npm --name cursor-mobile -- start
pm2 save
```

### 4. Open PWA on iPhone

1. Connect to your PC's Tailscale IP
2. Navigate to: `https://<tailscale-ip>:8765`
3. Login with your password
4. Go to **Chat** tab
5. You should see **"Remote Chat (UIA)"** section at the top

---

## Usage

### Sending Messages

1. Type your message in the **Remote Chat** input box
2. Click "שלח לצ'אט של Cursor" (Send to Cursor Chat)
3. The message will be typed into Cursor's AI Chat on your PC
4. Status indicator shows connection state:
   - 🟢 **מחובר ✓** (Connected) - UIA host is running
   - 🔴 **לא זמין** (Unavailable) - UIA host is offline

### Viewing Chat Transcript

The PWA will automatically poll for chat updates every 3 seconds (pauses while typing).

**Transcript Sources:**
- **UIA** (preferred): Reads chat messages directly from Cursor using UI Automation
- **Server** (fallback): Shows messages sent through the bridge and agent responses

### Keyboard Shortcuts

- **Ctrl + Enter**: Send message (in Remote Chat input)

---

## How It Works

### Typing Messages

1. PWA → POST `/api/rchat/type` with text
2. Bridge → POST `http://127.0.0.1:8788/type`
3. UIA Host:
   - Finds Cursor window (by process name "Cursor.exe")
   - Brings window to foreground
   - Searches for chat input element using UIA tree
   - Uses `ValuePattern` to set text (if supported)
   - Falls back to `SendInput` keystrokes
   - Sends Enter key
4. Message appears in Cursor's AI Chat

### Reading Chat Transcript

1. PWA → GET `/api/rchat/dump` (every 3 seconds)
2. Bridge → GET `http://127.0.0.1:8788/dump`
3. UIA Host:
   - Traverses UIA tree for Document/List/Text elements
   - Extracts text using `TextPattern` or `ValuePattern`
   - Returns array of `{role, text, author}`
4. If UIA read fails → Bridge returns server transcript (messages sent + agent responses)

---

## Troubleshooting

### ❌ Status shows "לא זמין" (Unavailable)

**Solutions:**
1. Check if `CursorChatHost.exe` is running
2. Verify port 8788 is not in use:
   ```powershell
   netstat -ano | findstr "8788"
   ```
3. Check UIA host logs for errors

### ❌ Messages not appearing in Cursor

**Possible Causes:**
1. **Cursor not running**: Start Cursor IDE first
2. **Chat panel not visible**: Open the Chat panel in Cursor (Ctrl+L)
3. **UIA element not found**: Check UIA host logs for element detection errors

**Solutions:**
- Ensure Cursor window is not minimized
- Try focusing Cursor window manually before sending
- Check if Cursor updated (UIA element selectors may need adjustment)

### ❌ Can't read chat transcript (always shows server fallback)

This is **expected behavior** in most cases. Cursor's chat UI may not expose text via UIA `TextPattern` or `ValuePattern`. The fallback server transcript will show:
- All messages you sent via Remote Chat
- All agent responses (captured from `/api/chat` endpoint)

### ❌ Build errors for C# project

**Common Issues:**
1. **UIAutomationClient not found**: 
   - Make sure you're on Windows
   - .NET 8 SDK installed
   - Target framework is `net8.0-windows`

2. **Vanara.PInvoke.User32 not found**:
   ```powershell
   dotnet add package Vanara.PInvoke.User32 --version 4.0.1
   ```

---

## Security Considerations

### ✅ Safeguards Implemented

1. **Loopback Only**: UIA host binds to `127.0.0.1` (not accessible from network)
2. **API Key**: All bridge routes require authentication token
3. **Rate Limiting**: 2-second cooldown between `/type` requests
4. **Input Sanitization**: Only allows printable ASCII, Hebrew, newlines
5. **No External Exposure**: UIA host never exposed outside localhost

### 🔒 Best Practices

- Keep `UIA_HOST` set to `127.0.0.1:8788` (never change to `0.0.0.0`)
- Use strong `LOGIN_PASSWORD` for bridge authentication
- Run UIA host as current user (not as admin unless necessary)
- Close UIA host when not in use

---

## Advanced Configuration

### Change UIA Host Port

Edit `host/Program.cs`:

```csharp
builder.WebHost.UseUrls("http://127.0.0.1:9999"); // Change port
```

Update `.env`:
```env
UIA_HOST=http://127.0.0.1:9999
```

### Adjust Polling Interval

Edit `src/web/app.js`:

```javascript
rchatPollingInterval = setInterval(() => {
  if (state.currentTab === 'chat' && !rchatIsTyping) {
    fetchRemoteChatTranscript();
  }
}, 5000); // Change from 3000ms to 5000ms (5 seconds)
```

### Customize UIA Element Search

If Cursor's UI structure changes, update `host/CursorUiAutomation.cs`:

```csharp
private AutomationElement? FindChatInputElement()
{
    // Add more search patterns
    if (name.Contains("your-custom-keyword") || 
        autoId.Contains("your-id-pattern"))
    {
        return elem;
    }
}
```

---

## Development & Testing

### Test UIA Host Directly

```powershell
# Test /type endpoint
Invoke-RestMethod -Uri "http://127.0.0.1:8788/type" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"text":"Test message from PowerShell"}'

# Test /dump endpoint
Invoke-RestMethod -Uri "http://127.0.0.1:8788/dump" -Method GET
```

### Debug Mode

Add logging to `CursorUiAutomation.cs`:

```csharp
Console.WriteLine($"[DEBUG] Found element: {elem.Current.Name} | {elem.Current.ClassName}");
```

### Monitor Server Transcript

Bridge logs will show:
```
[RCHAT] Typing text to Cursor
[RCHAT] Text sent successfully
[RCHAT] Returning UIA transcript (12 items)
[RCHAT] Returning server transcript (8 items)
```

---

## Limitations

1. **Windows Only**: UIA is Windows-specific (no macOS/Linux support)
2. **UIA Read May Fail**: Cursor may not expose chat text via UIA (server fallback works)
3. **Single Cursor Instance**: Finds first running Cursor process
4. **Foreground Focus**: May bring Cursor to front when typing
5. **Element Detection**: Depends on Cursor's UI structure (may break on updates)

---

## Roadmap / Future Enhancements

- [ ] Support multiple Cursor instances
- [ ] Better UIA element caching (reduce search time)
- [ ] OCR fallback for chat reading (if UIA fails)
- [ ] Configurable hotkeys for chat focus
- [ ] Auto-detect Cursor version and adjust selectors
- [ ] macOS support (using Accessibility API)

---

## FAQ

**Q: Why not use screen capture like OBS?**  
A: Screen capture is resource-intensive, requires encoding/decoding, and has latency. UIA provides direct, lightweight text-based interaction.

**Q: Can I use this on macOS/Linux?**  
A: Not currently. UIA is Windows-only. You'd need to implement a similar solution using Accessibility APIs on macOS or X11/Wayland automation on Linux.

**Q: Will this work with future Cursor updates?**  
A: Possibly. If Cursor changes its UI structure, the UIA element selectors may need adjustment. The SendInput fallback should be more robust.

**Q: Can I run UIA host as a Windows Service?**  
A: Yes! Use `NSSM` or `WinSW` to install `CursorChatHost.exe` as a service. However, you may need to configure the service to run in the user's session (not SYSTEM) to interact with GUI apps.

**Q: Does this work with Cursor in fullscreen mode?**  
A: Yes, but you may need to adjust the foreground focus logic in `BringToForeground()`.

---

## Support

If you encounter issues:
1. Check UIA host logs (console output)
2. Check bridge server logs (`pm2 logs cursor-mobile` if using PM2)
3. Verify Cursor is running and accessible
4. Test UIA host endpoints directly (see Testing section)

For bugs or feature requests, please open an issue on the project repository.

---

## License

Same as the main Cursor Mobile project.

