# Cursor Mobile - Installation Guide

Control Cursor IDE from your phone — a private PWA with full Agent, Ask, Plan, Debug, Terminal, and more.

---

## 🚀 Quick Install (Windows)

### Option 1: Automatic Setup (Recommended)

```powershell
# Clone the repository
git clone https://github.com/noambars121/CursorBeam.git
cd CursorBeam

# Run setup (installs dependencies and creates config)
npm run setup
```

The setup script will:
- ✅ Install all dependencies
- ✅ Generate a secure password
- ✅ Auto-detect your Cursor installation
- ✅ Create your `.env` configuration
- ✅ Show your connection URL

### Option 2: Manual Setup

```powershell
# 1. Install dependencies
npm install

# 2. Create configuration
copy .env.example .env
notepad .env

# 3. Edit .env and set:
#    - V2_PASSWORD (your login password)
#    - V2_CURSOR_EXE (path to Cursor.exe)

# 4. Start the server
npm run v2:start
```

---

## 📱 Connecting from Your Phone

1. **Same WiFi Network:**
   - The setup script shows your connection URL
   - Open it on your phone: `http://YOUR-IP:9800`

2. **Tailscale (Recommended for Remote Access):**
   - Install Tailscale on both PC and phone
   - Use your Tailscale IP: `http://TAILSCALE-IP:9800`

3. **Login:**
   - Enter the password from your `.env` file
   - The PWA saves your session

---

## 🔧 Configuration

### Basic Settings

Edit `.env` to customize:

```bash
# Your login password (required)
V2_PASSWORD=your-secure-password

# Path to Cursor.exe (required)
V2_CURSOR_EXE=C:\Users\YourName\AppData\Local\Programs\cursor\Cursor.exe

# Server port (optional, default: 9800)
V2_PORT=9800

# Chrome DevTools port (optional, default: 9222)
V2_CDP_PORT=9222
```

### Project Switching (Optional)

To enable the project picker in the PWA:

```bash
# Set your projects root directory
V2_PROJECTS_ROOT=C:\Users\YourName\projects
```

The app will scan subfolders and show them in the menu.

### Performance Tuning (Optional)

```bash
# Polling interval in ms (default: 1500)
# Lower = more responsive, higher = less CPU
V2_POLL_MS=1500
```

---

## 🎯 Usage

### Starting the Server

```powershell
npm run v2:start
```

This will:
1. Launch Cursor with Chrome DevTools enabled
2. Start the relay server
3. Show your connection URLs

### Stopping the Server

Press `Ctrl+C` in the terminal.

### Scripts Reference

```powershell
npm run setup          # Initial setup (run once)
npm run v2:start       # Start server + Cursor
npm run v2:relay       # Start relay only (if Cursor already running)
npm run check          # TypeScript type check
```

---

## 🌐 Accessing Remotely

### Tailscale (Recommended)

1. **Install Tailscale:**
   - Windows: https://tailscale.com/download/windows
   - Phone: App Store / Play Store

2. **Connect both devices** to your Tailnet

3. **Get your Tailscale IP:**
   ```powershell
   tailscale ip -4
   ```

4. **Connect from phone:** `http://YOUR-TAILSCALE-IP:9800`

### Port Forwarding (Advanced)

If you need public access:

1. Forward port `9800` on your router
2. Use your public IP: `http://YOUR-PUBLIC-IP:9800`
3. ⚠️ **Security:** Use a strong password and HTTPS reverse proxy

---

## 📱 PWA Installation

### iPhone/iPad

1. Open the URL in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. The PWA now works like a native app

### Android

1. Open the URL in Chrome
2. Tap the menu (⋮)
3. Tap "Add to Home Screen"
4. The PWA installs as an app

---

## 🔒 Security

- **Password:** Strong random password generated during setup
- **Network:** Local network only by default (127.0.0.1)
- **No Cloud:** Everything runs locally on your machine
- **Token:** JWT-based session tokens (stored in localStorage)

### Changing Your Password

Edit `.env` and change `V2_PASSWORD`:

```bash
V2_PASSWORD=new-secure-password
```

Restart the server. All devices will need to re-login.

---

## 🛠️ Troubleshooting

### Server won't start

**Check if ports are in use:**
```powershell
netstat -ano | findstr "9800"
netstat -ano | findstr "9222"
```

**Kill conflicting processes:**
```powershell
taskkill /F /PID <PID>
```

### Can't connect from phone

1. **Check firewall:** Allow port 9800 in Windows Firewall
2. **Verify IP:** Run `ipconfig` and confirm your phone uses the same subnet
3. **Test locally:** Open `http://localhost:9800` on your PC first

### Cursor not launching

1. **Verify path:** Check `V2_CURSOR_EXE` in `.env`
2. **Close Cursor:** The script can't start Cursor if it's already running
3. **Manual launch:** Start Cursor with CDP:
   ```powershell
   & "C:\...\Cursor.exe" --remote-debugging-port=9222
   ```

### PWA not updating

- **Clear cache:** On your phone, delete and re-add the PWA
- **Hard reload:** Settings → Clear site data

---

## 📦 Directory Structure

```
cursor-mobile/
├── v2/                    # Main application
│   ├── start.ts          # Launcher
│   ├── relay-server.ts   # HTTP + WebSocket server
│   ├── state-manager.ts  # CDP state polling
│   ├── cdp-client.ts     # Chrome DevTools Protocol client
│   ├── client.html       # PWA frontend
│   └── dom-extractor.ts  # Chat extraction logic
├── .env                  # Your configuration (generated)
├── .env.example          # Configuration template
├── setup.ps1             # Setup script
├── package.json          # Dependencies
└── README.md             # Project info
```

---

## 🤝 Contributing

Found a bug? Want to add a feature?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details

---

## ❓ FAQ

**Q: Does this send my code/data anywhere?**  
A: No. Everything runs locally on your machine. Zero cloud services.

**Q: Can I use this on macOS/Linux?**  
A: Not yet. The current version is Windows-only. PRs welcome!

**Q: Is this official Cursor software?**  
A: No. This is a community project, not affiliated with Cursor.

**Q: What if Cursor updates?**  
A: The app uses Chrome DevTools Protocol and DOM selectors. Major Cursor UI changes may require updates.

---

## 🙏 Credits

Built with:
- Node.js + TypeScript
- Chrome DevTools Protocol
- WebSocket for real-time sync
- Express for HTTP server
- Modern PWA standards

---

**Need help?** Open an issue on GitHub.
