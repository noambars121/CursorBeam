# CursorBeam Installer

This folder contains everything needed to build a professional Windows installer for CursorBeam.

## What You Get

The installer (`CursorBeam-Setup-v1.0.0.exe`) includes:

- ✅ **Beautiful Setup Wizard** - Professional installation experience
- ✅ **Bundled Node.js** - No prerequisites needed
- ✅ **Auto-Configuration** - Password generation, path detection
- ✅ **Windows Service** - Optional background service installation
- ✅ **Desktop Shortcuts** - One-click launch
- ✅ **Uninstaller** - Clean removal via Control Panel
- ✅ **Tailscale Integration** - Optional remote access setup

## Building the Installer

### Prerequisites

- Windows 10/11
- PowerShell 5.1 or later

### Build Steps

```powershell
# Navigate to installer folder
cd installer

# Run the build script
.\build-installer.ps1
```

The script will:
1. ✅ Download Inno Setup (if not installed)
2. ✅ Download portable Node.js
3. ✅ Create necessary assets
4. ✅ Compile the installer
5. ✅ Output: `dist/CursorBeam-Setup-v1.0.0.exe`

### Output

The installer will be created in `../dist/`:
```
CursorBeam-Setup-v1.0.0.exe  (~50-80 MB)
```

## Installer Features

### Setup Wizard Pages

1. **Welcome** - Introduction and overview
2. **License** - Terms and conditions
3. **Destination** - Installation directory
4. **Password** - Generate or enter login password
5. **Cursor Path** - Auto-detected Cursor location
6. **Projects Folder** - Optional workspace directory
7. **Components** - Choose installation options:
   - Windows Service (recommended)
   - Desktop shortcut
   - Tailscale support
8. **Installation** - Progress with real-time updates
9. **Finish** - Launch options

### Installation Process

The installer performs these steps:
1. Copies application files
2. Installs bundled Node.js
3. Runs `npm install` for dependencies
4. Creates `.env` configuration
5. Sets up Cursor CDP shortcut
6. Installs Windows Service (if selected)
7. Opens Tailscale download (if selected)
8. Creates Start Menu shortcuts

### Uninstallation

Users can uninstall via:
- Control Panel → Programs and Features
- Start Menu → CursorBeam → Uninstall
- Original installer → Uninstall option

The uninstaller:
- Stops Windows Service
- Removes all files
- Deletes shortcuts
- Cleans registry entries

## Customization

### Branding

Edit `setup.iss` to customize:
- App name and version
- Publisher information
- Icons and images
- Welcome message
- License text

### Installation Options

Modify `[Tasks]` section in `setup.iss`:
```pascal
[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"
Name: "installservice"; Description: "Install Windows Service"
Name: "installtailscale"; Description: "Setup Tailscale"
```

### Post-Install Actions

Customize `post-install.ps1` for additional setup:
- Create custom shortcuts
- Configure firewall rules
- Set up scheduled tasks
- Launch browser

## Distribution

### Upload to Website

```html
<a href="CursorBeam-Setup-v1.0.0.exe" download>
  Download CursorBeam Installer
</a>
```

### GitHub Releases

The installer is automatically uploaded to GitHub Releases when you tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Direct Download Link

```
https://github.com/noambars121/CursorBeam/releases/latest/download/CursorBeam-Setup-v1.0.0.exe
```

## Troubleshooting

### "Inno Setup not found"

The build script auto-installs Inno Setup. If it fails:

1. Download manually: https://jrsoftware.org/isdl.php
2. Install to default location
3. Run build script again

### "Node.js download failed"

Check internet connection and try again. The script downloads:
- Node.js v22.11.0 (latest LTS)
- ~50MB download

### "Compilation failed"

Check `setup.iss` for syntax errors:
```powershell
# Validate script
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /? setup.iss
```

## Advanced Usage

### Silent Installation

```cmd
CursorBeam-Setup-v1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

### Custom Install Directory

```cmd
CursorBeam-Setup-v1.0.0.exe /DIR="C:\MyApps\CursorBeam"
```

### Skip Service Installation

```cmd
CursorBeam-Setup-v1.0.0.exe /TASKS="!installservice"
```

## Technical Details

### Technologies Used

- **Inno Setup 6** - Installer creation
- **PowerShell** - Post-install configuration
- **Node.js Portable** - Bundled runtime
- **GitHub Actions** - Automated builds

### File Structure

```
installer/
├── setup.iss              # Inno Setup script
├── post-install.ps1       # Configuration script
├── build-installer.ps1    # Build automation
└── README.md              # This file

Generated:
├── dist/
│   └── CursorBeam-Setup-v1.0.0.exe
├── tools/
│   └── node-portable/     # Bundled Node.js
└── assets/
    ├── icon.ico           # App icon
    ├── wizard-image.bmp   # Sidebar image
    └── wizard-small.bmp   # Header image
```

## Next Steps

After building:

1. **Test the installer** on a clean Windows VM
2. **Sign the executable** with a code signing certificate
3. **Upload to GitHub** releases
4. **Share the download link** with users

## Support

For issues with the installer:
- Check [Troubleshooting Guide](../TROUBLESHOOTING.md)
- Open an issue on GitHub
- Review Inno Setup documentation

## License

Same as CursorBeam main project.
