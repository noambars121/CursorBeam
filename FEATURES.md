# ✨ Features Overview - סקירת תכונות

מדריך מקיף לכל היכולות של Cursor Mobile.

---

## 💬 Chat Features

### שליחת הודעות
- ✅ שדה טקסט עם תמיכה במולטי-שורות
- ✅ שליחה עם Enter (Shift+Enter לשורה חדשה)
- ✅ הודעות optimistic (מופיע מיד לפני שהשרת מאשר)
- ✅ צילום מסך אוטומטי של ההודעה שנשלחה

### צפייה בשיחות
- ✅ רינדור markdown מלא (כותרות, רשימות, קוד)
- ✅ טבלאות עם גלילה אופקית
- ✅ בלוקי קוד עם syntax highlighting
- ✅ תמיכה ב-RTL (עברית)
- ✅ גלילה חלקה עם auto-scroll
- ✅ שימור מיקום גלילה בזמן טעינת היסטוריה

### Thinking Blocks
- ✅ בלוקים מתקפלים כמו ב-Cursor
- ✅ סיכום + duration
- ✅ תוכן מלא (אם קיים ב-DOM)
- ✅ הרחבה אוטומטית בזמן חילוץ
- ✅ placeholder בעברית כשאין תוכן

### Tool Calls
- ✅ כרטיסים בסגנון Cursor
- ✅ כותרת עם תג שפה צבעוני (TS, JS, HTML, וכו')
- ✅ שם קובץ וספירת שורות
- ✅ תצוגת diff עם שורות ירוקות
- ✅ אינדיקציה "ממתין לאישור"
- ✅ גלילה בתוך כרטיס (עד 220 שורות)

### תמונות
- ✅ הצגת תמונות מצורפות להודעות
- ✅ תצוגה מקדימה לפני שליחה
- ✅ מחיקת תמונה לפני שליחה
- ✅ תמיכה במספר תמונות

---

## ✏️ Message Editing

### עריכת הודעה אנושית
- ✅ Long-press על הודעה → תפריט עריכה
- ✅ הטקסט מועבר לשדה עריכה מיוחד
- ✅ שליחה מפעילה branch/continue dialog ב-Cursor
- ✅ בחירה בין Branch / Continue / Cancel
- ✅ הטקסט המעודכן מוחלף בצ'אט

### Restore Checkpoint
- ✅ זיהוי אוטומטי של checkpoint controls ב-DOM
- ✅ כפתור "שחזור checkpoint" באינטרפייס
- ✅ דיאלוג אישור עם preview של הטקסט
- ✅ ביצוע החזרה מרחוק
- ✅ תמיכה במגוון מבני DOM של Cursor

---

## 🎨 Modes

### מעבר בין Modes
- ✅ Agent / Ask / Plan / Debug
- ✅ מעבר בלחיצה אחת
- ✅ סנכרון עם Cursor
- ✅ אינדיקטור ויזואלי של ה-mode הפעיל

### Mode-specific Features
- ✅ Agent: כפתור stop כשגנרטיבי
- ✅ Ask: read-only mode
- ✅ Plan: תכנון לפני ביצוע
- ✅ Debug: debugging workflow

---

## 🤖 Model Management

### בחירת מודל
- ✅ רשימת כל המודלים הזמינים
- ✅ מעבר מהיר בין מודלים
- ✅ שמירת העדפה אוטומטית
- ✅ אינדיקטור של המודל הנוכחי
- ✅ תמיכה ב-auto mode

### מודלים נתמכים
- Claude (כל הגרסאות)
- GPT (4, 4.5, וכו')
- Gemini
- מודלים מותאמים אישית

---

## 📂 Project Management

### מעבר בין פרויקטים
- ✅ סריקה אוטומטית של תיקיית projects
- ✅ רשימה ממוינת א-ב
- ✅ אינדיקטור של הפרויקט הפעיל
- ✅ פתיחה מהירה של פרויקט ב-Cursor
- ✅ שמירת context בין מעברים

### זיהוי פרויקט פעיל
- ✅ זיהוי אוטומטי מ-window title
- ✅ עדכון real-time ב-header
- ✅ סנכרון עם switcher

---

## 💻 Terminal Features

### ביצוע פקודות
- ✅ שליחת פקודות מרחוק
- ✅ תמיכה ב-Enter אוטומטי
- ✅ שמירת היסטוריה
- ✅ פלט real-time
- ✅ תמיכה ב-ANSI colors

### ניהול טרמינלים
- ✅ מעבר בין טאבים
- ✅ פתיחת טרמינל חדש
- ✅ kill process פעיל
- ✅ זיהוי טרמינל פעיל

### Terminal Presets
- ✅ שמירת פקודות נפוצות
- ✅ ביצוע בלחיצה אחת
- ✅ עריכת presets
- ✅ מחיקת presets
- ✅ סגירה/פתיחה של רשימת presets

---

## 📜 Chat History

### טעינת היסטוריה
- ✅ גלילה למעלה → טעינה אוטומטית
- ✅ כפתור "טען כל ההיסטוריה"
- ✅ גלילה חכמה (5 קפיצות × 2.8 מסכים)
- ✅ שימור מיקום גלילה
- ✅ זיהוי "הגענו לתחילה"
- ✅ מניעת מרוצים (throttle + cooldown)

### Smooth Scrolling
- ✅ Passive event listeners
- ✅ requestAnimationFrame throttling
- ✅ Hardware acceleration hints
- ✅ Overflow anchoring
- ✅ Double rAF for layout stability

---

## 🔐 Security & Auth

### Authentication
- ✅ Password-based login
- ✅ bcrypt password hashing
- ✅ JWT session tokens (7-day expiry)
- ✅ Secure token storage (localStorage)
- ✅ Auto-logout on invalid token

### Network Security
- ✅ Local-only by default (127.0.0.1)
- ✅ CORS protection
- ✅ Rate limiting (optional)
- ✅ No data leaves your machine
- ✅ Tailscale for secure remote access

---

## 🎨 UI/UX Features

### Mobile-First Design
- ✅ Responsive layout
- ✅ Touch-optimized controls
- ✅ Safe area support (notch/home indicator)
- ✅ Dark theme
- ✅ Native iOS/Android feel

### Interactions
- ✅ Pull-to-refresh (where applicable)
- ✅ Swipe gestures
- ✅ Long-press menus
- ✅ Haptic feedback (where supported)
- ✅ Keyboard support (when visible)

### Visual Polish
- ✅ Smooth animations
- ✅ Loading indicators
- ✅ Optimistic UI updates
- ✅ Connection status dot
- ✅ Activity labels (responding, waiting, etc.)

---

## 🔄 Real-Time Sync

### WebSocket Events
- ✅ Bidirectional communication
- ✅ State change broadcasts
- ✅ Terminal updates
- ✅ Auto-reconnect on disconnect
- ✅ Grace period before showing "disconnected"

### State Management
- ✅ Incremental DOM diffing
- ✅ msgKey-based reconciliation
- ✅ Minimal re-renders
- ✅ Efficient memory usage

---

## 🛠️ Advanced Features

### DOM Extraction
- ✅ Runs inside Cursor's renderer via CDP
- ✅ Extracts [data-flat-index] elements
- ✅ Parses markdown-root HTML
- ✅ Detects tool approvals
- ✅ Identifies checkpoint controls
- ✅ Shadow DOM traversal
- ✅ Thinking block expansion

### Edit Flow
- ✅ Detects branch/continue dialogs
- ✅ Multiple dialog patterns supported
- ✅ Polls with exponential backoff
- ✅ Handles dialog timeouts
- ✅ Supports choice selection

### Project Detection
- ✅ Scans V2_PROJECTS_ROOT
- ✅ Ignores node_modules, .git, etc.
- ✅ Detects active from window title
- ✅ Fast-glob for performance

---

## 📦 Installation Features

### GUI Installer
- ✅ Windows Forms interface
- ✅ RTL support (Hebrew)
- ✅ Password generator
- ✅ Cursor path auto-detection
- ✅ File browser for manual selection
- ✅ Tailscale installation option
- ✅ Autostart configuration
- ✅ Progress indicators
- ✅ Completion summary with URLs

### Autostart
- ✅ Creates startup shortcut
- ✅ Hidden window execution
- ✅ Launches on Windows boot
- ✅ Easy to disable (delete shortcut)

### Configuration
- ✅ .env file generation
- ✅ Secure password generation
- ✅ Network detection (LAN + Tailscale)
- ✅ Batch file for easy starting

---

## 🌐 Network Features

### Connection Options
- ✅ localhost (testing)
- ✅ LAN (same WiFi)
- ✅ Tailscale (remote, secure)
- ✅ Auto-detect all IPs

### Firewall Handling
- ✅ Instructions for opening ports
- ✅ PowerShell commands provided
- ✅ Troubleshooting in docs

---

## 📱 PWA Capabilities

### Progressive Web App
- ✅ Installable to home screen
- ✅ Standalone mode (no browser UI)
- ✅ App manifest with icons
- ✅ iOS safe area support
- ✅ Android navigation bar handling

### Offline Graceful Degradation
- ✅ "Server offline" screen
- ✅ Retry connection button
- ✅ Preserved state when reconnecting
- ✅ Visual feedback for all states

---

## 🧰 Developer Tools

### Debugging
- ✅ Comprehensive logging
- ✅ Health check endpoint
- ✅ State extraction endpoint
- ✅ Terminal diagnostics
- ✅ CDP connection status

### Development Scripts
- ✅ `npm run check` - TypeScript validation
- ✅ `npm run dev` - Auto-reload server
- ✅ Test scripts for edit flow
- ✅ POC scripts for experimentation

---

## 📚 Documentation

### User Documentation
- ✅ README.md - Project overview
- ✅ QUICKSTART.md - Hebrew quick start
- ✅ INSTALL.md - Detailed installation
- ✅ TAILSCALE-GUIDE.md - Remote access setup
- ✅ TROUBLESHOOTING.md - Problem solving
- ✅ הוראות-מהירות.txt - Hebrew cheat sheet

### Developer Documentation
- ✅ CONTRIBUTING.md - Contribution guide
- ✅ CHANGELOG.md - Version history
- ✅ Code comments throughout
- ✅ Architecture diagrams in README

---

## 🚀 Performance

### Optimizations
- ✅ Incremental rendering (only changed messages)
- ✅ Virtual scrolling awareness
- ✅ Passive scroll listeners
- ✅ requestAnimationFrame throttling
- ✅ Efficient WebSocket broadcasts
- ✅ DOM fragment builds
- ✅ replaceChildren for full refreshes

### Resource Usage
- ✅ ~50-100MB RAM (Node server)
- ✅ <5% CPU when idle
- ✅ ~10-20% CPU when active
- ✅ Minimal battery impact on phone

---

## 🔮 Upcoming Features

### Planned (v1.1+)
- [ ] Multi-user support
- [ ] Chat search
- [ ] Export chat to markdown
- [ ] Voice input
- [ ] Keyboard shortcuts customization
- [ ] Custom themes
- [ ] Notification sounds

### Under Consideration
- [ ] Desktop app (Electron wrapper)
- [ ] Browser extension
- [ ] API for third-party integrations
- [ ] Webhooks
- [ ] Scheduled commands

---

## 🎯 Use Cases

### Home Office
✅ Control Cursor from your phone while away from desk  
✅ Quick code reviews on mobile  
✅ Monitor long-running tasks  

### Remote Work
✅ Access home machine from anywhere (Tailscale)  
✅ Emergency fixes while traveling  
✅ Check on CI/CD from phone  

### Collaboration
✅ Share screen during video calls  
✅ Live demo without switching windows  
✅ Pair programming assistance  

### Productivity
✅ Bed/couch coding (don't judge!)  
✅ Quick responses while AFK  
✅ Mobile-first workflows  

---

## 🏆 Why Cursor Mobile?

### vs. Remote Desktop
- ✅ **Faster** - only syncs chat state, not full screen
- ✅ **Mobile-optimized** - designed for touch
- ✅ **Lower latency** - direct CDP access
- ✅ **Better UX** - native mobile feel

### vs. Cursor's Official Mobile App
- ✅ **Available now** - no waiting for official release
- ✅ **Customizable** - open source, modify as needed
- ✅ **Private** - no cloud, no tracking
- ✅ **Full control** - access all Cursor features

### vs. VNC/TeamViewer
- ✅ **No software on phone** - just a PWA
- ✅ **Better mobile UX** - touch-friendly interface
- ✅ **Lower bandwidth** - text only, no video
- ✅ **Free** - no subscriptions

---

## 💎 Unique Features

### Only in Cursor Mobile

1. **Phone Edit Mode** - dedicated editing flow from mobile
2. **Terminal Presets** - save and execute common commands
3. **Load All History** - one-click full chat loading
4. **Checkpoint Restore** - mobile-friendly checkpoint UI
5. **Tool Card Rendering** - Cursor-style diffs on mobile
6. **Hebrew UI** - full RTL support

---

## 🎓 Power User Tips

### Faster Workflows
- Install as PWA for instant access
- Use Tailscale for anywhere access
- Set up terminal presets for common tasks
- Use "Load all history" before important reviews

### Best Practices
- Keep the server running 24/7 (autostart)
- Use strong password (16+ chars)
- Regularly update (git pull)
- Monitor server logs for issues

### Hidden Features
- Swipe hamburger menu for quick actions
- Long-press messages for edit menu
- Pull down chat slightly to trigger history load
- Double-tap status to force refresh (coming soon)

---

**Discover more features as you use CursorBeam! 🚀**

Have a feature request? [Open an issue!](https://github.com/noambars121/CursorBeam/issues/new)
