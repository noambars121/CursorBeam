# Voice Input Quick Start 🎤

Voice transcription is now available in the Cursor Mobile PWA!

## 🚀 Quick Setup (3 steps)

### 1. Generate HTTPS Certificate

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-cert.ps1
```

### 2. Enable HTTPS (already done in `.env`):

```env
USE_HTTPS=true
BIND_ADDR=0.0.0.0
```

### 3. Start Server

```bash
npm start
```

## 📱 Access from Mobile

1. Server will show URLs like:
   ```
   📱 Mobile PWA access:
      https://192.168.1.100:9800
   ```

2. Open URL in mobile browser
3. Accept security warning (self-signed cert)
4. Install as PWA (Add to Home Screen)
5. Open installed PWA
6. Tap 🎤 button to record voice prompts!

## ✨ Features

- **99 languages** supported (Hebrew, English, Arabic, etc.)
- **Runs offline** after first model download (~150MB)
- **Fast transcription** (5-10 seconds for 20-second audio)
- **No API keys** needed - everything runs in browser

## 🔍 Troubleshooting

**"Cannot access microphone"**
- Make sure you're using `https://` not `http://`
- Check browser permissions: Settings → Site permissions → Microphone

**Certificate errors**
- Accept the self-signed certificate warning
- Or use [mkcert](https://github.com/FiloSottile/mkcert) for trusted cert

See [VOICE_SETUP.md](./VOICE_SETUP.md) for detailed documentation.
