# ⚡ CursorBeam

**Beam your Cursor IDE to any device** - Control Cursor from your phone with a secure, mobile-first PWA that works anywhere with Tailscale.

[![GitHub](https://img.shields.io/badge/GitHub-CursorBeam-blue?logo=github)](https://github.com/noambars121/CursorBeam)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ Features

- 🚀 **Full Cursor Control** - Agent, Ask, Plan, Debug modes
- 💬 **Real-time Chat** - Send prompts, view responses with markdown/code blocks
- 🔧 **Tool Management** - Approve/reject file operations remotely
- ✏️ **Message Editing** - Branch conversations from your phone
- 💻 **Terminal Access** - Execute commands with presets
- 📂 **Project Switching** - Quick project selection
- 🤖 **Model Selection** - Switch AI models on the fly
- 📜 **Chat History** - Load and browse full conversation history
- 🎨 **Mobile-First UI** - Beautiful, touch-optimized interface
- 🔐 **Secure** - Password-protected, local-only by default
- 🌐 **Remote Access** - Optional Tailscale integration for anywhere access
- 📱 **PWA** - Install to home screen, works like a native app

---

## 🚀 Quick Start

### Option 1: Installer with GUI (Recommended)

```powershell
# 1. Clone the repo
git clone https://github.com/noambars121/CursorBeam.git
cd CursorBeam

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
git clone https://github.com/noambars121/CursorBeam.git
cd CursorBeam
npm run setup

# 2. Start the server
npm start
```

**📱 See [QUICKSTART.md](QUICKSTART.md) for step-by-step instructions in Hebrew**

---

## 🎯 How It Works

```
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│   Phone     │◄─WebSocket─┤  Relay      │◄───CDP───┤   Cursor    │
│   (PWA)     │   (9800)   │  Server     │  (9222)  │    IDE      │
└─────────────┘           └─────────────┘           └─────────────┘
     ↑                                                      ↑
     │                      (optional)                      │
     └─────────────────── Tailscale VPN ──────────────────┘
```

1. **Cursor** runs with Chrome DevTools Protocol enabled
2. **Relay Server** extracts chat state via CDP and syncs it
3. **PWA** connects via WebSocket for real-time updates
4. **Tailscale** (optional) provides secure remote access

---

## 📚 Documentation

- 📖 **[QUICKSTART.md](QUICKSTART.md)** - Fast setup guide in Hebrew
- 🛠️ **[INSTALL.md](INSTALL.md)** - Detailed installation instructions
- 🌐 **[TAILSCALE-GUIDE.md](TAILSCALE-GUIDE.md)** - Remote access setup
- 🔧 **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Problem solving
- ✨ **[FEATURES.md](FEATURES.md)** - Complete feature list
- 🤝 **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines

---

## 🎨 Screenshots

### Mobile Interface
- Clean, dark theme optimized for OLED screens
- Touch-friendly controls and gestures
- Cursor-style tool cards with syntax highlighting
- Collapsible thinking blocks

### Terminal
- Execute commands remotely
- Save command presets
- Live output streaming

### Project Management
- Quick project switching
- Active project indicator
- Auto-detection from workspace

---

## 🔐 Security

- **Password-protected** - bcrypt hashing with JWT tokens
- **Local-only by default** - No cloud dependencies
- **Optional remote access** - Tailscale provides secure VPN
- **No tracking** - Your data never leaves your machine

---

## 🛠️ Requirements

- **Node.js** 18+ (for the relay server)
- **Cursor IDE** (Windows - macOS/Linux coming soon)
- **Modern browser** on phone (iOS Safari / Android Chrome)
- **Tailscale** (optional, for remote access)

---

## 🌟 Use Cases

### Home Office
Control Cursor from your phone while away from desk

### Remote Work
Access your home machine from anywhere with Tailscale

### Productivity
Quick responses while AFK, mobile-first workflows

### Collaboration
Share screen during video calls without switching windows

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

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas that need help:
- macOS/Linux support
- Automated tests
- UI improvements
- Documentation translations

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:
- Chrome DevTools Protocol for Cursor control
- WebSocket for real-time sync
- Tailscale for secure remote access
- Love and caffeine ☕

---

## 📞 Support

- 🐛 **Bug reports:** [GitHub Issues](https://github.com/noambars121/CursorBeam/issues)
- 💡 **Feature requests:** [GitHub Discussions](https://github.com/noambars121/CursorBeam/discussions)
- 📧 **Email:** noambars121@gmail.com

---

## ⭐ Star History

If you find CursorBeam useful, please give it a star on GitHub!

**Made with ❤️ for the Cursor community**
