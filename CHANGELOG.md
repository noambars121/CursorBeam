# Changelog

All notable changes to Cursor Mobile will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] - 2026-04-18

### 🎉 Initial Release

#### Added
- **Complete Cursor control from mobile PWA**
  - Agent, Ask, Plan, Debug modes
  - Send prompts and view responses
  - Approve/reject tool calls
  - Edit human messages (branch conversations)
  - Restore checkpoints
  
- **Terminal access**
  - Execute commands remotely
  - View live terminal output
  - Switch between terminal tabs
  - Terminal presets

- **Project management**
  - Auto-detect projects in workspace
  - Quick project switching
  - Active project indicator

- **Model selection**
  - View current model
  - Switch between available models
  - Model picker UI

- **Rich content rendering**
  - Markdown with syntax highlighting
  - Code blocks with proper formatting
  - Tables (GFM support)
  - Tool call cards (Cursor-style)
  - Collapsible thinking blocks
  - Image attachments in messages

- **Chat history**
  - Scroll-to-load older messages
  - "Load all history" button
  - Smooth scroll preservation
  - Virtualization support

- **Authentication & Security**
  - Password-based login
  - JWT session tokens
  - Local-only by default
  - No cloud dependencies

- **Installation**
  - GUI installer with Windows Forms
  - Automatic Tailscale installation
  - Autostart configuration
  - One-click setup

- **Documentation**
  - Comprehensive README
  - Installation guide (INSTALL.md)
  - Quick start guide in Hebrew (QUICKSTART.md)
  - Tailscale setup guide (TAILSCALE-GUIDE.md)
  - Contributing guidelines

#### Technical Details
- Chrome DevTools Protocol for Cursor control
- WebSocket for real-time state sync
- DOM extraction with smart selectors
- Incremental rendering with msgKey diffing
- Async function serialization with __name shim
- Thinking block expansion before extraction
- Multi-jump scroll for faster history loading

---

## [Unreleased]

### Planned Features
- macOS and Linux support
- Offline mode
- Push notifications
- More keyboard shortcuts
- Video/audio attachment support
- Export chat to markdown
- Custom themes

---

**Legend:**
- `Added` - New features
- `Changed` - Changes in existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Security fixes
