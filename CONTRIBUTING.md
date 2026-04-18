# 🤝 Contributing to Cursor Mobile

Thank you for considering contributing! This project welcomes contributions from everyone.

---

## 🚀 Quick Start for Contributors

```powershell
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/cursor-mobile.git
cd cursor-mobile

# 3. Install dependencies
npm install

# 4. Create .env for testing
copy .env.example .env
# Edit .env with your settings

# 5. Start development
npm run v2:start
```

---

## 🏗️ Project Structure

```
cursor-mobile/
├── v2/                      # Main application (V2 architecture)
│   ├── start.ts            # Entry point - launches Cursor + relay
│   ├── relay-server.ts     # HTTP + WebSocket server
│   ├── state-manager.ts    # CDP state polling & diffing
│   ├── cdp-client.ts       # Chrome DevTools Protocol client
│   ├── client.html         # PWA frontend (single-file)
│   ├── dom-extractor.ts    # Chat extraction (runs in Cursor)
│   ├── auth.ts             # Password hashing & JWT
│   ├── mode-utils.ts       # Mode conversion (internal ↔ public)
│   ├── project-manager.ts  # Project detection & switching
│   ├── edit-dom-probe.ts   # Edit flow probing
│   └── supervisor.ts       # Optional: supervisor service
│
├── install.ps1             # GUI installer
├── setup.ps1               # CLI setup script
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript config
└── README.md               # Project documentation
```

---

## 🛠️ Development Workflow

### Running the Server

```powershell
# Start with auto-reload (watches for file changes)
npm run dev

# Or start normally
npm run v2:start
```

### Type Checking

```powershell
# Check TypeScript types
npm run check
```

### Testing

```powershell
# Run edit flow tests
npm run v2:test:edit
```

---

## 📝 Code Style

### TypeScript Guidelines

- Use **explicit types** for public APIs
- Avoid `any` - use `unknown` and type guards
- Document complex functions with JSDoc comments
- Keep functions focused and single-purpose

### Naming Conventions

- **Files:** kebab-case (`state-manager.ts`)
- **Classes:** PascalCase (`CdpStateManager`)
- **Functions:** camelCase (`extractCursorState`)
- **Constants:** UPPER_SNAKE_CASE (`CDP_PORT`)

### Comments

- Write comments that explain **why**, not what
- Document tricky DOM selectors with Cursor version info
- Add TODO comments for known limitations

---

## 🐛 Reporting Bugs

### Before Opening an Issue

1. **Check existing issues** - your bug might already be reported
2. **Update to latest** - pull latest `main` and test again
3. **Check logs** - look at the relay server output

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what happened.

**To Reproduce**
Steps to reproduce:
1. Open Cursor Mobile
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: Windows 10/11
- Node version: (run `node --version`)
- Cursor version: (from Help → About)
- Tailscale: Yes/No

**Logs**
```
Paste relevant server output here
```
```

---

## ✨ Suggesting Features

We love new ideas! When suggesting features:

1. **Explain the use case** - why is this useful?
2. **Describe the solution** - how would it work?
3. **Consider alternatives** - are there other ways?
4. **Think about edge cases** - what could go wrong?

---

## 🔀 Pull Request Process

### 1. Create a Feature Branch

```powershell
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Write clean, documented code
- Test your changes thoroughly
- Update documentation if needed

### 3. Commit Your Changes

```powershell
git add .
git commit -m "feat: add amazing feature"
```

Commit message format:
- `feat:` - new feature
- `fix:` - bug fix
- `docs:` - documentation only
- `style:` - formatting, no code change
- `refactor:` - code refactoring
- `test:` - adding tests
- `chore:` - maintenance

### 4. Push and Create PR

```powershell
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub with:
- Clear description of what changed
- Why the change is needed
- Screenshots (if UI changed)
- Testing steps

---

## 🧪 Testing Guidelines

### Manual Testing Checklist

Before submitting a PR, test:

- [ ] Server starts without errors
- [ ] PWA loads and shows UI
- [ ] Login works with correct password
- [ ] Messages send and appear
- [ ] Tool approvals work
- [ ] Mode switching works
- [ ] Project switching works (if V2_PROJECTS_ROOT set)
- [ ] Terminal commands execute
- [ ] Message editing works
- [ ] Full history loading works

### Testing on Different Setups

If possible, test on:
- Different Windows versions (10, 11)
- With/without Tailscale
- Different network configurations
- Different Cursor versions

---

## 🎨 UI/UX Contributions

When contributing UI changes:

1. **Mobile-first** - design for small screens
2. **Performance** - minimize reflows and repaints
3. **Accessibility** - proper ARIA labels, keyboard nav
4. **RTL support** - test with Hebrew UI
5. **Dark mode** - use CSS variables

---

## 🔍 Areas That Need Help

### High Priority
- 🍎 **macOS/Linux support** - adapt Windows-specific code
- 🧪 **Automated tests** - more test coverage
- 🎨 **UI polish** - animations, better loading states
- 📱 **PWA features** - offline mode, push notifications

### Medium Priority
- 🌍 **Internationalization** - support more languages
- 🔌 **Plugin system** - extensibility for custom features
- 📊 **Analytics/logging** - better debugging tools
- 🎯 **Performance** - optimize DOM extraction

### Nice to Have
- 🖼️ **Screenshots in docs** - visual installation guide
- 📹 **Demo video** - show the app in action
- 🎓 **Tutorials** - advanced usage guides
- 🤖 **CI/CD** - automated testing and releases

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## 💬 Questions?

- Open a Discussion on GitHub
- Tag maintainers in your PR
- Ask in Issues (label: question)

---

## 🙏 Thank You!

Every contribution helps make Cursor Mobile better for everyone.

**Contributors will be listed in CONTRIBUTORS.md**

Happy coding! 🚀
