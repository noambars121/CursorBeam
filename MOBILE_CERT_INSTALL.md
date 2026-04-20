# Install Trusted Certificate on Mobile

To completely remove the security warning on mobile devices, install the mkcert root CA.

## Android

1. **Export the root CA:**
   ```powershell
   mkcert -CAROOT
   ```
   This shows the certificate location (e.g., `C:\Users\Noam\AppData\Local\mkcert`)

2. **Copy `rootCA.pem` to your phone** (via USB, cloud, or email)

3. **On Android:**
   - Open Settings → Security → Encryption & credentials
   - Tap "Install a certificate" → "CA certificate"
   - Select the `rootCA.pem` file
   - Give it a name like "mkcert Local CA"

4. **Restart browser and PWA** - no more warnings!

## iOS

1. **Export and email yourself `rootCA.pem`** (from the CAROOT location above)

2. **On iPhone:**
   - Open the email and tap the `rootCA.pem` attachment
   - Tap "Allow" when prompted to download profile
   - Go to Settings → General → VPN & Device Management
   - Tap the "mkcert" profile → "Install"
   - Enter your passcode
   - Tap "Install" again

3. **Enable full trust:**
   - Go to Settings → General → About → Certificate Trust Settings
   - Enable "mkcert root certificate"

4. **Restart Safari and PWA** - no more warnings!

---

## Note

You only need to do this if you want zero warnings. Otherwise, accepting the certificate once in the browser is enough - the PWA will remember it.
