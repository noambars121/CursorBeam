# Voice Input Setup for PWA

This guide explains how to enable voice transcription in the Cursor Mobile PWA.

## Requirements

Voice input (Whisper transcription) requires **HTTPS** to work in PWA mode. This is a browser security requirement.

## Quick Setup

### 1. Enable HTTPS in `.env`:

```env
USE_HTTPS=true
BIND_ADDR=0.0.0.0
```

### 2. Generate Self-Signed Certificate

The server will auto-generate a self-signed certificate on first run, saved to:
```
~/.cursor-mobile-certs/server.key
~/.cursor-mobile-certs/server.cert
```

### 3. Accept Security Warning

When you first open the app in your browser:
1. You'll see a "Not Secure" or "Certificate Error" warning
2. Click "Advanced" → "Proceed to site" (Chrome/Edge)
3. Or "Accept the Risk" (Firefox)

### 4. Install as PWA

After accepting the certificate:
1. Open the site in your mobile browser
2. Tap the menu (⋮) → "Add to Home Screen" or "Install"
3. Open the installed PWA

## Voice Input Usage

1. Tap the 🎤 microphone button next to the + button
2. Allow microphone permissions when prompted
3. Speak your prompt (tap again to stop)
4. Wait for transcription (~5-10 seconds for 20-second audio)
5. Transcribed text appears in the input field

## Supported Languages

The Whisper-base model supports 99 languages including:
- English
- Hebrew (עברית)
- Arabic (العربية)
- Spanish, French, German, Russian, Chinese, etc.

Language is auto-detected.

## Troubleshooting

### "Cannot access microphone"
- Ensure you're using HTTPS (`https://...`)
- Check browser microphone permissions (Settings → Site permissions)
- On Android: Settings → Apps → Browser → Permissions → Microphone

### "Microphone not supported"
- Make sure you're accessing via `https://` not `http://`
- Try a different browser (Chrome/Edge recommended)

### Certificate errors on mobile
If the browser won't let you proceed with self-signed certificate:
1. Use [mkcert](https://github.com/FiloSottile/mkcert) to create a trusted cert:
   ```bash
   mkcert -install
   mkcert -key-file ~/.cursor-mobile-certs/server.key \
          -cert-file ~/.cursor-mobile-certs/server.cert \
          localhost 192.168.1.* ::1
   ```
2. Or use a service like [ngrok](https://ngrok.com/) for instant HTTPS tunneling

## Performance

- **First load**: Downloads ~150MB model (one-time, cached)
- **Transcription**: 5-10 seconds for 20-second audio on mid-range phone
- **Accuracy**: Very good for Hebrew and English

## Technical Details

- Uses [Transformers.js](https://huggingface.co/docs/transformers.js) with Whisper-base model
- Runs entirely in browser (no API keys needed)
- Model cached in browser IndexedDB after first download
- Works offline after model is cached
