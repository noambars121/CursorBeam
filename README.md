# 📱 Cursor Mobile

**Control Cursor IDE from your phone.** A powerful, private PWA that mirrors your Cursor workspace to any device on your network.

---

## ✨ Features

- 🤖 **Full Agent Mode** — Chat, Plan, Ask, Debug modes
- 💬 **Complete Chat Control** — Send prompts, view responses, approve tools
- 🔧 **Edit Messages** — Branch conversations, restore checkpoints
- 💻 **Terminal Access** — Run commands, view output, switch tabs
- 📂 **Project Switching** — Quick access to all your projects
- 🎨 **Model Picker** — Switch between Claude, GPT, and more
- 📊 **Rich Rendering** — Tool cards, thinking blocks, markdown, tables
- 🔒 **100% Private** — Everything runs locally, zero cloud services
- 📱 **Native Feel** — PWA installs like a real app

---

## 🚀 Quick Start

### Option 1: Installer with GUI (Recommended)

```powershell
# 1. Clone the repo
git clone https://github.com/YOUR-USERNAME/cursor-mobile.git
cd cursor-mobile

# 2. Run the installer
powershell -ExecutionPolicy Bypass -File install.ps1
```

A setup window will guide you through:
- ✅ Setting your password
- ✅ Auto-detecting Cursor location
- ✅ Installing Tailscale (optional)
- ✅ Configuring autostart

### Option 2: Command Line Setup

```powershell
# 1. Clone and setup
git clone https://github.com/YOUR-USERNAME/cursor-mobile.git
cd cursor-mobile
npm run setup

# 2. Start the server
npm start
```

**📱 See [QUICKSTART.md](QUICKSTART.md) for step-by-step instructions in Hebrew**

---

## 📖 Documentation

- **[Installation Guide](INSTALL.md)** — Detailed setup instructions
- **[Configuration](#configuration)** — Customize your setup
- **[Remote Access](#remote-access)** — Connect from anywhere with Tailscale
- **[Security](#security)** — How your data stays private

---

## ⚙️ Configuration

The setup script creates a `.env` file automatically. You can edit it to customize:

```bash
# Your login password
V2_PASSWORD=your-secure-password

# Path to Cursor.exe (auto-detected)
V2_CURSOR_EXE=C:\Users\...\Cursor.exe

# Server port (default: 9800)
V2_PORT=9800

# Optional: Enable project switching
V2_PROJECTS_ROOT=C:\Users\YourName\projects
```

See [`.env.example`](.env.example) for all options.

---

## 🌐 Remote Access

### Same WiFi Network

The setup script shows your local IP. Just open it on your phone!

### Tailscale (Recommended)

For access from anywhere:

1. Install [Tailscale](https://tailscale.com) on your PC and phone
2. Get your Tailscale IP: `tailscale ip -4`
3. Connect: `http://YOUR-TAILSCALE-IP:9800`

No port forwarding, no public IP needed — completely secure!

---

## 🔒 Security

- **Password-protected** — Strong random password generated during setup
- **Local-only by default** — Binds to 127.0.0.1, only accessible on your network
- **No cloud services** — Everything runs on your machine
- **JWT sessions** — Secure token-based authentication
- **Open source** — Audit the code yourself

---

## 📱 Installing as an App

### iPhone/iPad
1. Open in Safari → Share → "Add to Home Screen"
2. The PWA works like a native app!

### Android
1. Open in Chrome → Menu (⋮) → "Add to Home Screen"
2. Installed as a full app!

---

## 🎯 Usage

### Sending Messages

Type in the composer and hit send — just like in Cursor!

### Approving Tools

When Cursor asks for approval, tap the button in the PWA to approve/reject.

### Editing Messages

Long-press (or click) a human message to edit and branch the conversation.

### Switching Projects

Tap the project button in the header to switch workspaces.

### Terminal Commands

Switch to the Terminal tab, type commands, and see live output.

### Loading Full History

Tap "טען כל ההיסטוריה" to load the complete chat history automatically.

---

## 🛠️ Troubleshooting

Having issues? Check our comprehensive troubleshooting guide:

**📖 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Complete troubleshooting guide

**Quick fixes:**
- Can't connect? → Check firewall allows port 9800
- Server won't start? → Check if port is in use: `netstat -ano | findstr 9800`
- PWA not updating? → Clear site data and reinstall PWA

**Still stuck?** Open an issue on GitHub with your logs.

---

## 🏗️ Architecture

```
┌─────────────┐
│   Phone     │
│   (PWA)     │  ← WebSocket →  ┌──────────────────┐
└─────────────┘                  │  Relay Server    │
                                 │  (Node.js)       │
                                 └──────────────────┘
                                          ↓
                                 Chrome DevTools Protocol
                                          ↓
                                 ┌──────────────────┐
                                 │  Cursor IDE      │
                                 │  (Electron)      │
                                 └──────────────────┘
```

The relay server:
1. Launches Cursor with CDP enabled
2. Polls the DOM via CDP to extract chat state
3. Broadcasts changes to connected PWA clients via WebSocket
4. Injects user input back into Cursor's composer

Everything stays on your machine — no data leaves your network!

---

## 🤝 Contributing

Contributions welcome!

```powershell
# Fork the repo, then:
git clone https://github.com/YOUR-USERNAME/cursor-mobile.git
cd cursor-mobile
npm install
npm run check  # TypeScript check
```

Open a PR with your changes!

---

## 📝 License

MIT License — see [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

Built with:
- Node.js + TypeScript + Express
- Chrome DevTools Protocol
- WebSocket for real-time sync
- Modern PWA standards

Inspired by the need to control Cursor from anywhere.

---

## 💬 Support

- 📖 [Read the full installation guide](INSTALL.md)
- 🐛 [Report bugs](https://github.com/YOUR-USERNAME/cursor-mobile/issues)
- 💡 [Request features](https://github.com/YOUR-USERNAME/cursor-mobile/issues)

---

**Made with ❤️ for the Cursor community**
