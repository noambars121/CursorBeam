<div align="center">

# CursorBeam

### Remote Control Cursor IDE from Any Device

**Professional mobile-first PWA for controlling Cursor IDE from your phone, tablet, or any browser**

[![GitHub Stars](https://img.shields.io/github/stars/noambars121/CursorBeam?style=social)](https://github.com/noambars121/CursorBeam/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/noambars121/CursorBeam?style=social)](https://github.com/noambars121/CursorBeam/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/noambars121/CursorBeam)](https://github.com/noambars121/CursorBeam/issues)
[![GitHub Release](https://img.shields.io/github/v/release/noambars121/CursorBeam)](https://github.com/noambars121/CursorBeam/releases)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-010101?logo=socketdotio&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Tailscale](https://img.shields.io/badge/Tailscale-242424?logo=tailscale&logoColor=white)](https://tailscale.com/)

[Features](#features) •
[Quick Start](#quick-start) •
[Documentation](#documentation) •
[Architecture](#architecture) •
[Contributing](#contributing)

</div>

---

## Overview

**CursorBeam** is a production-ready remote control system for Cursor IDE that enables you to control your desktop IDE from any mobile device or browser. Built with security, performance, and user experience as top priorities.

### Key Capabilities

- **Full IDE Control**: Agent, Ask, Plan, and Debug modes accessible from mobile
- **Real-time Sync**: WebSocket-based bidirectional communication with sub-100ms latency
- **Terminal Access**: Execute commands, manage processes, and view live output
- **Secure by Design**: Password-protected with bcrypt hashing and JWT authentication
- **Zero Cloud Dependencies**: All data stays on your local network
- **Enterprise VPN Support**: Optional Tailscale integration for remote access

---

## Features

<table>
<tr>
<td width="50%">

### Core Functionality

![](https://img.shields.io/badge/Chat-Enabled-success?style=flat-square)
![](https://img.shields.io/badge/Terminal-Enabled-success?style=flat-square)
![](https://img.shields.io/badge/Projects-Enabled-success?style=flat-square)

- Full Cursor chat interface
- Message editing and branching
- Tool approval/rejection
- Checkpoint restoration
- Multi-project support
- Model switching
- Chat history loading

</td>
<td width="50%">

### Mobile Experience

![](https://img.shields.io/badge/PWA-Installable-blue?style=flat-square)
![](https://img.shields.io/badge/Touch-Optimized-blue?style=flat-square)
![](https://img.shields.io/badge/Offline-Ready-blue?style=flat-square)

- Progressive Web App
- Touch-optimized interface
- Dark theme (OLED optimized)
- Markdown & code highlighting
- Thinking blocks
- Pull-to-refresh
- Home screen installation

</td>
</tr>
<tr>
<td width="50%">

### Security

![](https://img.shields.io/badge/Auth-bcrypt+JWT-red?style=flat-square)
![](https://img.shields.io/badge/Network-Local_Only-red?style=flat-square)

- Password authentication
- JWT session tokens
- Encrypted connections
- No telemetry
- No cloud storage
- Open source (audit-friendly)

</td>
<td width="50%">

### Performance

![](https://img.shields.io/badge/Latency-<100ms-green?style=flat-square)
![](https://img.shields.io/badge/Memory-<100MB-green?style=flat-square)

- WebSocket real-time sync
- Incremental DOM updates
- Efficient state diffing
- Hardware acceleration
- Minimal battery impact
- Low bandwidth usage

</td>
</tr>
</table>

---

## Quick Start

### Prerequisites

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)
![Cursor](https://img.shields.io/badge/Cursor-Latest-000000?logo=cursor&logoColor=white)
![OS](https://img.shields.io/badge/OS-Windows-0078D6?logo=windows&logoColor=white)

### Installation

#### Option 1: GUI Installer (Recommended)

```powershell
# Clone repository
git clone https://github.com/noambars121/CursorBeam.git
cd CursorBeam

# Run GUI installer
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer will:
- ![](https://img.shields.io/badge/-Install_dependencies-informational?style=flat-square)
- ![](https://img.shields.io/badge/-Generate_secure_password-informational?style=flat-square)
- ![](https://img.shields.io/badge/-Auto_detect_Cursor-informational?style=flat-square)
- ![](https://img.shields.io/badge/-Create_Cursor_CDP_shortcut-informational?style=flat-square) ⚡ **Auto-configures Cursor for remote control**
- ![](https://img.shields.io/badge/-Select_projects_folder-informational?style=flat-square)
- ![](https://img.shields.io/badge/-Optional_Tailscale_installation-informational?style=flat-square)
- ![](https://img.shields.io/badge/-Install_as_Windows_Service-informational?style=flat-square) (daemon with auto-start)

> **⚡ IMPORTANT**: After installation, always use the new **"Cursor (CursorBeam)"** shortcut on your desktop. This shortcut enables remote control. Your old Cursor shortcuts won't work with CursorBeam.

#### Option 2: Command Line

```powershell
# Clone and setup
git clone https://github.com/noambars121/CursorBeam.git
cd CursorBeam
npm run setup

# Start server
npm start
```

### Starting Cursor

⚡ **IMPORTANT**: Always launch Cursor using the **"Cursor (CursorBeam)"** shortcut created on your desktop. This shortcut:
- Enables Chrome DevTools Protocol (CDP) for remote control
- Opens your projects folder automatically
- Allows CursorBeam to communicate with Cursor

> Your old Cursor shortcuts won't work with CursorBeam!

### Connecting from Mobile

1. **Start Cursor**: Use the **"Cursor (CursorBeam)"** desktop shortcut
2. **On same WiFi**: `http://YOUR-LOCAL-IP:9800`
3. **With Tailscale**: `http://YOUR-TAILSCALE-IP:9800`
4. **Login** with your password
5. **Install as PWA**: Add to Home Screen for app-like experience

---

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────────┐
│                     │         │                      │         │                     │
│   Mobile Client     │◄───WS───┤   Relay Server       │◄───CDP──┤   Cursor IDE        │
│   (PWA)             │  :9800  │   (Node.js/Express)  │  :9222  │   (Electron)        │
│                     │         │                      │         │                     │
└─────────────────────┘         └──────────────────────┘         └─────────────────────┘
         ▲                                                                 ▲
         │                                                                 │
         │                    Tailscale VPN (Optional)                    │
         └─────────────────────────────────────────────────────────────────┘
                         Encrypted Mesh Network
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JS | PWA client with zero dependencies |
| **Communication** | WebSocket, CDP | Real-time bidirectional sync |
| **Backend** | Node.js, Express, TypeScript | Relay server and state management |
| **Security** | bcrypt, JWT, helmet | Authentication and protection |
| **Network** | Tailscale (optional) | Secure remote access |

### How It Works

1. **Cursor IDE** launches with Chrome DevTools Protocol enabled on port 9222
2. **Relay Server** connects via CDP to extract and monitor IDE state
3. **State Manager** performs efficient diffing and broadcasts changes
4. **WebSocket** pushes updates to all connected PWA clients
5. **PWA** renders UI and sends user actions back through the chain

---

## Documentation

| Document | Description |
|----------|-------------|
| ![](https://img.shields.io/badge/QUICKSTART-Hebrew-blue?style=flat-square) [QUICKSTART.md](QUICKSTART.md) | Fast setup guide (Hebrew) |
| ![](https://img.shields.io/badge/INSTALL-English-green?style=flat-square) [INSTALL.md](INSTALL.md) | Detailed installation |
| ![](https://img.shields.io/badge/SERVICE-Windows_Daemon-brightgreen?style=flat-square) [SERVICE.md](SERVICE.md) | Windows Service setup |
| ![](https://img.shields.io/badge/TAILSCALE-Installation-purple?style=flat-square) [INSTALL_TAILSCALE.md](INSTALL_TAILSCALE.md) | Tailscale setup guide |
| ![](https://img.shields.io/badge/TAILSCALE-Usage-purple?style=flat-square) [TAILSCALE-GUIDE.md](TAILSCALE-GUIDE.md) | Remote access guide (Hebrew) |
| ![](https://img.shields.io/badge/TROUBLESHOOTING-Help-orange?style=flat-square) [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Problem solving |
| ![](https://img.shields.io/badge/FEATURES-Complete-yellow?style=flat-square) [FEATURES.md](FEATURES.md) | Full feature list |
| ![](https://img.shields.io/badge/CONTRIBUTING-Guidelines-red?style=flat-square) [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

---

## Use Cases

<table>
<tr>
<td>

### ![](https://img.shields.io/badge/Home_Office-Use_Case-informational?style=flat-square)

- Control IDE from couch/bed
- Quick code reviews on tablet
- Monitor long-running tasks
- Emergency fixes while AFK

</td>
<td>

### ![](https://img.shields.io/badge/Remote_Work-Use_Case-informational?style=flat-square)

- Access home machine globally
- Secure VPN-based connection
- No port forwarding needed
- Low bandwidth requirements

</td>
</tr>
<tr>
<td>

### ![](https://img.shields.io/badge/Productivity-Use_Case-informational?style=flat-square)

- Mobile-first workflows
- Quick responses on-the-go
- Context switching reduction
- Multi-device development

</td>
<td>

### ![](https://img.shields.io/badge/Collaboration-Use_Case-informational?style=flat-square)

- Live demo from phone
- Pair programming assist
- Screen sharing alternative
- Remote code reviews

</td>
</tr>
</table>

---

## Security

![Security](https://img.shields.io/badge/Security-First-critical?style=for-the-badge)

### Authentication
- **Password Hashing**: bcrypt with 10 rounds
- **Session Management**: JWT tokens with 7-day expiry
- **Token Storage**: Secure localStorage with HTTPS-only flag

### Network Security
- **Default Binding**: 127.0.0.1 (localhost only)
- **CORS Protection**: Configurable origin whitelist
- **Rate Limiting**: Built-in DDoS protection
- **Helmet.js**: Security headers enabled

### Data Privacy
- **No Cloud**: All data stays on your machine
- **No Telemetry**: Zero analytics or tracking
- **No Third-party**: No external API calls
- **Open Source**: Fully auditable codebase

### Tailscale Security
- **WireGuard**: Modern VPN protocol
- **End-to-end Encryption**: Your devices only
- **Zero Trust**: No central servers see your traffic
- **ACL Support**: Fine-grained access control

---

## Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| ![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white) | 18.0.0+ | LTS recommended |
| ![Cursor](https://img.shields.io/badge/Cursor-Latest-000000?logo=cursor&logoColor=white) | Latest | Windows support only (v1.0) |
| ![Browser](https://img.shields.io/badge/Browser-Modern-orange?logo=googlechrome&logoColor=white) | iOS Safari 14+, Android Chrome 90+ | PWA support required |
| ![Tailscale](https://img.shields.io/badge/Tailscale-Optional-242424?logo=tailscale&logoColor=white) | Latest | For remote access |

### Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| ![Windows](https://img.shields.io/badge/Windows-Supported-0078D6?logo=windows&logoColor=white) | Full Support | v1.0+ |
| ![macOS](https://img.shields.io/badge/macOS-Planned-999999?logo=apple&logoColor=white) | Coming Soon | v1.1+ |
| ![Linux](https://img.shields.io/badge/Linux-Planned-FCC624?logo=linux&logoColor=black) | Coming Soon | v1.1+ |

---

## Performance Benchmarks

| Metric | Value | Notes |
|--------|-------|-------|
| **Latency** | <100ms | Local network |
| **Memory** | ~50-100MB | Node.js process |
| **CPU (idle)** | <5% | Polling at 1.5s intervals |
| **CPU (active)** | 10-20% | During chat/terminal use |
| **Bandwidth** | ~5-10 KB/s | Idle state sync |
| **Battery Impact** | Minimal | Passive listeners, rAF throttling |

---

## Troubleshooting

### Quick Fixes

| Issue | Solution |
|-------|----------|
| ![](https://img.shields.io/badge/Can't_Connect-Firewall-red?style=flat-square) | Allow port 9800: `New-NetFirewallRule -LocalPort 9800 -Protocol TCP -Action Allow` |
| ![](https://img.shields.io/badge/Port_In_Use-Kill_Process-red?style=flat-square) | Find PID: `netstat -ano \| findstr 9800` then `taskkill /F /PID <PID>` |
| ![](https://img.shields.io/badge/PWA_Not_Updating-Clear_Cache-orange?style=flat-square) | Clear site data and reinstall PWA |
| ![](https://img.shields.io/badge/Slow_Loading-Reduce_Polling-yellow?style=flat-square) | Increase `POLL_MS` in `.env` to 2000-3000 |

**Full guide:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## Contributing

![Contributions](https://img.shields.io/badge/Contributions-Welcome-success?style=for-the-badge)

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas Needing Help

- ![macOS](https://img.shields.io/badge/-macOS_Support-blue?style=flat-square)
- ![Linux](https://img.shields.io/badge/-Linux_Support-blue?style=flat-square)
- ![Tests](https://img.shields.io/badge/-Automated_Tests-green?style=flat-square)
- ![UI](https://img.shields.io/badge/-UI_Polish-purple?style=flat-square)
- ![Docs](https://img.shields.io/badge/-Documentation-orange?style=flat-square)
- ![i18n](https://img.shields.io/badge/-Translations-red?style=flat-square)

---

## Roadmap

### v1.1 (Planned)
- ![](https://img.shields.io/badge/-macOS_Support-brightgreen?style=flat-square)
- ![](https://img.shields.io/badge/-Linux_Support-brightgreen?style=flat-square)
- ![](https://img.shields.io/badge/-Chat_Search-yellow?style=flat-square)
- ![](https://img.shields.io/badge/-Voice_Input-orange?style=flat-square)

### v1.2 (Future)
- ![](https://img.shields.io/badge/-Multi_User-blue?style=flat-square)
- ![](https://img.shields.io/badge/-Plugin_System-purple?style=flat-square)
- ![](https://img.shields.io/badge/-Desktop_App-lightgrey?style=flat-square)

---

## License

![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

Built with modern web technologies:

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Tailscale](https://img.shields.io/badge/Tailscale-242424?style=for-the-badge&logo=tailscale&logoColor=white)](https://tailscale.com/)

---

## Support

<div align="center">

[![GitHub Issues](https://img.shields.io/badge/Bug_Reports-GitHub_Issues-red?style=for-the-badge&logo=github)](https://github.com/noambars121/CursorBeam/issues)
[![GitHub Discussions](https://img.shields.io/badge/Feature_Requests-GitHub_Discussions-blue?style=for-the-badge&logo=github)](https://github.com/noambars121/CursorBeam/discussions)
[![Email](https://img.shields.io/badge/Email-noambars121@gmail.com-green?style=for-the-badge&logo=gmail&logoColor=white)](mailto:noambars121@gmail.com)

---

### Star History

[![Star History Chart](https://api.star-history.com/svg?repos=noambars121/CursorBeam&type=Date)](https://star-history.com/#noambars121/CursorBeam&Date)

---

**Made with ![](https://img.shields.io/badge/♥-red?style=flat-square) by [Noam Barsheshet](https://www.barsbuild.me)**

**For the Cursor IDE Community**

[![GitHub](https://img.shields.io/github/stars/noambars121/CursorBeam?style=social)](https://github.com/noambars121/CursorBeam)

</div>
