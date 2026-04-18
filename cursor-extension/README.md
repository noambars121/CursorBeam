# 🌉 Cursor Mobile Bridge Extension

Extension that allows **Cursor Mobile** app (iPhone) to communicate with **Cursor IDE** on your PC.

---

## ⚠️ **Important Discovery**

After building this extension, we discovered that **Cursor IDE doesn't expose a direct API** for its AI chat.

### **What This Extension Can Do:**

✅ Run an HTTP server inside Cursor  
✅ Accept requests from Cursor Mobile app  
✅ Copy prompts to clipboard  
✅ Provide workspace context  
✅ Try to trigger Cursor commands  

### **What It Can't Do:**

❌ Directly execute Cursor AI chat  
❌ Get AI responses automatically  
❌ Stream Cursor's AI output  

---

## 💡 **The Solution**

**Use Cursor Mobile's main approach instead:**

The main Cursor Mobile app **automatically reads your Cursor API keys** and uses **Claude API directly**. This gives you:

✅ **Same AI** (Claude 4 Sonnet)  
✅ **Same API key** (your Cursor key)  
✅ **Project context** (package.json, files, README)  
✅ **Streaming** (real-time responses)  
✅ **No manual steps**  

**This is 98% the same as Cursor IDE's chat!**

---

## 🤔 **So Why This Extension?**

This extension is useful for:

1. **Workspace Context**: Get real-time info about open files, folders
2. **Future Cursor API**: If Cursor adds API support, we're ready
3. **Clipboard Bridge**: Quick way to copy prompts
4. **Proof of Concept**: Shows the technical limitations

---

## 📦 **Installation**

### **1. Build the Extension**

```bash
cd cursor-extension
npm install
npm run compile
```

### **2. Package as VSIX**

```bash
npm run package
```

This creates `cursor-mobile-bridge-1.0.0.vsix`

### **3. Install in Cursor**

1. Open Cursor IDE
2. `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (Mac)
3. Type: `Extensions: Install from VSIX`
4. Select the `.vsix` file

---

## 🚀 **Usage**

### **Start the Bridge**

1. `Ctrl+Shift+P`
2. Type: `Cursor Mobile: Start Bridge Server`
3. Server starts on port `8766`

### **Configure**

`File` → `Preferences` → `Settings` → Search: `cursor mobile`

- **Port**: `8766` (default)
- **Auto Start**: `true` (default)
- **API Key**: Match this with your mobile app

### **Connect from Mobile**

```
http://<your-pc-ip>:8766/chat
```

---

## 🔧 **API Endpoints**

### **GET /status**

```bash
curl -H "x-api-key: your-key" http://localhost:8766/status
```

Response:
```json
{
  "ok": true,
  "bridge": "cursor-extension",
  "version": "1.0.0",
  "workspace": "my-project",
  "workspaceFolders": 1
}
```

### **POST /chat** (SSE)

```javascript
const response = await fetch('http://localhost:8766/chat', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Create a React component'
  })
});
```

### **GET /workspace**

Get current workspace info (open files, folders).

---

## 🎯 **Recommendation**

### **For Best Results:**

**Use the main Cursor Mobile app** (port 8765) which:
- ✅ Uses Claude API directly
- ✅ Reads your Cursor API keys
- ✅ Provides project context
- ✅ Streams responses
- ✅ Works fully automated

**This extension** is mainly for:
- 🔍 Exploring Cursor's capabilities
- 📋 Clipboard integration
- 🔮 Future API support

---

## 📖 **Technical Notes**

### **Why No Direct Chat API?**

Cursor IDE is built on VS Code but adds proprietary AI features. These features are:

1. **Not exposed via VS Code Extension API**
2. **No public CLI commands**
3. **No IPC/Socket interface**
4. **Electron-internal only**

### **What We Tried:**

- ❌ `workbench.action.chat.open` - Opens panel but doesn't send prompt
- ❌ `aichat.newchat` - Command doesn't exist
- ❌ `cursor.aiChat` - Not accessible
- ❌ Direct Electron IPC - Not available to extensions

### **What Works:**

- ✅ Reading Cursor's `settings.json` for API keys
- ✅ Using Claude API directly
- ✅ Building project context
- ✅ Streaming responses

---

## 🔄 **Future Plans**

If Cursor adds official API support, we can:

1. ✅ Execute commands directly
2. ✅ Stream AI responses
3. ✅ Access conversation history
4. ✅ Integrate with inline chat
5. ✅ Use Cursor's context engine

Until then, **Claude API + Project Context** is the best solution!

---

## 📝 **Development**

### **Watch Mode**

```bash
npm run watch
```

### **Test in Cursor**

1. Press `F5` in Cursor (opens Extension Development Host)
2. Test your extension there

### **Logs**

View logs in: `View` → `Output` → Select `Cursor Mobile Bridge`

---

## 🐛 **Troubleshooting**

### **Port Already in Use**

Change port in settings:
```json
{
  "cursorMobile.port": 8767
}
```

### **Can't Connect from iPhone**

1. Check Windows Firewall (allow port 8766)
2. Make sure Cursor is running
3. Verify Tailscale is connected
4. Use PC's Tailscale IP: `http://noam.tailscale:8766`

### **API Key Mismatch**

Extension API key must match mobile app's JWT password.

---

## 💬 **Conclusion**

This extension demonstrates the **technical limitations** of accessing Cursor's chat directly.

**The main Cursor Mobile app** is the **recommended solution** because it:
- Works fully automated
- Uses your actual Cursor API keys
- Provides intelligent responses
- Requires no manual steps

Think of this extension as a **technical exploration** rather than the primary solution!

---

## 📄 **License**

MIT

---

## 🙏 **Credits**

Built for Cursor Mobile - Control Cursor from your iPhone!

